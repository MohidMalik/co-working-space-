import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import initSqlJs, { Database, SqlValue } from 'sql.js';
import { ALL_PERMISSIONS, DEFAULT_WORKSPACE_TYPES, DEFAULT_EXPENSE_CATEGORIES } from '../shared/permissions';

export const DATA_ROOT = process.env.COWORKING_DATA_ROOT
  ? path.resolve(process.env.COWORKING_DATA_ROOT)
  : path.resolve(process.cwd(), 'CoworkingManagement_Data');
export const DIRS = {
  root: DATA_ROOT,
  database: path.join(DATA_ROOT, 'database'),
  backups: path.join(DATA_ROOT, 'backups'),
  invoices: path.join(DATA_ROOT, 'invoices'),
  reports: path.join(DATA_ROOT, 'reports'),
  attachments: path.join(DATA_ROOT, 'attachments'),
  logos: path.join(DATA_ROOT, 'logos'),
  exports: path.join(DATA_ROOT, 'exports'),
  logs: path.join(DATA_ROOT, 'logs'),
};

export const DB_FILE_PATH = path.join(DIRS.database, 'coworking.db');
const CURRENT_SCHEMA_VERSION = 1;

let dbInstance: Database | null = null;
let SQLModule: any = null;

export function ensureDataDirectories() {
  Object.values(DIRS).forEach((dir) => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  });
}

export function hashPassword(password: string, existingSalt?: string): { hash: string; salt: string } {
  const salt = existingSalt || crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return { hash, salt };
}

export function verifyPassword(password: string, hash: string, salt: string): boolean {
  const computed = crypto.scryptSync(password, salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(computed, 'hex'), Buffer.from(hash, 'hex'));
}

let inTransaction = false;
let cachedLastInsertId = 0;

function sanitizeSqlParams(params: any[] = []): SqlValue[] {
  return params.map((val) => {
    if (val === undefined || (typeof val === 'number' && Number.isNaN(val))) return null;
    if (typeof val === 'boolean') return val ? 1 : 0;
    return val as SqlValue;
  });
}

function sanitizeLogText(text: string): string {
  if (!text) return '';
  return String(text)
    .replace(/(password|passwd|secret|token|password_hash|password_salt)\s*[:=]\s*[^\s,;]+/gi, '$1=[REDACTED]')
    .slice(0, 500);
}

export function saveDatabaseToDisk() {
  if (!dbInstance || inTransaction) return;
  ensureDataDirectories();
  const data = dbInstance.export();
  const buffer = Buffer.from(data);
  const tempPath = `${DB_FILE_PATH}.tmp`;
  try {
    fs.writeFileSync(tempPath, buffer);
    fs.renameSync(tempPath, DB_FILE_PATH);
  } catch {
    fs.writeFileSync(DB_FILE_PATH, buffer);
  }
}

export function getDb(): Database {
  if (!dbInstance) {
    throw new Error('SQLite database has not been initialized yet.');
  }
  return dbInstance;
}

export function queryAll<T = Record<string, any>>(sql: string, params: SqlValue[] = []): T[] {
  const db = getDb();
  const stmt = db.prepare(sql);
  try {
    stmt.bind(sanitizeSqlParams(params));
    const results: T[] = [];
    while (stmt.step()) {
      results.push(stmt.getAsObject() as T);
    }
    return results;
  } finally {
    stmt.free();
  }
}

export function queryOne<T = Record<string, any>>(sql: string, params: SqlValue[] = []): T | null {
  const rows = queryAll<T>(sql, params);
  return rows.length > 0 ? rows[0] : null;
}

export function executeSql(sql: string, params: SqlValue[] = [], skipSave = false) {
  const db = getDb();
  const cleanParams = sanitizeSqlParams(params);
  db.run(sql, cleanParams);
  if (/^\s*insert\b/i.test(sql) && !/into\s+activity_logs\b/i.test(sql)) {
    const stmt = db.prepare('SELECT last_insert_rowid() as id');
    try {
      if (stmt.step()) {
        const obj = stmt.getAsObject() as { id: number };
        if (Number(obj.id) > 0) {
          cachedLastInsertId = Number(obj.id);
        }
      }
    } finally {
      stmt.free();
    }
  }
  if (!skipSave && !inTransaction) {
    saveDatabaseToDisk();
  }
}

export function getLastInsertId(): number {
  if (cachedLastInsertId > 0) {
    return cachedLastInsertId;
  }
  const row = queryOne<{ id: number }>('SELECT last_insert_rowid() as id');
  return row ? Number(row.id) : 0;
}

export function runInTransaction<T>(fn: () => T): T {
  const db = getDb();
  if (inTransaction) {
    return fn();
  }
  inTransaction = true;
  let txStarted = false;
  try {
    try {
      db.run('BEGIN TRANSACTION');
      txStarted = true;
    } catch (beginErr: any) {
      if (/within a transaction/i.test(String(beginErr?.message))) {
        txStarted = true;
      } else {
        throw beginErr;
      }
    }
    const result = fn();
    if (txStarted) {
      try {
        db.run('COMMIT');
      } catch (commitErr: any) {
        if (!/no transaction is active/i.test(String(commitErr?.message))) {
          throw commitErr;
        }
      }
      txStarted = false;
    }
    inTransaction = false;
    saveDatabaseToDisk();
    return result;
  } catch (err) {
    if (txStarted) {
      try {
        db.run('ROLLBACK');
      } catch {
        // Ignore rollback errors if already rolled back
      }
    }
    inTransaction = false;
    throw err;
  }
}

