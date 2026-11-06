import express from 'express';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import {
  DIRS,
  queryAll,
  queryOne,
  executeSql,
  getLastInsertId,
  runInTransaction,
  hashPassword,
  verifyPassword,
  logActivity,
  getUserPermissions,
  recalculateAllStatuses,
  recalculateSingleInvoice,
  createDatabaseBackup,
  restoreDatabaseFromBackup,
} from '../db';

export interface AuthRequest extends express.Request {
  user?: {
    id: number;
    username: string;
    email: string;
    full_name: string;
    role_id: number;
    role_name: string;
    must_change_password: number;
    permissions: string[];
  };
}

export function requireAuth(req: AuthRequest, res: express.Response, next: express.NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required. Please log in.' });
  }
  const token = authHeader.slice(7).trim();
  const session = queryOne<{ user_id: number; expires_at: string }>(
    'SELECT user_id, expires_at FROM sessions WHERE token = ?',
    [token]
  );

  if (!session) {
    return res.status(401).json({ error: 'Invalid or expired session. Please log in again.' });
  }

  if (new Date(session.expires_at).getTime() < Date.now()) {
    executeSql('DELETE FROM sessions WHERE token = ?', [token]);
    return res.status(401).json({ error: 'Session expired. Please log in again.' });
  }

  const user = queryOne<{
    id: number;
    username: string;
    email: string;
    full_name: string;
    role_id: number;
    status: string;
    must_change_password: number;
  }>('SELECT id, username, email, full_name, role_id, status, must_change_password FROM users WHERE id = ? AND is_deleted = 0', [
    session.user_id,
  ]);

  if (!user) {
    return res.status(401).json({ error: 'User account not found.' });
  }

  if (user.status !== 'Active') {
    return res.status(403).json({ error: 'Your user account has been disabled by an Administrator.' });
  }

  const role = queryOne<{ name: string }>('SELECT name FROM roles WHERE id = ?', [user.role_id]);
  const permissions = getUserPermissions(user.id);

  req.user = {
    ...user,
    role_name: role?.name || 'User',
    permissions,
  };

  next();
}

export function requirePermission(permCode: string) {
  return (req: AuthRequest, res: express.Response, next: express.NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    if (req.user.role_name === 'Admin' || req.user.permissions.includes(permCode)) {
      return next();
    }
    return res.status(403).json({
      error: `Permission denied: You need '${permCode}' permission to perform this action.`,
    });
  };
}

export function requireAdmin(req: AuthRequest, res: express.Response, next: express.NextFunction) {
  if (!req.user || req.user.role_name !== 'Admin') {
    return res.status(403).json({ error: 'Access denied: Administrator privileges required.' });
  }
  next();
}

