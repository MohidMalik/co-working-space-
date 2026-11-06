import React, { useState, useEffect, useCallback } from 'react';
import { useApp } from '../context/AppContext';
import { apiRequest } from '../services/api';
import { ALL_PERMISSIONS, PermissionDef } from '../shared/permissions';
import { formatDateTime } from '../utils/format';
import { Plus, Shield, Users, Edit2, Trash2, UserCheck, UserX } from 'lucide-react';

export default function UsersAndRolesPage() {
  const { showToast, confirmAction, user: currentUser } = useApp();
  const [activeTab, setActiveTab] = useState<'users' | 'roles'>('users');
  const [users, setUsers] = useState<any[]>([]);
  const [roles, setRoles] = useState<any[]>([]);
  const [permissionsList, setPermissionsList] = useState<any[]>([]);
  const [rolePermissions, setRolePermissions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [showUserModal, setShowUserModal] = useState(false);
  const [editingUser, setEditingUser] = useState<any | null>(null);
  const [userForm, setUserForm] = useState({
    username: '',
    email: '',
    full_name: '',
    phone: '',
    designation: '',
    password: '',
    role_id: '',
    status: 'Active',
    useCustomPermissions: false,
    custom_permissions: [] as string[],
  });

  const [showRoleModal, setShowRoleModal] = useState(false);
  const [editingRole, setEditingRole] = useState<any | null>(null);
  const [roleForm, setRoleForm] = useState({
    name: '',
    description: '',
    permission_codes: [] as string[],
  });

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const res = await apiRequest<{
        users: any[];
        roles: any[];
        permissions: any[];
        rolePermissions: any[];
      }>('/users');
      setUsers(res.users || []);
      setRoles(res.roles || []);
      setPermissionsList(res.permissions || []);
      setRolePermissions(res.rolePermissions || []);
    } catch (err: any) {
      showToast(err.message || 'Failed to load users and employees', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const getRolePermCodes = useCallback(
    (roleId: number) => {
      const r = roles.find(x => x.id === roleId);
      if (r?.name === 'Admin') return ALL_PERMISSIONS.map(p => p.code);
      const permIds = new Set(rolePermissions.filter(rp => rp.role_id === roleId).map(rp => rp.permission_id));
      return permissionsList.filter(p => permIds.has(p.id)).map(p => p.code);
    },
    [roles, rolePermissions, permissionsList]
  );

  // Group permissions by module
  const permissionsByModule = ALL_PERMISSIONS.reduce((acc, perm) => {
    if (!acc[perm.module]) acc[perm.module] = [];
    acc[perm.module].push(perm);
    return acc;
  }, {} as Record<string, PermissionDef[]>);

  const handleOpenCreateUser = () => {
    const defaultRole = roles.find(r => r.name !== 'Admin') || roles[0];
    setEditingUser(null);
    setUserForm({
      username: '',
      email: '',
      full_name: '',
      phone: '',
      designation: '',
      password: '',
      role_id: defaultRole ? String(defaultRole.id) : '',
      status: 'Active',
      useCustomPermissions: false,
      custom_permissions: defaultRole ? getRolePermCodes(defaultRole.id) : [],
    });
    setShowUserModal(true);
  };

  const handleOpenEditUser = (u: any) => {
    setEditingUser(u);
    let parsedCustom: string[] | null = null;
    if (u.custom_permissions_json) {
      try {
        parsedCustom = JSON.parse(u.custom_permissions_json);
      } catch {
        parsedCustom = null;
      }
    }
    const hasCustom = Array.isArray(parsedCustom);
    setUserForm({
      username: u.username,
      email: u.email || '',
      full_name: u.full_name,
      phone: u.phone || '',
      designation: u.designation || '',
      password: '',
      role_id: String(u.role_id),
      status: u.status,
      useCustomPermissions: hasCustom,
      custom_permissions: hasCustom && parsedCustom ? parsedCustom : getRolePermCodes(u.role_id),
    });
    setShowUserModal(true);
  };

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = {
        username: userForm.username,
        email: userForm.email,
        full_name: userForm.full_name,
        phone: userForm.phone,
        designation: userForm.designation,
        password: userForm.password || undefined,
        role_id: Number(userForm.role_id),
        status: userForm.status,
        custom_permissions: userForm.useCustomPermissions ? userForm.custom_permissions : null,
      };

      if (editingUser) {
        await apiRequest(`/users/${editingUser.id}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
        showToast('Employee / User updated successfully', 'success');
      } else {
        if (!userForm.password || userForm.password.length < 6) {
          showToast('Password must be at least 6 characters', 'error');
          return;
        }
        await apiRequest('/users', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        showToast('Employee / User created successfully', 'success');
      }
      setShowUserModal(false);
      loadData();
    } catch (err: any) {
      showToast(err.message || 'Failed to save employee/user', 'error');
    }
  };

  const handleDeleteUser = (u: any) => {
    confirmAction({
      title: 'Move Employee / User to Trash',
      message: `Are you sure you want to delete "${u.full_name}" (${u.username})? Their account will be disabled and moved to Trash, where it can be restored if needed.`,
      confirmLabel: 'Move to Trash',
      danger: true,
      requireReason: true,
      onConfirm: async (reason) => {
        try {
          await apiRequest(`/users/${u.id}`, {
            method: 'DELETE',
            body: JSON.stringify({ reason }),
          });
          showToast('Employee / User moved to Trash', 'info');
          loadData();
        } catch (err: any) {
          showToast(err.message || 'Failed to delete employee/user', 'error');
        }
      },
    });
  };

  const handleOpenCreateRole = () => {
    setEditingRole(null);
    setRoleForm({
      name: '',
      description: '',
      permission_codes: ['dashboard.view', 'clients.view', 'workspaces.view', 'contracts.view', 'invoices.view', 'payments.view'],
    });
    setShowRoleModal(true);
  };

  const handleOpenEditRole = (role: any) => {
    setEditingRole(role);
    setRoleForm({
      name: role.name,
      description: role.description || '',
      permission_codes: getRolePermCodes(role.id),
    });
    setShowRoleModal(true);
  };

  const handleSaveRole = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingRole) {
        await apiRequest(`/roles/${editingRole.id}/permissions`, {
          method: 'PUT',
          body: JSON.stringify(roleForm),
        });
        showToast('Role permissions updated', 'success');
      } else {
        await apiRequest('/roles', {
          method: 'POST',
          body: JSON.stringify(roleForm),
        });
        showToast('Role created successfully', 'success');
      }
      setShowRoleModal(false);
      loadData();
    } catch (err: any) {
      showToast(err.message || 'Failed to save role', 'error');
    }
  };

  const handleDeleteRole = (r: any) => {
    confirmAction({
      title: 'Delete Custom Role',
      message: `Are you sure you want to delete custom role "${r.name}"?`,
      confirmLabel: 'Delete Role',
      danger: true,
      onConfirm: async () => {
        try {
          await apiRequest(`/roles/${r.id}`, { method: 'DELETE' });
          showToast('Custom role deleted', 'info');
          loadData();
        } catch (err: any) {
          showToast(err.message || 'Failed to delete role', 'error');
        }
      },
    });
  };

  const togglePermission = (list: string[], code: string): string[] => {
    return list.includes(code) ? list.filter(k => k !== code) : [...list, code];
  };

  return (
    <div className="space-y-5">
      {/* Tabs */}
      <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab('users')}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
              activeTab === 'users'
                ? 'bg-slate-900 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <Users className="w-4 h-4" />
            Employees & Users ({users.length})
          </button>
          <button
            onClick={() => setActiveTab('roles')}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
              activeTab === 'roles'
                ? 'bg-slate-900 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <Shield className="w-4 h-4" />
            Roles & Permission Matrix ({roles.length})
          </button>
        </div>

        {activeTab === 'users' ? (
          <button
            onClick={handleOpenCreateUser}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold rounded-lg shadow-xs cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            Add Employee / User
          </button>
        ) : (
          <button
            onClick={handleOpenCreateRole}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold rounded-lg shadow-xs cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            Create Custom Role
          </button>
        )}
      </div>

      {activeTab === 'users' ? (
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden">
          {loading ? (
            <div className="py-16 text-center text-sm text-slate-400">Loading employees & user accounts...</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50/80 text-[11px] font-semibold uppercase tracking-wider text-slate-500 border-b border-slate-200">
                    <th className="py-3 px-4">Employee / Full Name</th>
                    <th className="py-3 px-4">Username & Contact</th>
                    <th className="py-3 px-4">Assigned Role</th>
                    <th className="py-3 px-4">Permission Scope</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Last Login</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {users.map((u) => (
                    <tr key={u.id} className="hover:bg-slate-50/80">
                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-900">
                          {u.full_name}
                          {currentUser?.id === u.id && (
                            <span className="ml-2 text-[10px] bg-teal-50 text-teal-700 px-1.5 py-0.5 rounded font-semibold">You</span>
                          )}
                        </div>
                        {u.designation && <div className="text-[11px] text-teal-600 font-medium">{u.designation}</div>}
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-mono font-semibold text-slate-800">{u.username}</div>
                        {u.phone && <div className="text-[11px] text-slate-500">{u.phone}</div>}
                        {u.email && <div className="text-[11px] text-slate-400">{u.email}</div>}
                      </td>
                      <td className="py-3 px-4">
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-xs font-semibold bg-slate-100 text-slate-800">
                          <Shield className="w-3 h-3 text-teal-600" />
                          {u.role_name}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-slate-600">
                        {u.role_name === 'Admin'
                          ? `Full System Access (All ${ALL_PERMISSIONS.length} Permissions)`
                          : u.custom_permissions_json
                          ? `Custom Override (${(u.effective_permissions || []).length} permissions)`
                          : `Role Default (${(u.effective_permissions || []).length} permissions)`}
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                            u.status === 'Active' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
                          }`}
                        >
                          {u.status === 'Active' ? <UserCheck className="w-3 h-3" /> : <UserX className="w-3 h-3" />}
                          {u.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-slate-500">{u.last_login ? formatDateTime(u.last_login) : 'Never'}</td>
                      <td className="py-3 px-4 text-right">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            onClick={() => handleOpenEditUser(u)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md font-medium transition-colors cursor-pointer"
                            title="Edit Employee / Permissions"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                            Edit
                          </button>
                          {u.id !== 1 && currentUser?.id !== u.id && (
                            <button
                              onClick={() => handleDeleteUser(u)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-red-50 hover:bg-red-100 text-red-700 rounded-md font-medium transition-colors cursor-pointer"
                              title="Delete Employee / Move to Trash"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              Delete
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {roles.map((r) => {
            const codes = getRolePermCodes(r.id);
            return (
              <div key={r.id} className="bg-white rounded-xl border border-slate-200/80 p-5 shadow-xs flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Shield className="w-5 h-5 text-teal-600" />
                      <h3 className="text-base font-bold text-slate-900">{r.name}</h3>
                      {r.is_system ? (
                        <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded bg-slate-100 text-slate-600">
                          System Role
                        </span>
                      ) : null}
                    </div>
                    {r.name !== 'Admin' && (
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => handleOpenEditRole(r)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-teal-700 bg-teal-50 hover:bg-teal-100 rounded-lg cursor-pointer"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                          Configure
                        </button>
                        {!r.is_system && (
                          <button
                            onClick={() => handleDeleteRole(r)}
                            className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg cursor-pointer"
                            title="Delete Custom Role"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 mb-4">{r.description || 'Custom permission role'}</p>
                </div>
                <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                  <span className="text-slate-500">Granted Permissions:</span>
                  <span className="font-bold text-slate-800">
                    {r.name === 'Admin' ? 'All (Full Access)' : `${codes.length} / ${ALL_PERMISSIONS.length}`}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Employee / User Modal */}
      {showUserModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-xl border border-slate-200 shadow-2xl w-full max-w-3xl overflow-hidden my-8">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <h3 className="text-base font-bold text-slate-900">
                {editingUser ? `Edit Employee / User: ${editingUser.full_name}` : 'Add New Employee / User'}
              </h3>
              <button onClick={() => setShowUserModal(false)} className="text-slate-400 hover:text-slate-600 text-sm font-medium cursor-pointer">
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveUser} className="p-6 space-y-5 max-h-[82vh] overflow-y-auto">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Employee Full Name *</label>
                  <input
                    type="text"
                    required
                    value={userForm.full_name}
                    onChange={(e) => setUserForm({ ...userForm, full_name: e.target.value })}
                    placeholder="e.g. Bilal Ahmed"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Designation / Job Title</label>
                  <input
                    type="text"
                    value={userForm.designation}
                    onChange={(e) => setUserForm({ ...userForm, designation: e.target.value })}
                    placeholder="e.g. Community Manager / Receptionist / Accountant"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Username *</label>
                  <input
                    type="text"
                    required
                    value={userForm.username}
                    onChange={(e) => setUserForm({ ...userForm, username: e.target.value })}
                    placeholder="e.g. bilal.desk"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Phone Number</label>
                  <input
                    type="text"
                    value={userForm.phone}
                    onChange={(e) => setUserForm({ ...userForm, phone: e.target.value })}
                    placeholder="e.g. +92 300 1234567"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Email Address (Optional)</label>
                  <input
                    type="email"
                    value={userForm.email}
                    onChange={(e) => setUserForm({ ...userForm, email: e.target.value })}
                    placeholder="bilal@company.pk"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    {editingUser ? 'New Password (leave blank to keep current)' : 'Password *'}
                  </label>
                  <input
                    type="password"
                    required={!editingUser}
                    value={userForm.password}
                    onChange={(e) => setUserForm({ ...userForm, password: e.target.value })}
                    placeholder="Minimum 6 characters"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Role *</label>
                  <select
                    value={userForm.role_id}
                    onChange={(e) => {
                      const rid = Number(e.target.value);
                      setUserForm({
                        ...userForm,
                        role_id: e.target.value,
                        custom_permissions: !userForm.useCustomPermissions ? getRolePermCodes(rid) : userForm.custom_permissions,
                      });
                    }}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
                  >
                    {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Account Status</label>
                  <select
                    value={userForm.status}
                    onChange={(e) => setUserForm({ ...userForm, status: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
                  >
                    <option value="Active">Active</option>
                    <option value="Disabled">Disabled</option>
                  </select>
                </div>
              </div>

              {/* Per-user Custom Permissions Override */}
              <div className="border-t border-slate-200 pt-4">
                <label className="flex items-center gap-2 text-xs font-bold text-slate-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={userForm.useCustomPermissions}
                    onChange={(e) => setUserForm({ ...userForm, useCustomPermissions: e.target.checked })}
                    className="rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                  />
                  Override Role Permissions with Custom Per-User Permissions
                </label>

                {userForm.useCustomPermissions && (
                  <div className="mt-3 space-y-4 bg-slate-50 p-4 rounded-xl border border-slate-200 max-h-72 overflow-y-auto">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-slate-600">
                        Selected: {userForm.custom_permissions.length} of {ALL_PERMISSIONS.length}
                      </span>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => setUserForm({ ...userForm, custom_permissions: ALL_PERMISSIONS.map(p => p.code) })}
                          className="text-[11px] text-teal-700 font-semibold hover:underline cursor-pointer"
                        >
                          Select All
                        </button>
                        <button
                          type="button"
                          onClick={() => setUserForm({ ...userForm, custom_permissions: [] })}
                          className="text-[11px] text-slate-500 font-semibold hover:underline cursor-pointer"
                        >
                          Clear All
                        </button>
                      </div>
                    </div>

                    {Object.entries(permissionsByModule).map(([mod, perms]) => (
                      <div key={mod} className="bg-white p-3 rounded-lg border border-slate-200/80">
                        <div className="text-xs font-bold text-slate-800 mb-2">{mod}</div>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                          {perms.map(perm => (
                            <label key={perm.code} className="flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={userForm.custom_permissions.includes(perm.code)}
                                onChange={() =>
                                  setUserForm({
                                    ...userForm,
                                    custom_permissions: togglePermission(userForm.custom_permissions, perm.code),
                                  })
                                }
                                className="rounded border-slate-300 text-teal-600"
                              />
                              <span>{perm.name}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowUserModal(false)}
                  className="px-4 py-2 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-lg text-xs font-semibold bg-teal-600 hover:bg-teal-700 text-white shadow-xs cursor-pointer"
                >
                  {editingUser ? 'Save Employee / User' : 'Create Employee / User'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Role Modal */}
      {showRoleModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-xl border border-slate-200 shadow-2xl w-full max-w-3xl overflow-hidden my-8">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <h3 className="text-base font-bold text-slate-900">
                {editingRole ? `Configure Role: ${editingRole.name}` : 'Create New Role'}
              </h3>
              <button onClick={() => setShowRoleModal(false)} className="text-slate-400 hover:text-slate-600 text-sm font-medium cursor-pointer">
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveRole} className="p-6 space-y-4 max-h-[82vh] overflow-y-auto">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Role Name *</label>
                  <input
                    type="text"
                    required
                    value={roleForm.name}
                    onChange={(e) => setRoleForm({ ...roleForm, name: e.target.value })}
                    placeholder="e.g. Operations Coordinator"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Description</label>
                  <input
                    type="text"
                    value={roleForm.description}
                    onChange={(e) => setRoleForm({ ...roleForm, description: e.target.value })}
                    placeholder="Brief description of responsibilities"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                  />
                </div>
              </div>

              <div className="space-y-3 bg-slate-50 p-4 rounded-xl border border-slate-200 max-h-96 overflow-y-auto">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-700">
                    Role Permissions ({roleForm.permission_codes.length} / {ALL_PERMISSIONS.length})
                  </span>
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => setRoleForm({ ...roleForm, permission_codes: ALL_PERMISSIONS.map(p => p.code) })}
                      className="text-xs text-teal-700 font-semibold hover:underline cursor-pointer"
                    >
                      Grant All
                    </button>
                    <button
                      type="button"
                      onClick={() => setRoleForm({ ...roleForm, permission_codes: [] })}
                      className="text-xs text-slate-500 font-semibold hover:underline cursor-pointer"
                    >
                      Revoke All
                    </button>
                  </div>
                </div>

                {Object.entries(permissionsByModule).map(([mod, perms]) => (
                  <div key={mod} className="bg-white p-3 rounded-lg border border-slate-200/80">
                    <div className="text-xs font-bold text-slate-800 mb-2">{mod}</div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {perms.map(perm => (
                        <label key={perm.code} className="flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={roleForm.permission_codes.includes(perm.code)}
                            onChange={() =>
                              setRoleForm({
                                ...roleForm,
                                permission_codes: togglePermission(roleForm.permission_codes, perm.code),
                              })
                            }
                            className="rounded border-slate-300 text-teal-600"
                          />
                          <span>{perm.name}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowRoleModal(false)}
                  className="px-4 py-2 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-lg text-xs font-semibold bg-teal-600 hover:bg-teal-700 text-white shadow-xs cursor-pointer"
                >
                  Save Role Permissions
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