export function logActivity(
  userId: number | null,
  username: string,
  action: string,
  module: string,
  recordId: string | number | null,
  recordLabel: string,
  details: string,
  skipSave = false
) {
  const now = new Date().toISOString();
  executeSql(
    `INSERT INTO activity_logs (user_id, username, action, module, record_id, record_label, details, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      userId,
      sanitizeLogText(username || 'System'),
      sanitizeLogText(action),
      sanitizeLogText(module),
      recordId !== null ? String(recordId) : '',
      sanitizeLogText(recordLabel),
      sanitizeLogText(details),
      now,
    ],
    skipSave || inTransaction
  );
}

function resolveSqlWasmPath(fileName = 'sql-wasm.wasm'): string {
  const candidates = [
    process.env.SQL_WASM_PATH,
    process.env.COWORKING_RESOURCES_PATH ? path.join(process.env.COWORKING_RESOURCES_PATH, fileName) : '',
    (process as any).resourcesPath ? path.join((process as any).resourcesPath, fileName) : '',
    typeof __dirname !== 'undefined' ? path.join(__dirname, fileName) : '',
    typeof __dirname !== 'undefined' ? path.join(__dirname, 'resources', fileName) : '',
    path.resolve(process.cwd(), fileName),
    path.resolve(process.cwd(), 'resources', fileName),
    path.resolve(process.cwd(), 'node_modules', 'sql.js', 'dist', fileName),
  ].filter(Boolean) as string[];

  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    } catch {
      // Ignore inaccessible candidate paths
    }
  }
  return path.resolve(process.cwd(), 'node_modules', 'sql.js', 'dist', fileName);
}

function copyDirectoryRecursiveSync(srcDir: string, destDir: string) {
  if (!fs.existsSync(srcDir)) return;
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }
  const entries = fs.readdirSync(srcDir, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(srcDir, entry.name);
    const destPath = path.join(destDir, entry.name);
    if (entry.isDirectory()) {
      copyDirectoryRecursiveSync(srcPath, destPath);
    } else if (entry.isFile() && !fs.existsSync(destPath)) {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function migrateExistingDataIfNeeded() {
  if (fs.existsSync(DB_FILE_PATH)) {
    return;
  }
  const candidateRoots = [
    process.env.COWORKING_INITIAL_DATA_DIR,
    path.resolve(process.cwd(), 'CoworkingManagement_Data'),
    typeof __dirname !== 'undefined' ? path.resolve(__dirname, 'CoworkingManagement_Data') : '',
    typeof __dirname !== 'undefined' ? path.resolve(__dirname, '..', 'CoworkingManagement_Data') : '',
    typeof __dirname !== 'undefined' ? path.resolve(__dirname, '..', '..', 'CoworkingManagement_Data') : '',
    typeof __dirname !== 'undefined' ? path.resolve(__dirname, '..', '..', '..', 'CoworkingManagement_Data') : '',
  ].filter(Boolean) as string[];

  for (const candidateRoot of candidateRoots) {
    try {
      if (path.resolve(candidateRoot) === path.resolve(DATA_ROOT)) {
        continue;
      }
      const candidateDb = path.join(candidateRoot, 'database', 'coworking.db');
      if (fs.existsSync(candidateDb)) {
        copyDirectoryRecursiveSync(candidateRoot, DATA_ROOT);
        break;
      }
    } catch {
      // Ignore migration errors and continue with normal initialization
    }
  }
}

export async function initializeDatabase(): Promise<Database> {
  if (dbInstance) return dbInstance;
  ensureDataDirectories();
  migrateExistingDataIfNeeded();

  const wasmPath = resolveSqlWasmPath('sql-wasm.wasm');
  const wasmBinary = fs.existsSync(wasmPath) ? fs.readFileSync(wasmPath) : undefined;
  SQLModule = await initSqlJs({
    ...(wasmBinary ? { wasmBinary } : {}),
    locateFile: (file: string) => resolveSqlWasmPath(file),
  });
  const isExistingDb = fs.existsSync(DB_FILE_PATH);

  if (isExistingDb) {
    const fileBuffer = fs.readFileSync(DB_FILE_PATH);
    dbInstance = new SQLModule.Database(fileBuffer);
  } else {
    dbInstance = new SQLModule.Database();
  }

  dbInstance!.run('PRAGMA foreign_keys = ON;');

  createSchemaTables();
  seedSystemDefaults(!isExistingDb);
  recalculateAllStatuses();
  checkAndRunAutoBackup();
  saveDatabaseToDisk();

  return dbInstance!;
}

function createSchemaTables() {
  const db = getDb();

  db.run(`
    CREATE TABLE IF NOT EXISTS roles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      description TEXT,
      is_system INTEGER DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS permissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      module TEXT NOT NULL,
      description TEXT
    );

    CREATE TABLE IF NOT EXISTS role_permissions (
      role_id INTEGER NOT NULL,
      permission_id INTEGER NOT NULL,
      PRIMARY KEY (role_id, permission_id),
      FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
      FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      email TEXT NOT NULL UNIQUE,
      full_name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      password_salt TEXT NOT NULL,
      role_id INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'Active',
      must_change_password INTEGER DEFAULT 0,
      custom_permissions_json TEXT DEFAULT NULL,
      last_login TEXT,
      created_by TEXT,
      updated_by TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      is_deleted INTEGER DEFAULT 0,
      FOREIGN KEY (role_id) REFERENCES roles(id)
    );

    CREATE TABLE IF NOT EXISTS user_roles (
      user_id INTEGER NOT NULL,
      role_id INTEGER NOT NULL,
      PRIMARY KEY (user_id, role_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS workspace_types (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      description TEXT
    );

    CREATE TABLE IF NOT EXISTS workspaces (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      workspace_code TEXT NOT NULL UNIQUE,
      workspace_number TEXT NOT NULL,
      floor TEXT NOT NULL,
      type TEXT NOT NULL,
      name TEXT NOT NULL,
      capacity INTEGER NOT NULL DEFAULT 1,
      monthly_price REAL NOT NULL DEFAULT 0,
      daily_price REAL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'Available',
      description TEXT,
      amenities TEXT,
      notes TEXT,
      created_by TEXT,
      updated_by TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      is_deleted INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS clients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_code TEXT NOT NULL UNIQUE,
      client_name TEXT NOT NULL,
      company_name TEXT,
      phone TEXT NOT NULL,
      whatsapp TEXT,
      email TEXT,
      cnic TEXT,
      client_photo TEXT DEFAULT '',
      cnic_front TEXT DEFAULT '',
      cnic_back TEXT DEFAULT '',
      address TEXT,
      city TEXT DEFAULT 'Lahore',
      contact_person TEXT,
      business_type TEXT,
      notes TEXT,
      status TEXT NOT NULL DEFAULT 'Active',
      workspace_id INTEGER,
      created_by TEXT,
      updated_by TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      is_deleted INTEGER DEFAULT 0,
      FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS contracts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      contract_number TEXT NOT NULL UNIQUE,
      client_id INTEGER NOT NULL,
      workspace_id INTEGER NOT NULL,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      monthly_rent REAL NOT NULL DEFAULT 0,
      security_deposit REAL NOT NULL DEFAULT 0,
      payment_due_day INTEGER NOT NULL DEFAULT 5,
      chairs_count INTEGER DEFAULT 0,
      tables_count INTEGER DEFAULT 0,
      ac_units INTEGER DEFAULT 0,
      lockers_count INTEGER DEFAULT 0,
      custom_requirements TEXT DEFAULT '',
      contract_terms TEXT,
      additional_charges REAL NOT NULL DEFAULT 0,
      notes TEXT,
      status TEXT NOT NULL DEFAULT 'Active',
      renewed_from_id INTEGER,
      created_by TEXT,
      updated_by TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      is_deleted INTEGER DEFAULT 0,
      FOREIGN KEY (client_id) REFERENCES clients(id),
      FOREIGN KEY (workspace_id) REFERENCES workspaces(id)
    );

    CREATE TABLE IF NOT EXISTS invoices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_number TEXT NOT NULL UNIQUE,
      invoice_date TEXT NOT NULL,
      due_date TEXT NOT NULL,
      client_id INTEGER NOT NULL,
      client_name_snapshot TEXT NOT NULL,
      client_company_snapshot TEXT,
      client_phone_snapshot TEXT,
      client_email_snapshot TEXT,
      client_address_snapshot TEXT,
      workspace_id INTEGER,
      workspace_snapshot TEXT,
      contract_id INTEGER,
      billing_period TEXT NOT NULL,
      custom_paragraph TEXT,
      subtotal REAL NOT NULL DEFAULT 0,
      discount REAL NOT NULL DEFAULT 0,
      additional_charges REAL NOT NULL DEFAULT 0,
      total REAL NOT NULL DEFAULT 0,
      paid_amount REAL NOT NULL DEFAULT 0,
      remaining_amount REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'Unpaid',
      notes TEXT,
      terms TEXT,
      created_by TEXT,
      updated_by TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      is_deleted INTEGER DEFAULT 0,
      FOREIGN KEY (client_id) REFERENCES clients(id),
      FOREIGN KEY (workspace_id) REFERENCES workspaces(id)
    );

    CREATE TABLE IF NOT EXISTS invoice_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_id INTEGER NOT NULL,
      description TEXT NOT NULL,
      category TEXT DEFAULT 'Monthly Office Rental',
      quantity REAL NOT NULL DEFAULT 1,
      unit_price REAL NOT NULL DEFAULT 0,
      amount REAL NOT NULL DEFAULT 0,
      sort_order INTEGER DEFAULT 0,
      FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      payment_code TEXT NOT NULL UNIQUE,
      receipt_number TEXT NOT NULL UNIQUE,
      client_id INTEGER NOT NULL,
      invoice_id INTEGER NOT NULL,
      payment_date TEXT NOT NULL,
      amount REAL NOT NULL DEFAULT 0,
      payment_method TEXT NOT NULL DEFAULT 'Bank Transfer',
      reference_number TEXT,
      transaction_screenshot TEXT DEFAULT '',
      notes TEXT,
      received_by TEXT,
      created_by TEXT,
      updated_by TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      is_deleted INTEGER DEFAULT 0,
      FOREIGN KEY (client_id) REFERENCES clients(id),
      FOREIGN KEY (invoice_id) REFERENCES invoices(id)
    );

    CREATE TABLE IF NOT EXISTS expense_categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      is_default INTEGER DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      expense_code TEXT NOT NULL UNIQUE,
      expense_date TEXT NOT NULL,
      category TEXT NOT NULL,
      description TEXT NOT NULL,
      vendor TEXT,
      amount REAL NOT NULL DEFAULT 0,
      payment_method TEXT NOT NULL DEFAULT 'Cash',
      reference_number TEXT,
      attachment_id INTEGER,
      notes TEXT,
      created_by TEXT,
      updated_by TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      is_deleted INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS company_settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      company_name TEXT NOT NULL,
      logo_data TEXT,
      phone TEXT,
      whatsapp TEXT,
      address TEXT,
      city TEXT,
      email TEXT,
      website TEXT,
      tax_number TEXT,
      bank_name TEXT,
      bank_account_title TEXT,
      bank_account_number TEXT,
      bank_iban TEXT,
      invoice_prefix TEXT NOT NULL DEFAULT 'INV-',
      next_invoice_number INTEGER NOT NULL DEFAULT 1,
      receipt_prefix TEXT NOT NULL DEFAULT 'RCP-',
      next_receipt_number INTEGER NOT NULL DEFAULT 1,
      default_invoice_paragraph TEXT,
      default_invoice_notes TEXT,
      default_invoice_terms TEXT,
      updated_by TEXT,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS app_settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      currency_code TEXT NOT NULL DEFAULT 'PKR',
      currency_symbol TEXT NOT NULL DEFAULT 'Rs.',
      date_format TEXT NOT NULL DEFAULT 'DD MMM YYYY',
      auto_backup_enabled INTEGER NOT NULL DEFAULT 1,
      auto_backup_frequency TEXT NOT NULL DEFAULT 'Daily',
      last_auto_backup_at TEXT,
      expiry_warning_days INTEGER NOT NULL DEFAULT 30,
      low_availability_threshold INTEGER NOT NULL DEFAULT 2,
      printer_paper_size TEXT NOT NULL DEFAULT 'A4',
      first_run_completed INTEGER NOT NULL DEFAULT 0,
      schema_version INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS activity_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      username TEXT NOT NULL,
      action TEXT NOT NULL,
      module TEXT NOT NULL,
      record_id TEXT,
      record_label TEXT,
      details TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS trash (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      original_id INTEGER NOT NULL,
      record_type TEXT NOT NULL,
      record_label TEXT NOT NULL,
      record_data_json TEXT NOT NULL,
      deleted_by INTEGER,
      deleted_by_name TEXT NOT NULL,
      deleted_at TEXT NOT NULL,
      reason TEXT
    );

    CREATE TABLE IF NOT EXISTS backups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      backup_name TEXT NOT NULL,
      file_name TEXT NOT NULL,
      file_path TEXT NOT NULL,
      file_size INTEGER NOT NULL DEFAULT 0,
      backup_type TEXT NOT NULL DEFAULT 'Manual',
      created_by INTEGER,
      created_by_name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'Completed',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS attachments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entity_type TEXT NOT NULL,
      entity_id INTEGER NOT NULL,
      file_name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      file_size INTEGER NOT NULL DEFAULT 0,
      file_data TEXT NOT NULL,
      uploaded_by TEXT,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_clients_deleted ON clients(is_deleted, status);
    CREATE INDEX IF NOT EXISTS idx_workspaces_deleted ON workspaces(is_deleted, status);
    CREATE INDEX IF NOT EXISTS idx_contracts_deleted ON contracts(is_deleted, status);
    CREATE INDEX IF NOT EXISTS idx_invoices_deleted ON invoices(is_deleted, status, invoice_date);
    CREATE INDEX IF NOT EXISTS idx_payments_deleted ON payments(is_deleted, payment_date);
    CREATE INDEX IF NOT EXISTS idx_expenses_deleted ON expenses(is_deleted, expense_date, category);
    CREATE INDEX IF NOT EXISTS idx_activity_logs_date ON activity_logs(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_attachments_entity ON attachments(entity_type, entity_id);
  `);

  // Safe schema migrations for employee/user, client, contract, payment, expense, invoice, and company settings
  const alterStatements = [
    "ALTER TABLE users ADD COLUMN phone TEXT DEFAULT '';",
    "ALTER TABLE users ADD COLUMN designation TEXT DEFAULT '';",
    "ALTER TABLE clients ADD COLUMN client_photo TEXT DEFAULT '';",
    "ALTER TABLE clients ADD COLUMN cnic_front TEXT DEFAULT '';",
    "ALTER TABLE clients ADD COLUMN cnic_back TEXT DEFAULT '';",
    "ALTER TABLE contracts ADD COLUMN chairs_count INTEGER DEFAULT 0;",
    "ALTER TABLE contracts ADD COLUMN tables_count INTEGER DEFAULT 0;",
    "ALTER TABLE contracts ADD COLUMN ac_units INTEGER DEFAULT 0;",
    "ALTER TABLE contracts ADD COLUMN lockers_count INTEGER DEFAULT 0;",
    "ALTER TABLE contracts ADD COLUMN custom_requirements TEXT DEFAULT '';",
    "ALTER TABLE payments ADD COLUMN transaction_screenshot TEXT DEFAULT '';",
    // Company settings: Signature, Stamp, Role Titles & Default payment terms
    "ALTER TABLE company_settings ADD COLUMN signature_data TEXT DEFAULT '';",
    "ALTER TABLE company_settings ADD COLUMN stamp_data TEXT DEFAULT '';",
    "ALTER TABLE company_settings ADD COLUMN show_signature INTEGER DEFAULT 1;",
    "ALTER TABLE company_settings ADD COLUMN show_stamp INTEGER DEFAULT 1;",
    "ALTER TABLE company_settings ADD COLUMN signature_position TEXT DEFAULT 'right';",
    "ALTER TABLE company_settings ADD COLUMN stamp_position TEXT DEFAULT 'beside-signature';",
    "ALTER TABLE company_settings ADD COLUMN role1_title TEXT DEFAULT 'Prepared By';",
    "ALTER TABLE company_settings ADD COLUMN role1_name TEXT DEFAULT '';",
    "ALTER TABLE company_settings ADD COLUMN role1_signature_data TEXT DEFAULT '';",
    "ALTER TABLE company_settings ADD COLUMN role2_title TEXT DEFAULT 'Accountant / Checked By';",
    "ALTER TABLE company_settings ADD COLUMN role2_name TEXT DEFAULT '';",
    "ALTER TABLE company_settings ADD COLUMN role2_signature_data TEXT DEFAULT '';",
    "ALTER TABLE company_settings ADD COLUMN role3_title TEXT DEFAULT 'Authorized Signatory';",
    "ALTER TABLE company_settings ADD COLUMN role3_name TEXT DEFAULT '';",
    "ALTER TABLE company_settings ADD COLUMN role3_signature_data TEXT DEFAULT '';",
    "ALTER TABLE company_settings ADD COLUMN default_payment_due_days INTEGER DEFAULT 7;",
    // Invoices: expected payment date & signature/stamp overrides
    "ALTER TABLE invoices ADD COLUMN expected_payment_date TEXT DEFAULT '';",
    "ALTER TABLE invoices ADD COLUMN show_signature INTEGER DEFAULT 1;",
    "ALTER TABLE invoices ADD COLUMN show_stamp INTEGER DEFAULT 1;",
    "ALTER TABLE invoices ADD COLUMN signature_position TEXT DEFAULT 'right';",
    "ALTER TABLE invoices ADD COLUMN stamp_position TEXT DEFAULT 'beside-signature';",
    "ALTER TABLE invoices ADD COLUMN role1_title TEXT DEFAULT '';",
    "ALTER TABLE invoices ADD COLUMN role1_name TEXT DEFAULT '';",
    "ALTER TABLE invoices ADD COLUMN role2_title TEXT DEFAULT '';",
    "ALTER TABLE invoices ADD COLUMN role2_name TEXT DEFAULT '';",
    "ALTER TABLE invoices ADD COLUMN role3_title TEXT DEFAULT '';",
    "ALTER TABLE invoices ADD COLUMN role3_name TEXT DEFAULT '';",
    // Expenses: payer, payee, payment_status, attachment details
    "ALTER TABLE expenses ADD COLUMN payer TEXT DEFAULT '';",
    "ALTER TABLE expenses ADD COLUMN payee TEXT DEFAULT '';",
    "ALTER TABLE expenses ADD COLUMN payment_status TEXT DEFAULT 'Paid';",
    "ALTER TABLE expenses ADD COLUMN attachment_file_name TEXT DEFAULT '';",
    "ALTER TABLE expenses ADD COLUMN attachment_mime_type TEXT DEFAULT '';",
    "ALTER TABLE expenses ADD COLUMN attachment_data TEXT DEFAULT '';",
  ];
  for (const stmt of alterStatements) {
    try {
      db.run(stmt);
    } catch {
      // Column already exists
    }
  }
}

function seedSystemDefaults(isFirstRun: boolean) {
  const now = new Date().toISOString();

  // 1. Ensure all permissions exist
  for (const perm of ALL_PERMISSIONS) {
    const existing = queryOne('SELECT id FROM permissions WHERE code = ?', [perm.code]);
    if (!existing) {
      executeSql(
        'INSERT INTO permissions (code, name, module, description) VALUES (?, ?, ?, ?)',
        [perm.code, perm.name, perm.module, perm.description],
        true
      );
    }
  }

  // 2. Ensure default roles exist
  let adminRole = queryOne<{ id: number }>('SELECT id FROM roles WHERE name = ?', ['Admin']);
  if (!adminRole) {
    executeSql(
      'INSERT INTO roles (name, description, is_system, created_at, updated_at) VALUES (?, ?, 1, ?, ?)',
      ['Admin', 'Full administrative access to all modules, security, backups, and trash management', now, now],
      true
    );
    adminRole = queryOne<{ id: number }>('SELECT id FROM roles WHERE name = ?', ['Admin']);
  }

  let managerRole = queryOne<{ id: number }>('SELECT id FROM roles WHERE name = ?', ['Operations Manager']);
  if (!managerRole) {
    executeSql(
      'INSERT INTO roles (name, description, is_system, created_at, updated_at) VALUES (?, ?, 1, ?, ?)',
      ['Operations Manager', 'Manage clients, workspaces, contracts, invoices, payments, expenses, and reports', now, now],
      true
    );
    managerRole = queryOne<{ id: number }>('SELECT id FROM roles WHERE name = ?', ['Operations Manager']);
  }

  let frontDeskRole = queryOne<{ id: number }>('SELECT id FROM roles WHERE name = ?', ['Front Desk & Billing']);
  if (!frontDeskRole) {
    executeSql(
      'INSERT INTO roles (name, description, is_system, created_at, updated_at) VALUES (?, ?, 1, ?, ?)',
      ['Front Desk & Billing', 'View workspaces, manage clients, create invoices and record client payments', now, now],
      true
    );
    frontDeskRole = queryOne<{ id: number }>('SELECT id FROM roles WHERE name = ?', ['Front Desk & Billing']);
  }

  // Assign all permissions to Admin role
  const allPerms = queryAll<{ id: number; code: string }>('SELECT id, code FROM permissions');
  if (adminRole) {
    for (const p of allPerms) {
      executeSql(
        'INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)',
        [adminRole.id, p.id],
        true
      );
    }
  }

  // Assign Operations Manager permissions (only on initial creation if empty)
  if (managerRole) {
    const existingMgrPerms = queryOne<{ cnt: number }>('SELECT COUNT(*) as cnt FROM role_permissions WHERE role_id = ?', [managerRole.id]);
    if (!existingMgrPerms || existingMgrPerms.cnt === 0) {
      const managerAllowed = allPerms.filter(
        (p) => !['users.manage', 'trash.permanent_delete', 'backup.restore'].includes(p.code)
      );
      for (const p of managerAllowed) {
        executeSql('INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)', [managerRole.id, p.id], true);
      }
    }
  }

  // Assign Front Desk permissions (only on initial creation if empty)
  if (frontDeskRole) {
    const existingDeskPerms = queryOne<{ cnt: number }>('SELECT COUNT(*) as cnt FROM role_permissions WHERE role_id = ?', [frontDeskRole.id]);
    if (!existingDeskPerms || existingDeskPerms.cnt === 0) {
      const deskAllowedCodes = [
        'dashboard.view',
        'clients.view', 'clients.create', 'clients.edit',
        'workspaces.view',
        'contracts.view', 'contracts.create',
        'invoices.view', 'invoices.create', 'invoices.edit',
        'payments.view', 'payments.create',
        'expenses.view', 'expenses.create',
      ];
      for (const p of allPerms.filter((perm) => deskAllowedCodes.includes(perm.code))) {
        executeSql('INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)', [frontDeskRole.id, p.id], true);
      }
    }
  }

  // 3. Default Admin User on first launch
  const existingUsers = queryOne<{ cnt: number }>('SELECT COUNT(*) as cnt FROM users');
  if (!existingUsers || existingUsers.cnt === 0) {
    const { hash, salt } = hashPassword('admin123');
    executeSql(
      `INSERT INTO users (username, email, full_name, password_hash, password_salt, role_id, status, must_change_password, created_by, updated_by, created_at, updated_at, is_deleted)
       VALUES (?, ?, ?, ?, ?, ?, 'Active', 1, 'System', 'System', ?, ?, 0)`,
      ['admin', 'admin@daftarpro.pk', 'System Administrator', hash, salt, adminRole!.id, now, now],
      true
    );
    const adminUser = queryOne<{ id: number }>('SELECT id FROM users WHERE username = ?', ['admin']);
    if (adminUser && adminRole) {
      executeSql('INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)', [adminUser.id, adminRole.id], true);
    }

    // Also create a secondary staff user for testing RBAC permissions easily
    if (frontDeskRole) {
      const staffCred = hashPassword('staff123');
      executeSql(
        `INSERT INTO users (username, email, full_name, password_hash, password_salt, role_id, status, must_change_password, created_by, updated_by, created_at, updated_at, is_deleted)
         VALUES (?, ?, ?, ?, ?, ?, 'Active', 0, 'System', 'System', ?, ?, 0)`,
        ['reception', 'frontdesk@daftarpro.pk', 'Ayesha Tariq (Front Desk)', staffCred.hash, staffCred.salt, frontDeskRole.id, now, now],
        true
      );
      const staffUser = queryOne<{ id: number }>('SELECT id FROM users WHERE username = ?', ['reception']);
      if (staffUser) {
        executeSql('INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)', [staffUser.id, frontDeskRole.id], true);
      }
    }
  }

  // 4. Default Workspace Types
  for (const wt of DEFAULT_WORKSPACE_TYPES) {
    executeSql('INSERT OR IGNORE INTO workspace_types (name, description) VALUES (?, ?)', [wt, `${wt} workspace facility`], true);
  }

  // 5. Default Expense Categories
  for (const cat of DEFAULT_EXPENSE_CATEGORIES) {
    executeSql('INSERT OR IGNORE INTO expense_categories (name, is_default, created_at) VALUES (?, 1, ?)', [cat, now], true);
  }

  // 6. Default Company Settings
  const compSettings = queryOne('SELECT id FROM company_settings WHERE id = 1');
  if (!compSettings) {
    executeSql(
      `INSERT INTO company_settings (
        id, company_name, logo_data, phone, whatsapp, address, city, email, website,
        tax_number, bank_name, bank_account_title, bank_account_number, bank_iban,
        invoice_prefix, next_invoice_number, receipt_prefix, next_receipt_number,
        default_invoice_paragraph, default_invoice_notes, default_invoice_terms, updated_by, updated_at
      ) VALUES (
        1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'INV-', 1, 'RCP-', 1, ?, ?, ?, 'System', ?
      )`,
      [
        'DaftarPro Coworking & Executive Suites',
        '',
        '+92 42 3578 9400',
        '+92 300 845 9900',
        'Plot 42-C, Main Boulevard Gulberg III, Lahore, Pakistan',
        'Lahore',
        'billing@daftarpro.pk',
        'www.daftarpro.pk',
        'NTN: 7845129-6',
        'Meezan Bank Limited — Gulberg Corporate Branch',
        'DaftarPro Workspace Pvt. Ltd.',
        '02010105889234',
        'PK36MEZN0002010105889234',
        'Monthly coworking office rental charges, including high-speed fiber internet, backup power, air conditioning, reception services, and complimentary access to communal amenities.',
        'Please share the deposit slip or online transfer screenshot on our billing WhatsApp or email once payment is processed.',
        '1. All monthly rental invoices are payable on or before the due date specified.\n2. A late payment surcharge of 5% may apply on balances overdue by more than 7 business days.\n3. Security deposit is refundable upon 30 days prior written notice of vacating and clearance of all utility/service dues.',
        now,
      ],
      true
    );
  }

  // 7. Default App Settings
  const appSettings = queryOne('SELECT id FROM app_settings WHERE id = 1');
  if (!appSettings) {
    executeSql(
      `INSERT INTO app_settings (
        id, currency_code, currency_symbol, date_format, auto_backup_enabled, auto_backup_frequency,
        expiry_warning_days, low_availability_threshold, printer_paper_size, first_run_completed, schema_version, updated_at
      ) VALUES (1, 'PKR', 'Rs.', 'DD MMM YYYY', 1, 'Daily', 30, 2, 'A4', 0, ?, ?)`,
      [CURRENT_SCHEMA_VERSION, now],
      true
    );
  }

  if (isFirstRun) {
    logActivity(1, 'System', 'Database Initialized', 'System', 1, 'SQLite Database', 'Initial SQLite database and required application directories created.', true);
  }
}

export function recalculateAllStatuses() {
  const today = new Date().toISOString().slice(0, 10);
  const appSet = queryOne<{ expiry_warning_days: number }>('SELECT expiry_warning_days FROM app_settings WHERE id = 1');
  const warningDays = appSet?.expiry_warning_days ?? 30;

  const warningDateObj = new Date();
  warningDateObj.setDate(warningDateObj.getDate() + warningDays);
  const warningDateStr = warningDateObj.toISOString().slice(0, 10);

  let changed = false;

  // 1. Update Contracts status automatically (unless Cancelled)
  const contracts = queryAll<{ id: number; end_date: string; status: string }>(
    "SELECT id, end_date, status FROM contracts WHERE is_deleted = 0 AND status != 'Cancelled'"
  );
  for (const c of contracts) {
    let newStatus = 'Active';
    if (c.end_date < today) {
      newStatus = 'Expired';
    } else if (c.end_date <= warningDateStr) {
      newStatus = 'Expiring Soon';
    }
    if (newStatus !== c.status) {
      executeSql('UPDATE contracts SET status = ? WHERE id = ?', [newStatus, c.id], true);
      changed = true;
    }
  }

  // 2. Update Invoices paid_amount, remaining_amount, and status automatically
  const invoices = queryAll<{
    id: number;
    total: number;
    paid_amount: number;
    remaining_amount: number;
    due_date: string;
    status: string;
  }>('SELECT id, total, paid_amount, remaining_amount, due_date, status FROM invoices WHERE is_deleted = 0');

  for (const inv of invoices) {
    const paidRow = queryOne<{ total_paid: number }>(
      'SELECT COALESCE(SUM(amount), 0) as total_paid FROM payments WHERE invoice_id = ? AND is_deleted = 0',
      [inv.id]
    );
    const paidAmount = Math.round((paidRow?.total_paid ?? 0) * 100) / 100;
    const remainingAmount = Math.max(0, Math.round((inv.total - paidAmount) * 100) / 100);

    let newStatus = inv.status;
    if (inv.status !== 'Cancelled' && inv.status !== 'Draft') {
      if (paidAmount >= inv.total && (inv.total > 0 || paidAmount > 0)) {
        newStatus = 'Paid';
      } else if (paidAmount > 0 && paidAmount < inv.total) {
        newStatus = inv.due_date < today ? 'Overdue' : 'Partially Paid';
      } else {
        newStatus = inv.due_date < today ? 'Overdue' : 'Unpaid';
      }
    }

    if (
      paidAmount !== Number(inv.paid_amount) ||
      remainingAmount !== Number(inv.remaining_amount) ||
      newStatus !== inv.status
    ) {
      executeSql(
        'UPDATE invoices SET paid_amount = ?, remaining_amount = ?, status = ? WHERE id = ?',
        [paidAmount, remainingAmount, newStatus, inv.id],
        true
      );
      changed = true;
    }
  }

  if (changed && !inTransaction) {
    saveDatabaseToDisk();
  }
}

export function recalculateSingleInvoice(invoiceId: number) {
  const today = new Date().toISOString().slice(0, 10);
  const inv = queryOne<{ id: number; total: number; due_date: string; status: string }>(
    'SELECT id, total, due_date, status FROM invoices WHERE id = ?',
    [invoiceId]
  );
  if (!inv) return;

  const paidRow = queryOne<{ total_paid: number }>(
    'SELECT COALESCE(SUM(amount), 0) as total_paid FROM payments WHERE invoice_id = ? AND is_deleted = 0',
    [invoiceId]
  );
  const paidAmount = Math.round((paidRow?.total_paid ?? 0) * 100) / 100;
  const remainingAmount = Math.max(0, Math.round((inv.total - paidAmount) * 100) / 100);

  let newStatus = inv.status;
  if (inv.status !== 'Cancelled' && inv.status !== 'Draft') {
    if (paidAmount >= inv.total && (inv.total > 0 || paidAmount > 0)) {
      newStatus = 'Paid';
    } else if (paidAmount > 0 && paidAmount < inv.total) {
      newStatus = inv.due_date < today ? 'Overdue' : 'Partially Paid';
    } else {
      newStatus = inv.due_date < today ? 'Overdue' : 'Unpaid';
    }
  }

  executeSql(
    'UPDATE invoices SET paid_amount = ?, remaining_amount = ?, status = ? WHERE id = ?',
    [paidAmount, remainingAmount, newStatus, invoiceId],
    inTransaction
  );
}

export function createDatabaseBackup(
  backupType: 'Manual' | 'Automatic' | 'Pre-Migration' | 'Pre-Restore',
  userId: number | null,
  username: string,
  customLabel?: string
) {
  ensureDataDirectories();
  saveDatabaseToDisk();

  const now = new Date();
  const timestamp = now.toISOString().replace(/[:.]/g, '-');
  const fileName = `coworking_backup_${backupType.toLowerCase()}_${timestamp}.sqlite`;
  const filePath = path.join(DIRS.backups, fileName);

  const data = getDb().export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(filePath, buffer);
  const stats = fs.statSync(filePath);

  const backupName = customLabel || `${backupType} Backup (${now.toISOString().slice(0, 19).replace('T', ' ')})`;
  const createdAt = now.toISOString();

  executeSql(
    `INSERT INTO backups (backup_name, file_name, file_path, file_size, backup_type, created_by, created_by_name, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'Completed', ?)`,
    [backupName, fileName, filePath, stats.size, backupType, userId, username || 'System', createdAt]
  );

  const backupId = getLastInsertId();
  logActivity(userId, username || 'System', 'Backup Created', 'Backups', backupId, backupName, `Created ${backupType} SQLite backup (${fileName}, ${stats.size} bytes)`);
  saveDatabaseToDisk();

  return queryOne('SELECT * FROM backups WHERE id = ?', [backupId]);
}

export function restoreDatabaseFromBackup(backupId: number, userId: number, username: string) {
  const backup = queryOne<{
    id: number;
    backup_name: string;
    file_name: string;
    file_path: string;
  }>('SELECT * FROM backups WHERE id = ?', [backupId]);

  if (!backup) {
    throw new Error('Selected backup record was not found.');
  }

  const resolvedPath = fs.existsSync(backup.file_path)
    ? backup.file_path
    : path.join(DIRS.backups, backup.file_name);

  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`Backup file not found on disk: ${backup.file_name}`);
  }

  // First create a safety pre-restore backup of current state
  createDatabaseBackup('Pre-Restore', userId, username, `Pre-Restore Safety Snapshot before restoring ${backup.file_name}`);

  // Keep current backups table rows so backup history isn't lost after restoring an older snapshot
  const existingBackups = queryAll<any>('SELECT * FROM backups');

  const backupBuffer = fs.readFileSync(resolvedPath);
  const restoredDb = new SQLModule.Database(backupBuffer);

  if (dbInstance) {
    try {
      dbInstance.close();
    } catch {
      // ignore close error
    }
  }

  dbInstance = restoredDb;
  dbInstance!.run('PRAGMA foreign_keys = ON;');
  createSchemaTables();

  // Re-sync backup catalog so newly created backups remain visible
  for (const b of existingBackups) {
    const exists = queryOne('SELECT id FROM backups WHERE file_name = ?', [b.file_name]);
    if (!exists) {
      executeSql(
        `INSERT INTO backups (backup_name, file_name, file_path, file_size, backup_type, created_by, created_by_name, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [b.backup_name, b.file_name, b.file_path, b.file_size, b.backup_type, b.created_by, b.created_by_name, b.status, b.created_at],
        true
      );
    }
  }

  recalculateAllStatuses();
  logActivity(userId, username, 'Backup Restored', 'Backups', backup.id, backup.backup_name, `Restored SQLite database from ${backup.file_name}`);
  saveDatabaseToDisk();
}