export function registerAuthAndAdminRoutes(router: express.Router) {
  // Public branding info for login screen
  router.get('/public/company-branding', (_req, res) => {
    const company = queryOne<any>('SELECT company_name, logo_data, city, phone, email FROM company_settings WHERE id = 1');
    const appSettings = queryOne<any>('SELECT currency_symbol, first_run_completed FROM app_settings WHERE id = 1');
    res.json({ company, appSettings });
  });

  // Login
  router.post('/auth/login', (req, res) => {
    try {
      const { identifier, password, remember } = req.body;
      if (!identifier || !password) {
        return res.status(400).json({ error: 'Please enter both username/email and password.' });
      }

      const user = queryOne<any>(
        'SELECT * FROM users WHERE (LOWER(username) = LOWER(?) OR LOWER(email) = LOWER(?)) AND is_deleted = 0',
        [String(identifier).trim(), String(identifier).trim()]
      );

      if (!user) {
        logActivity(null, 'Unrecognized User', 'Failed Login', 'Authentication', null, 'Unknown Account', 'Failed login attempt: account not found');
        return res.status(401).json({ error: 'Invalid username/email or password.' });
      }

      if (user.status !== 'Active') {
        logActivity(user.id, user.username, 'Blocked Login', 'Authentication', user.id, user.username, 'Attempted login on disabled account');
        return res.status(403).json({ error: 'This account is disabled. Please contact your system administrator.' });
      }

      const valid = verifyPassword(String(password), user.password_hash, user.password_salt);
      if (!valid) {
        logActivity(user.id, user.username, 'Failed Login', 'Authentication', user.id, user.username, 'Invalid password entered');
        return res.status(401).json({ error: 'Invalid username/email or password.' });
      }

      const token = crypto.randomBytes(32).toString('hex');
      const now = new Date();
      const days = remember ? 30 : 2;
      const expiresAt = new Date(now.getTime() + days * 24 * 3600 * 1000).toISOString();

      runInTransaction(() => {
        executeSql('INSERT INTO sessions (token, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)', [
          token,
          user.id,
          expiresAt,
          now.toISOString(),
        ]);

        executeSql('UPDATE users SET last_login = ? WHERE id = ?', [now.toISOString(), user.id]);
        logActivity(user.id, user.username, 'User Logged In', 'Authentication', user.id, user.full_name, `Logged in successfully (${remember ? 'Remembered session' : 'Standard session'})`);
      });

      const role = queryOne<{ name: string }>('SELECT name FROM roles WHERE id = ?', [user.role_id]);
      const permissions = getUserPermissions(user.id);

      res.json({
        token,
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          full_name: user.full_name,
          role_id: user.role_id,
          role_name: role?.name || 'User',
          status: user.status,
          must_change_password: user.must_change_password,
          permissions,
        },
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Login failed' });
    }
  });

  // Current session
  router.get('/auth/me', requireAuth, (req: AuthRequest, res) => {
    const company = queryOne<any>('SELECT * FROM company_settings WHERE id = 1');
    const appSettings = queryOne<any>('SELECT * FROM app_settings WHERE id = 1');
    res.json({ user: req.user, company, appSettings });
  });

  // Logout
  router.post('/auth/logout', requireAuth, (req: AuthRequest, res) => {
    const token = req.headers.authorization?.slice(7).trim();
    if (token) {
      executeSql('DELETE FROM sessions WHERE token = ?', [token]);
    }
    logActivity(req.user!.id, req.user!.username, 'User Logged Out', 'Authentication', req.user!.id, req.user!.full_name, 'Logged out of session');
    res.json({ message: 'Logged out successfully' });
  });

  // Change password
  router.post('/auth/change-password', requireAuth, (req: AuthRequest, res) => {
    const { currentPassword, newPassword } = req.body;
    if (!newPassword || String(newPassword).length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters.' });
    }
    const dbUser = queryOne<any>('SELECT * FROM users WHERE id = ?', [req.user!.id]);
    if (!dbUser) return res.status(404).json({ error: 'User not found.' });

    if (currentPassword && !verifyPassword(String(currentPassword), dbUser.password_hash, dbUser.password_salt)) {
      return res.status(400).json({ error: 'Current password is incorrect.' });
    }

    const { hash, salt } = hashPassword(String(newPassword));
    const now = new Date().toISOString();
    runInTransaction(() => {
      executeSql(
        'UPDATE users SET password_hash = ?, password_salt = ?, must_change_password = 0, updated_at = ? WHERE id = ?',
        [hash, salt, now, req.user!.id]
      );
      executeSql('UPDATE app_settings SET first_run_completed = 1, updated_at = ? WHERE id = 1', [now]);
      logActivity(req.user!.id, req.user!.username, 'Password Changed', 'Authentication', req.user!.id, req.user!.username, 'Updated account password');
    });
    res.json({ message: 'Password updated successfully.' });
  });

  // Users & Roles Management
  router.get('/users', requireAuth, requirePermission('users.manage'), (_req, res) => {
    const users = queryAll<any>(`
      SELECT u.id, u.username, u.email, u.full_name, u.phone, u.designation, u.role_id, r.name as role_name,
             u.status, u.must_change_password, u.custom_permissions_json, u.last_login,
             u.created_by, u.created_at, u.updated_at
      FROM users u
      LEFT JOIN roles r ON r.id = u.role_id
      WHERE u.is_deleted = 0
      ORDER BY u.id ASC
    `);
    const roles = queryAll<any>('SELECT * FROM roles ORDER BY id ASC');
    const permissions = queryAll<any>('SELECT * FROM permissions ORDER BY id ASC');
    const rolePermissions = queryAll<any>('SELECT * FROM role_permissions');

    const enrichedUsers = users.map((u) => ({
      ...u,
      effective_permissions: getUserPermissions(u.id),
    }));

    res.json({ users: enrichedUsers, roles, permissions, rolePermissions });
  });

  router.post('/users', requireAuth, requirePermission('users.manage'), (req: AuthRequest, res) => {
    try {
      const { username, email, full_name, phone, designation, password, role_id, status, custom_permissions } = req.body;
      if (!username || !full_name || !password || !role_id) {
        return res.status(400).json({ error: 'Username, full name, password, and role are required.' });
      }
      const cleanUsername = String(username).trim();
      const cleanEmail = email && String(email).trim() ? String(email).trim() : `${cleanUsername}@daftarpro.local`;

      const existing = queryOne(
        'SELECT id FROM users WHERE (LOWER(username) = LOWER(?) OR LOWER(email) = LOWER(?)) AND is_deleted = 0',
        [cleanUsername, cleanEmail]
      );
      if (existing) {
        return res.status(400).json({ error: 'An active user/employee with this username or email already exists.' });
      }

      const { hash, salt } = hashPassword(String(password));
      const now = new Date().toISOString();
      const customPermsJson = Array.isArray(custom_permissions) ? JSON.stringify(custom_permissions) : null;

      runInTransaction(() => {
        executeSql(
          `INSERT INTO users (username, email, full_name, phone, designation, password_hash, password_salt, role_id, status, must_change_password, custom_permissions_json, created_by, updated_by, created_at, updated_at, is_deleted)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, 0)`,
          [
            cleanUsername,
            cleanEmail,
            String(full_name).trim(),
            phone ? String(phone).trim() : '',
            designation ? String(designation).trim() : '',
            hash,
            salt,
            Number(role_id),
            status || 'Active',
            customPermsJson,
            req.user!.username,
            req.user!.username,
            now,
            now,
          ]
        );
        const newId = getLastInsertId();
        executeSql('INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)', [newId, Number(role_id)]);
        logActivity(req.user!.id, req.user!.username, 'User / Employee Created', 'Users', newId, cleanUsername, `Created user/employee ${full_name} (${cleanUsername})`);
      });

      res.json({ message: 'User / Employee created successfully.' });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.put('/users/:id', requireAuth, requirePermission('users.manage'), (req: AuthRequest, res) => {
    try {
      const userId = Number(req.params.id);
      const { username, email, full_name, phone, designation, password, role_id, status, custom_permissions } = req.body;
      const existing = queryOne<any>('SELECT * FROM users WHERE id = ?', [userId]);
      if (!existing) return res.status(404).json({ error: 'User not found.' });

      if (userId === 1 && status === 'Disabled') {
        return res.status(400).json({ error: 'Primary System Administrator account cannot be disabled.' });
      }

      const cleanUsername = String(username || existing.username).trim();
      const cleanEmail = email && String(email).trim() ? String(email).trim() : `${cleanUsername}@daftarpro.local`;
      const now = new Date().toISOString();
      const customPermsJson = Array.isArray(custom_permissions) ? JSON.stringify(custom_permissions) : null;

      runInTransaction(() => {
        if (password && String(password).trim().length > 0) {
          const { hash, salt } = hashPassword(String(password));
          executeSql(
            `UPDATE users SET username = ?, email = ?, full_name = ?, phone = ?, designation = ?, password_hash = ?, password_salt = ?, role_id = ?, status = ?, custom_permissions_json = ?, updated_by = ?, updated_at = ? WHERE id = ?`,
            [
              cleanUsername,
              cleanEmail,
              String(full_name).trim(),
              phone !== undefined ? String(phone).trim() : existing.phone || '',
              designation !== undefined ? String(designation).trim() : existing.designation || '',
              hash,
              salt,
              Number(role_id),
              status || 'Active',
              customPermsJson,
              req.user!.username,
              now,
              userId,
            ]
          );
        } else {
          executeSql(
            `UPDATE users SET username = ?, email = ?, full_name = ?, phone = ?, designation = ?, role_id = ?, status = ?, custom_permissions_json = ?, updated_by = ?, updated_at = ? WHERE id = ?`,
            [
              cleanUsername,
              cleanEmail,
              String(full_name).trim(),
              phone !== undefined ? String(phone).trim() : existing.phone || '',
              designation !== undefined ? String(designation).trim() : existing.designation || '',
              Number(role_id),
              status || 'Active',
              customPermsJson,
              req.user!.username,
              now,
              userId,
            ]
          );
        }

        if (status === 'Disabled') {
          executeSql('DELETE FROM sessions WHERE user_id = ?', [userId]);
        }

        logActivity(req.user!.id, req.user!.username, 'User / Employee Updated', 'Users', userId, cleanUsername, `Updated user/employee ${full_name} (Status: ${status})`);
      });

      res.json({ message: 'User / Employee updated successfully.' });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.delete('/users/:id', requireAuth, requirePermission('users.manage'), (req: AuthRequest, res) => {
    try {
      const userId = Number(req.params.id);
      const existing = queryOne<any>('SELECT * FROM users WHERE id = ? AND is_deleted = 0', [userId]);
      if (!existing) return res.status(404).json({ error: 'User / Employee not found.' });

      if (userId === 1) {
        return res.status(400).json({ error: 'Primary System Administrator account cannot be deleted.' });
      }
      if (userId === req.user!.id) {
        return res.status(400).json({ error: 'You cannot delete your own currently logged-in account.' });
      }

      const now = new Date().toISOString();
      const reason = req.body?.reason || 'Moved to Trash';
      const { password_hash: _ph, password_salt: _ps, ...safeUserSnapshot } = existing;

      runInTransaction(() => {
        executeSql('UPDATE users SET is_deleted = 1, status = ?, updated_by = ?, updated_at = ? WHERE id = ?', [
          'Disabled',
          req.user!.username,
          now,
          userId,
        ]);
        executeSql('DELETE FROM sessions WHERE user_id = ?', [userId]);
        executeSql(
          `INSERT INTO trash (original_id, record_type, record_label, record_data_json, deleted_by, deleted_by_name, deleted_at, reason)
           VALUES (?, 'User', ?, ?, ?, ?, ?, ?)`,
          [
            userId,
            `${existing.full_name} (${existing.username})${existing.designation ? ` — ${existing.designation}` : ''}`,
            JSON.stringify(safeUserSnapshot),
            req.user!.id,
            req.user!.username,
            now,
            reason,
          ]
        );
        logActivity(
          req.user!.id,
          req.user!.username,
          'User / Employee Deleted (Trash)',
          'Users',
          userId,
          existing.username,
          `Moved user/employee ${existing.full_name} (${existing.username}) to Trash`
        );
      });

      res.json({ message: 'User / Employee moved to Trash.' });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.put('/roles/:id/permissions', requireAuth, requirePermission('users.manage'), (req: AuthRequest, res) => {
    try {
      const roleId = Number(req.params.id);
      const { permission_codes, name, description } = req.body;
      const role = queryOne<any>('SELECT * FROM roles WHERE id = ?', [roleId]);
      if (!role) return res.status(404).json({ error: 'Role not found.' });
      if (role.name === 'Admin') {
        return res.status(400).json({ error: 'Admin role retains full system permissions.' });
      }

      const now = new Date().toISOString();
      runInTransaction(() => {
        if (name) {
          executeSql('UPDATE roles SET name = ?, description = ?, updated_at = ? WHERE id = ?', [
            String(name).trim(),
            description || role.description,
            now,
            roleId,
          ]);
        }
        executeSql('DELETE FROM role_permissions WHERE role_id = ?', [roleId]);
        const allPerms = queryAll<{ id: number; code: string }>('SELECT id, code FROM permissions');
        const codesSet = new Set(Array.isArray(permission_codes) ? permission_codes : []);
        for (const p of allPerms) {
          if (codesSet.has(p.code)) {
            executeSql('INSERT INTO role_permissions (role_id, permission_id) VALUES (?, ?)', [roleId, p.id]);
          }
        }
        logActivity(req.user!.id, req.user!.username, 'Role Permissions Updated', 'Roles', roleId, role.name, `Updated permissions for role ${role.name}`);
      });

      res.json({ message: 'Role permissions saved.' });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/roles', requireAuth, requirePermission('users.manage'), (req: AuthRequest, res) => {
    try {
      const { name, description, permission_codes } = req.body;
      if (!name) return res.status(400).json({ error: 'Role name is required.' });
      const now = new Date().toISOString();
      runInTransaction(() => {
        executeSql('INSERT INTO roles (name, description, is_system, created_at, updated_at) VALUES (?, ?, 0, ?, ?)', [
          String(name).trim(),
          description || '',
          now,
          now,
        ]);
        const newRoleId = getLastInsertId();
        const allPerms = queryAll<{ id: number; code: string }>('SELECT id, code FROM permissions');
        const codesSet = new Set(Array.isArray(permission_codes) ? permission_codes : []);
        for (const p of allPerms) {
          if (codesSet.has(p.code)) {
            executeSql('INSERT INTO role_permissions (role_id, permission_id) VALUES (?, ?)', [newRoleId, p.id]);
          }
        }
        logActivity(req.user!.id, req.user!.username, 'Role Created', 'Roles', newRoleId, String(name), `Created custom role ${name}`);
      });
      res.json({ message: 'Role created successfully.' });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.delete('/roles/:id', requireAuth, requirePermission('users.manage'), (req: AuthRequest, res) => {
    try {
      const roleId = Number(req.params.id);
      const role = queryOne<any>('SELECT * FROM roles WHERE id = ?', [roleId]);
      if (!role) return res.status(404).json({ error: 'Role not found.' });
      if (role.is_system) {
        return res.status(400).json({ error: 'System default roles cannot be deleted.' });
      }
      const assignedCount = queryOne<{ cnt: number }>('SELECT COUNT(*) as cnt FROM users WHERE role_id = ? AND is_deleted = 0', [roleId]);
      if (assignedCount && assignedCount.cnt > 0) {
        return res.status(400).json({ error: 'Cannot delete role while active users are assigned to it.' });
      }

      runInTransaction(() => {
        executeSql('DELETE FROM role_permissions WHERE role_id = ?', [roleId]);
        executeSql('DELETE FROM roles WHERE id = ?', [roleId]);
        logActivity(req.user!.id, req.user!.username, 'Role Deleted', 'Roles', roleId, role.name, `Deleted custom role ${role.name}`);
      });

      res.json({ message: 'Custom role deleted.' });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Company & App Settings
  router.get('/settings', requireAuth, (_req, res) => {
    const company = queryOne<any>('SELECT * FROM company_settings WHERE id = 1');
    const appSettings = queryOne<any>('SELECT * FROM app_settings WHERE id = 1');
    res.json({ company, appSettings, dataDir: DIRS.root });
  });

  router.put('/settings', requireAuth, requirePermission('settings.manage'), (req: AuthRequest, res) => {
    try {
      const { company, appSettings } = req.body;
      const now = new Date().toISOString();

      runInTransaction(() => {
        if (company) {
          executeSql(
            `UPDATE company_settings SET
              company_name = ?, logo_data = ?, phone = ?, whatsapp = ?, address = ?, city = ?,
              email = ?, website = ?, tax_number = ?, bank_name = ?, bank_account_title = ?,
              bank_account_number = ?, bank_iban = ?, invoice_prefix = ?, next_invoice_number = ?,
              receipt_prefix = ?, next_receipt_number = ?, default_invoice_paragraph = ?,
              default_invoice_notes = ?, default_invoice_terms = ?,
              signature_data = ?, stamp_data = ?, show_signature = ?, show_stamp = ?,
              signature_position = ?, stamp_position = ?,
              role1_title = ?, role1_name = ?, role1_signature_data = ?,
              role2_title = ?, role2_name = ?, role2_signature_data = ?,
              role3_title = ?, role3_name = ?, role3_signature_data = ?,
              default_payment_due_days = ?,
              updated_by = ?, updated_at = ?
             WHERE id = 1`,
            [
              company.company_name || 'DaftarPro Coworking',
              company.logo_data ?? '',
              company.phone ?? '',
              company.whatsapp ?? '',
              company.address ?? '',
              company.city ?? 'Lahore',
              company.email ?? '',
              company.website ?? '',
              company.tax_number ?? '',
              company.bank_name ?? '',
              company.bank_account_title ?? '',
              company.bank_account_number ?? '',
              company.bank_iban ?? '',
              company.invoice_prefix || 'INV-',
              Math.max(1, Number(company.next_invoice_number) || 1),
              company.receipt_prefix || 'RCP-',
              Math.max(1, Number(company.next_receipt_number) || 1),
              company.default_invoice_paragraph ?? '',
              company.default_invoice_notes ?? '',
              company.default_invoice_terms ?? '',
              company.signature_data ?? '',
              company.stamp_data ?? '',
              company.show_signature !== undefined ? (company.show_signature ? 1 : 0) : 1,
              company.show_stamp !== undefined ? (company.show_stamp ? 1 : 0) : 1,
              company.signature_position || 'right',
              company.stamp_position || 'beside-signature',
              company.role1_title || 'Prepared By',
              company.role1_name ?? '',
              company.role1_signature_data ?? '',
              company.role2_title || 'Accountant / Checked By',
              company.role2_name ?? '',
              company.role2_signature_data ?? '',
              company.role3_title || 'Authorized Signatory',
              company.role3_name ?? '',
              company.role3_signature_data ?? '',
              Number(company.default_payment_due_days) || 7,
              req.user!.username,
              now,
            ]
          );
        }

        if (appSettings) {
          executeSql(
            `UPDATE app_settings SET
              currency_code = ?, currency_symbol = ?, date_format = ?, auto_backup_enabled = ?,
              auto_backup_frequency = ?, expiry_warning_days = ?, low_availability_threshold = ?,
              printer_paper_size = ?, first_run_completed = 1, updated_at = ?
             WHERE id = 1`,
            [
              appSettings.currency_code || 'PKR',
              appSettings.currency_symbol || 'Rs.',
              appSettings.date_format || 'DD MMM YYYY',
              appSettings.auto_backup_enabled ? 1 : 0,
              appSettings.auto_backup_frequency || 'Daily',
              Number(appSettings.expiry_warning_days) || 30,
              Number(appSettings.low_availability_threshold) || 2,
              appSettings.printer_paper_size || 'A4',
              now,
            ]
          );
        }

        recalculateAllStatuses();
        logActivity(req.user!.id, req.user!.username, 'Settings Changed', 'Settings', 1, 'Company & Application Settings', 'Updated company profile, invoice numbering, and application preferences');
      });

      res.json({
        message: 'Saved successfully.',
        company: queryOne('SELECT * FROM company_settings WHERE id = 1'),
        appSettings: queryOne('SELECT * FROM app_settings WHERE id = 1'),
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Trash & Restore System
  router.get('/trash', requireAuth, requirePermission('trash.view'), (_req, res) => {
    const items = queryAll<any>('SELECT * FROM trash ORDER BY deleted_at DESC, id DESC');
    res.json({ items });
  });

  router.post('/trash/:id/restore', requireAuth, requirePermission('trash.restore'), (req: AuthRequest, res) => {
    try {
      const trashId = Number(req.params.id);
      const item = queryOne<any>('SELECT * FROM trash WHERE id = ?', [trashId]);
      if (!item) return res.status(404).json({ error: 'Trash record not found.' });

      runInTransaction(() => {
        const type = item.record_type;
        const origId = Number(item.original_id);
        const now = new Date().toISOString();

        if (type === 'Client') {
          executeSql('UPDATE clients SET is_deleted = 0, updated_by = ?, updated_at = ? WHERE id = ?', [req.user!.username, now, origId]);
          const cl = queryOne<any>('SELECT workspace_id, status FROM clients WHERE id = ?', [origId]);
          if (cl?.workspace_id && cl.status === 'Active') {
            executeSql("UPDATE workspaces SET status = 'Occupied', updated_at = ? WHERE id = ?", [now, cl.workspace_id]);
          }
        } else if (type === 'Workspace') {
          executeSql('UPDATE workspaces SET is_deleted = 0, updated_by = ?, updated_at = ? WHERE id = ?', [req.user!.username, now, origId]);
        } else if (type === 'Contract') {
          executeSql('UPDATE contracts SET is_deleted = 0, updated_by = ?, updated_at = ? WHERE id = ?', [req.user!.username, now, origId]);
        } else if (type === 'Invoice') {
          executeSql('UPDATE invoices SET is_deleted = 0, updated_by = ?, updated_at = ? WHERE id = ?', [req.user!.username, now, origId]);
          recalculateSingleInvoice(origId);
        } else if (type === 'Payment') {
          executeSql('UPDATE payments SET is_deleted = 0, updated_by = ?, updated_at = ? WHERE id = ?', [req.user!.username, now, origId]);
          const pay = queryOne<any>('SELECT invoice_id FROM payments WHERE id = ?', [origId]);
          if (pay?.invoice_id) {
            recalculateSingleInvoice(pay.invoice_id);
          }
        } else if (type === 'Expense') {
          executeSql('UPDATE expenses SET is_deleted = 0, updated_by = ?, updated_at = ? WHERE id = ?', [req.user!.username, now, origId]);
        } else if (type === 'User') {
          executeSql("UPDATE users SET is_deleted = 0, status = 'Active', updated_by = ?, updated_at = ? WHERE id = ?", [req.user!.username, now, origId]);
        }

        executeSql('DELETE FROM trash WHERE id = ?', [trashId]);
        recalculateAllStatuses();
        logActivity(
          req.user!.id,
          req.user!.username,
          `${type} Restored`,
          'Trash',
          origId,
          item.record_label,
          `Restored ${type} (${item.record_label}) from Trash with all linked history intact`
        );
      });

      res.json({ message: `${item.record_type} restored successfully.` });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.delete('/trash/:id', requireAuth, requireAdmin, requirePermission('trash.permanent_delete'), (req: AuthRequest, res) => {
    try {
      const trashId = Number(req.params.id);
      const item = queryOne<any>('SELECT * FROM trash WHERE id = ?', [trashId]);
      if (!item) return res.status(404).json({ error: 'Trash record not found.' });

      runInTransaction(() => {
        const type = item.record_type;
        const origId = Number(item.original_id);

        if (type === 'Expense') {
          executeSql('DELETE FROM expenses WHERE id = ? AND is_deleted = 1', [origId]);
        } else if (type === 'Payment') {
          const pay = queryOne<any>('SELECT invoice_id FROM payments WHERE id = ?', [origId]);
          executeSql('DELETE FROM payments WHERE id = ? AND is_deleted = 1', [origId]);
          if (pay?.invoice_id) recalculateSingleInvoice(pay.invoice_id);
        } else if (type === 'Invoice') {
          // Only delete invoice if no active payments exist, otherwise remove from trash view while keeping financial integrity
          const activePayments = queryOne<{ cnt: number }>('SELECT COUNT(*) as cnt FROM payments WHERE invoice_id = ? AND is_deleted = 0', [origId]);
          if (!activePayments || activePayments.cnt === 0) {
            executeSql('DELETE FROM invoice_items WHERE invoice_id = ?', [origId]);
            executeSql('DELETE FROM payments WHERE invoice_id = ? AND is_deleted = 1', [origId]);
            executeSql('DELETE FROM invoices WHERE id = ? AND is_deleted = 1', [origId]);
          }
        } else if (type === 'Contract') {
          executeSql('DELETE FROM contracts WHERE id = ? AND is_deleted = 1', [origId]);
        } else if (type === 'Workspace') {
          const linked = queryOne<{ cnt: number }>(
            'SELECT (SELECT COUNT(*) FROM contracts WHERE workspace_id = ?) + (SELECT COUNT(*) FROM invoices WHERE workspace_id = ?) as cnt',
            [origId, origId]
          );
          if (!linked || linked.cnt === 0) {
            executeSql('DELETE FROM workspaces WHERE id = ? AND is_deleted = 1', [origId]);
          }
        } else if (type === 'Client') {
          const linked = queryOne<{ cnt: number }>(
            'SELECT (SELECT COUNT(*) FROM invoices WHERE client_id = ?) + (SELECT COUNT(*) FROM contracts WHERE client_id = ?) as cnt',
            [origId, origId]
          );
          if (!linked || linked.cnt === 0) {
            executeSql('DELETE FROM clients WHERE id = ? AND is_deleted = 1', [origId]);
          }
        } else if (type === 'User') {
          if (origId !== 1) {
            executeSql('DELETE FROM user_roles WHERE user_id = ?', [origId]);
            executeSql('DELETE FROM users WHERE id = ? AND is_deleted = 1', [origId]);
          }
        }

        executeSql('DELETE FROM trash WHERE id = ?', [trashId]);
        logActivity(
          req.user!.id,
          req.user!.username,
          'Permanent Delete',
          'Trash',
          origId,
          item.record_label,
          `Permanently purged ${type} (${item.record_label}) from Trash`
        );
      });

      res.json({ message: 'Record permanently deleted from Trash.' });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Activity / Audit Logs (Immutable — no delete endpoint)
  router.get('/activity-logs', requireAuth, requirePermission('activity_log.view'), (req, res) => {
    const { search, module } = req.query;
    let sql = 'SELECT * FROM activity_logs WHERE 1=1';
    const params: any[] = [];

    if (module && module !== 'All') {
      sql += ' AND module = ?';
      params.push(String(module));
    }
    if (search) {
      sql += ' AND (username LIKE ? OR action LIKE ? OR record_label LIKE ? OR details LIKE ?)';
      const q = `%${String(search)}%`;
      params.push(q, q, q, q);
    }
    sql += ' ORDER BY created_at DESC, id DESC LIMIT 500';
    const logs = queryAll<any>(sql, params);
    res.json({ logs });
  });

  // Backups Management
  router.get('/backups', requireAuth, (_req, res) => {
    const backups = queryAll<any>('SELECT * FROM backups ORDER BY created_at DESC, id DESC');
    res.json({
      backups,
      backupDirectory: DIRS.backups,
      databasePath: path.join(DIRS.database, 'coworking.db'),
    });
  });

  router.post('/backups', requireAuth, requirePermission('backup.create'), (req: AuthRequest, res) => {
    try {
      const { label } = req.body;
      const backup = createDatabaseBackup('Manual', req.user!.id, req.user!.username, label);
      res.json({ message: 'Database backup created successfully.', backup });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to create backup.' });
    }
  });

  router.post('/backups/:id/restore', requireAuth, requireAdmin, requirePermission('backup.restore'), (req: AuthRequest, res) => {
    try {
      const backupId = Number(req.params.id);
      restoreDatabaseFromBackup(backupId, req.user!.id, req.user!.username);
      res.json({ message: 'Database restored successfully from backup.' });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to restore backup.' });
    }
  });

  router.get('/backups/:id/download', requireAuth, (req, res) => {
    const backup = queryOne<any>('SELECT * FROM backups WHERE id = ?', [Number(req.params.id)]);
    if (!backup) return res.status(404).json({ error: 'Backup not found' });
    const resolved = fs.existsSync(backup.file_path) ? backup.file_path : path.join(DIRS.backups, backup.file_name);
    if (!fs.existsSync(resolved)) return res.status(404).json({ error: 'Backup file missing from disk' });
    res.download(resolved, backup.file_name);
  });

  router.delete('/backups/:id', requireAuth, requireAdmin, (req: AuthRequest, res) => {
    try {
      const backupId = Number(req.params.id);
      const backup = queryOne<any>('SELECT * FROM backups WHERE id = ?', [backupId]);
      if (!backup) return res.status(404).json({ error: 'Backup not found.' });

      const resolved = fs.existsSync(backup.file_path) ? backup.file_path : path.join(DIRS.backups, backup.file_name);
      if (fs.existsSync(resolved)) {
        fs.unlinkSync(resolved);
      }
      executeSql('DELETE FROM backups WHERE id = ?', [backupId]);
      logActivity(req.user!.id, req.user!.username, 'Backup Deleted', 'Backups', backupId, backup.backup_name, `Removed old backup file ${backup.file_name}`);
      res.json({ message: 'Backup deleted.' });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Attachments
  router.get('/attachments/:entityType/:entityId', requireAuth, (req, res) => {
    const rows = queryAll<any>(
      'SELECT id, entity_type, entity_id, file_name, mime_type, file_size, uploaded_by, created_at FROM attachments WHERE entity_type = ? AND entity_id = ? ORDER BY created_at DESC',
      [req.params.entityType, Number(req.params.entityId)]
    );
    res.json({ attachments: rows });
  });

  router.get('/attachments/file/:id', requireAuth, (req, res) => {
    const row = queryOne<any>('SELECT * FROM attachments WHERE id = ?', [Number(req.params.id)]);
    if (!row) return res.status(404).json({ error: 'Attachment not found' });
    res.json({ attachment: row });
  });

  router.post('/attachments', requireAuth, (req: AuthRequest, res) => {
    try {
      const { entity_type, entity_id, file_name, mime_type, file_size, file_data } = req.body;
      if (!entity_type || !entity_id || !file_name || !file_data) {
        return res.status(400).json({ error: 'Invalid attachment payload.' });
      }
      const now = new Date().toISOString();
      executeSql(
        `INSERT INTO attachments (entity_type, entity_id, file_name, mime_type, file_size, file_data, uploaded_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [entity_type, Number(entity_id), file_name, mime_type || 'application/octet-stream', Number(file_size) || 0, file_data, req.user!.username, now]
      );
      const id = getLastInsertId();
      logActivity(req.user!.id, req.user!.username, 'Attachment Added', entity_type, entity_id, file_name, `Uploaded attachment ${file_name}`);
      res.json({ message: 'Attachment uploaded.', id });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.delete('/attachments/:id', requireAuth, (req: AuthRequest, res) => {
    const id = Number(req.params.id);
    const row = queryOne<any>('SELECT * FROM attachments WHERE id = ?', [id]);
    if (row) {
      executeSql('DELETE FROM attachments WHERE id = ?', [id]);
      logActivity(req.user!.id, req.user!.username, 'Attachment Removed', row.entity_type, row.entity_id, row.file_name, `Deleted attachment ${row.file_name}`);
    }
    res.json({ message: 'Attachment removed.' });
  });
}