export function checkAndRunAutoBackup() {
  try {
    const settings = queryOne<{
      auto_backup_enabled: number;
      auto_backup_frequency: string;
      last_auto_backup_at: string | null;
    }>('SELECT auto_backup_enabled, auto_backup_frequency, last_auto_backup_at FROM app_settings WHERE id = 1');

    if (!settings || !settings.auto_backup_enabled) return;

    const now = Date.now();
    const lastBackup = settings.last_auto_backup_at ? new Date(settings.last_auto_backup_at).getTime() : 0;
    const thresholdMs = settings.auto_backup_frequency === 'Weekly' ? 7 * 24 * 3600 * 1000 : 24 * 3600 * 1000;

    if (!lastBackup || now - lastBackup >= thresholdMs) {
      const isoNow = new Date().toISOString();
      executeSql('UPDATE app_settings SET last_auto_backup_at = ? WHERE id = 1', [isoNow], true);
      createDatabaseBackup('Automatic', null, 'Automated Scheduler', `Scheduled ${settings.auto_backup_frequency} Backup`);
    }
  } catch (err) {
    console.error('Auto backup check error:', err);
  }
}

export function getUserPermissions(userId: number): string[] {
  const user = queryOne<{ role_id: number; custom_permissions_json: string | null }>(
    'SELECT role_id, custom_permissions_json FROM users WHERE id = ? AND is_deleted = 0',
    [userId]
  );
  if (!user) return [];

  const role = queryOne<{ name: string }>('SELECT name FROM roles WHERE id = ?', [user.role_id]);
  if (role?.name === 'Admin') {
    return ALL_PERMISSIONS.map((p) => p.code);
  }

  if (user.custom_permissions_json) {
    try {
      const parsed = JSON.parse(user.custom_permissions_json);
      if (Array.isArray(parsed)) {
        return parsed;
      }
    } catch {
      // fallback to role permissions
    }
  }

  const rows = queryAll<{ code: string }>(
    `SELECT p.code FROM permissions p
     JOIN role_permissions rp ON rp.permission_id = p.id
     WHERE rp.role_id = ?`,
    [user.role_id]
  );
  return rows.map((r) => r.code);
}
