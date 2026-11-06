import React, { useState, useEffect, useCallback } from 'react';
import { useApp } from '../context/AppContext';
import { apiRequest } from '../services/api';
import { formatCurrency, formatDate } from '../utils/format';
import { DEFAULT_WORKSPACE_TYPES } from '../shared/permissions';
import { Plus, Search, Edit2, Trash2, X, LayoutGrid, List } from 'lucide-react';

const WORKSPACE_STATUSES = ['Available', 'Occupied', 'Reserved', 'Maintenance', 'Inactive'];

export default function WorkspacesPage() {
  const { hasPermission, appSettings, showToast, confirmAction } = useApp();
  const [workspaces, setWorkspaces] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [typeFilter, setTypeFilter] = useState('All');
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');

  const [showModal, setShowModal] = useState(false);
  const [editingWs, setEditingWs] = useState<any>(null);
  const [saving, setSaving] = useState(false);

  const symbol = appSettings?.currency_symbol || 'Rs.';

  const [form, setForm] = useState({
    workspace_number: '',
    floor: '1st Floor',
    type: 'Private Office',
    name: '',
    capacity: 4,
    monthly_price: 50000,
    daily_price: 2500,
    status: 'Available',
    description: '',
    amenities: 'High-Speed Fiber Internet, Backup Power, AC, Tea/Coffee',
    notes: '',
  });

  const fetchWorkspaces = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiRequest('/workspaces');
      setWorkspaces(res.workspaces || []);
    } catch (err: any) {
      showToast(err.message || 'Failed to load workspaces', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    fetchWorkspaces();
  }, [fetchWorkspaces]);

  const openAddModal = () => {
    setEditingWs(null);
    setForm({
      workspace_number: '',
      floor: '1st Floor',
      type: 'Private Office',
      name: '',
      capacity: 4,
      monthly_price: 50000,
      daily_price: 2500,
      status: 'Available',
      description: '',
      amenities: 'High-Speed Fiber Internet, Backup Power, AC, Tea/Coffee',
      notes: '',
    });
    setShowModal(true);
  };

  const openEditModal = (w: any) => {
    setEditingWs(w);
    setForm({
      workspace_number: w.workspace_number || '',
      floor: w.floor || '1st Floor',
      type: w.type || 'Private Office',
      name: w.name || '',
      capacity: Number(w.capacity) || 1,
      monthly_price: Number(w.monthly_price) || 0,
      daily_price: Number(w.daily_price) || 0,
      status: w.status || 'Available',
      description: w.description || '',
      amenities: w.amenities || '',
      notes: w.notes || '',
    });
    setShowModal(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editingWs) {
        await apiRequest(`/workspaces/${editingWs.id}`, {
          method: 'PUT',
          body: JSON.stringify(form),
        });
      } else {
        await apiRequest('/workspaces', {
          method: 'POST',
          body: JSON.stringify(form),
        });
      }
      showToast('Saved successfully.', 'success');
      setShowModal(false);
      fetchWorkspaces();
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (w: any) => {
    confirmAction({
      title: 'Move Workspace to Trash',
      message: `Move workspace "${w.workspace_number} — ${w.name}" to Trash? You can restore it later from the Trash module.`,
      confirmLabel: 'Move to Trash',
      danger: true,
      requireReason: true,
      onConfirm: async (reason) => {
        await apiRequest(`/workspaces/${w.id}`, {
          method: 'DELETE',
          body: JSON.stringify({ reason }),
        });
        showToast('Workspace moved to Trash.', 'info');
        fetchWorkspaces();
      },
    });
  };

  const filtered = workspaces.filter((w) => {
    if (statusFilter !== 'All' && w.status !== statusFilter) return false;
    if (typeFilter !== 'All' && w.type !== typeFilter) return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      w.workspace_number?.toLowerCase().includes(q) ||
      w.name?.toLowerCase().includes(q) ||
      w.type?.toLowerCase().includes(q) ||
      w.floor?.toLowerCase().includes(q) ||
      w.current_client_name?.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-5">
      {/* Status Summary Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {WORKSPACE_STATUSES.map((st) => {
          const count = workspaces.filter((w) => w.status === st).length;
          return (
            <button
              key={st}
              onClick={() => setStatusFilter(statusFilter === st ? 'All' : st)}
              className={`p-3.5 rounded-lg border text-left transition-colors ${
                statusFilter === st
                  ? 'bg-slate-900 text-white border-slate-900'
                  : 'bg-white text-slate-900 border-slate-200 hover:bg-slate-50'
              }`}
            >
              <div className={`text-xs ${statusFilter === st ? 'text-slate-300' : 'text-slate-500'}`}>{st}</div>
              <div className="text-xl font-bold font-mono tabular-nums mt-0.5">{count}</div>
            </button>
          );
        })}
      </div>

      {/* Filter & Search Bar */}
      <div className="bg-white border border-slate-200 rounded-lg p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3 flex-1">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search office number, name, floor, client..."
              className="w-full pl-9 pr-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
            />
          </div>

          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
          >
            <option value="All">All Workspace Types</option>
            {DEFAULT_WORKSPACE_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
          >
            <option value="All">All Statuses</option>
            {WORKSPACE_STATUSES.map((st) => (
              <option key={st} value={st}>
                {st}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
            <button
              onClick={() => setViewMode('grid')}
              className={`px-2.5 py-1.5 text-xs font-medium rounded-md flex items-center gap-1 ${
                viewMode === 'grid' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>Visual Map</span>
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={`px-2.5 py-1.5 text-xs font-medium rounded-md flex items-center gap-1 ${
                viewMode === 'table' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
              }`}
            >
              <List className="w-3.5 h-3.5" />
              <span>Table</span>
            </button>
          </div>

          {hasPermission('workspaces.create') && (
            <button
              onClick={openAddModal}
              className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg flex items-center gap-1.5 whitespace-nowrap"
            >
              <Plus className="w-4 h-4" />
              <span>+ Add Workspace</span>
            </button>
          )}
        </div>
      </div>

      {/* Visual Workspace Overview or Table */}
      {loading ? (
        <div className="bg-white border border-slate-200 rounded-lg p-8 text-center text-xs text-slate-500">
          Loading workspaces...
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-lg p-12 text-center space-y-3">
          <div className="text-sm font-semibold text-slate-900">No workspaces added yet.</div>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            Add private offices, shared offices, dedicated desks, hot desks, and meeting rooms to track occupancy and rent.
          </p>
          {hasPermission('workspaces.create') && (
            <button
              onClick={openAddModal}
              className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg inline-flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              <span>+ Add Workspace</span>
            </button>
          )}
        </div>
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((w) => (
            <div
              key={w.id}
              className="bg-white border border-slate-200 rounded-lg p-5 flex flex-col justify-between hover:border-slate-300 transition-colors"
            >
              <div>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <span className="font-mono font-bold text-slate-900">{w.workspace_number}</span>
                      <span>·</span>
                      <span>{w.floor}</span>
                      <span>·</span>
                      <span>{w.type}</span>
                    </div>
                    <h3 className="text-base font-bold text-slate-900 mt-1">{w.name}</h3>
                  </div>

                  <span
                    className={`text-xs font-semibold ${
                      w.status === 'Available'
                        ? 'text-emerald-700'
                        : w.status === 'Occupied'
                        ? 'text-slate-900'
                        : w.status === 'Reserved'
                        ? 'text-amber-700'
                        : 'text-red-600'
                    }`}
                  >
                    {w.status}
                  </span>
                </div>

                <div className="mt-3 pt-3 border-t border-slate-100 grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-slate-500">Capacity:</span>{' '}
                    <span className="font-mono font-semibold text-slate-900">{w.capacity} Seats</span>
                  </div>
                  <div className="text-right">
                    <span className="text-slate-500">Monthly:</span>{' '}
                    <span className="font-mono font-bold text-slate-900">{formatCurrency(w.monthly_price, symbol)}</span>
                  </div>
                </div>

                {/* Current Client / Contract / Payment Status Details */}
                <div className="mt-3 pt-3 border-t border-slate-100 text-xs space-y-1">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Current Client:</span>
                    <span className="font-semibold text-slate-900">
                      {w.current_client_name
                        ? `${w.current_client_name}${w.current_company_name ? ` (${w.current_company_name})` : ''}`
                        : '— Vacant —'}
                    </span>
                  </div>
                  {w.current_contract_number && (
                    <>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Contract:</span>
                        <span className="font-mono text-slate-800">{w.current_contract_number}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Lease Period:</span>
                        <span className="font-mono text-slate-700">
                          {formatDate(w.contract_start_date)} → {formatDate(w.contract_end_date)}
                        </span>
                      </div>
                    </>
                  )}
                  {w.latest_payment_status && (
                    <div className="flex justify-between">
                      <span className="text-slate-500">Payment Status:</span>
                      <span
                        className={`font-semibold ${
                          w.latest_payment_status === 'Paid'
                            ? 'text-emerald-700'
                            : w.latest_payment_status === 'Overdue'
                            ? 'text-red-600'
                            : 'text-amber-700'
                        }`}
                      >
                        {w.latest_payment_status}
                      </span>
                    </div>
                  )}
                </div>

                {w.amenities && (
                  <p className="text-[11px] text-slate-500 mt-3 line-clamp-1">{w.amenities}</p>
                )}
              </div>

              <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                <span className="font-mono text-slate-400">{w.workspace_code}</span>
                <div className="flex items-center gap-2">
                  {hasPermission('workspaces.edit') && (
                    <button
                      onClick={() => openEditModal(w)}
                      className="text-slate-600 hover:text-slate-900 font-medium flex items-center gap-1"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                      <span>Edit</span>
                    </button>
                  )}
                  {hasPermission('workspaces.delete') && (
                    <button
                      onClick={() => handleDelete(w)}
                      className="text-slate-400 hover:text-red-600 flex items-center gap-1 ml-2"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-lg overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
              <tr>
                <th className="py-3 px-4 text-left font-semibold">Number</th>
                <th className="py-3 px-4 text-left font-semibold">Name & Type</th>
                <th className="py-3 px-4 text-left font-semibold">Floor</th>
                <th className="py-3 px-4 text-right font-semibold">Capacity</th>
                <th className="py-3 px-4 text-right font-semibold">Monthly Price</th>
                <th className="py-3 px-4 text-left font-semibold">Current Client</th>
                <th className="py-3 px-4 text-left font-semibold">Status</th>
                <th className="py-3 px-4 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filtered.map((w) => (
                <tr key={w.id} className="hover:bg-slate-50">
                  <td className="py-3 px-4 font-mono font-semibold text-slate-900">{w.workspace_number}</td>
                  <td className="py-3 px-4">
                    <div className="font-semibold text-slate-900">{w.name}</div>
                    <div className="text-slate-500">{w.type}</div>
                  </td>
                  <td className="py-3 px-4 text-slate-700">{w.floor}</td>
                  <td className="py-3 px-4 text-right font-mono">{w.capacity}</td>
                  <td className="py-3 px-4 text-right font-mono font-semibold">{formatCurrency(w.monthly_price, symbol)}</td>
                  <td className="py-3 px-4 text-slate-700">{w.current_client_name || '—'}</td>
                  <td className="py-3 px-4 font-semibold">{w.status}</td>
                  <td className="py-3 px-4 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      {hasPermission('workspaces.edit') && (
                        <button onClick={() => openEditModal(w)} className="p-1.5 text-slate-600 hover:text-slate-900">
                          <Edit2 className="w-4 h-4" />
                        </button>
                      )}
                      {hasPermission('workspaces.delete') && (
                        <button onClick={() => handleDelete(w)} className="p-1.5 text-slate-400 hover:text-red-600">
                          <Trash2 className="w-4 h-4" />
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

      {/* Add / Edit Workspace Modal */}
      {showModal && (
        <div className="fixed inset-0 z-40 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl max-w-xl w-full max-h-[90vh] flex flex-col shadow-2xl">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900">
                {editingWs ? `Edit Workspace — ${editingWs.workspace_number}` : 'Add New Workspace / Office'}
              </h3>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="p-6 overflow-y-auto space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Workspace Number / Code *</label>
                  <input
                    type="text"
                    required
                    value={form.workspace_number}
                    onChange={(e) => setForm({ ...form, workspace_number: e.target.value })}
                    placeholder="e.g. PO-101 or DD-204"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
                    autoFocus
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Workspace Type *</label>
                  <select
                    value={form.type}
                    onChange={(e) => setForm({ ...form, type: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                  >
                    {DEFAULT_WORKSPACE_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="sm:col-span-2">
                  <label className="block font-semibold text-slate-700 mb-1">Workspace Name / Title *</label>
                  <input
                    type="text"
                    required
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="e.g. Executive Suite 101 (6-Person)"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Floor / Zone</label>
                  <input
                    type="text"
                    value={form.floor}
                    onChange={(e) => setForm({ ...form, floor: e.target.value })}
                    placeholder="Ground Floor, 1st Floor..."
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Capacity (Seats)</label>
                  <input
                    type="number"
                    min={1}
                    value={form.capacity}
                    onChange={(e) => setForm({ ...form, capacity: Number(e.target.value) })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Monthly Price ({symbol}) *</label>
                  <input
                    type="number"
                    min={0}
                    required
                    value={form.monthly_price}
                    onChange={(e) => setForm({ ...form, monthly_price: Number(e.target.value) })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Daily Price ({symbol}) (Optional)</label>
                  <input
                    type="number"
                    min={0}
                    value={form.daily_price}
                    onChange={(e) => setForm({ ...form, daily_price: Number(e.target.value) })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block font-semibold text-slate-700 mb-1">Status</label>
                  <select
                    value={form.status}
                    onChange={(e) => setForm({ ...form, status: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                  >
                    {WORKSPACE_STATUSES.map((st) => (
                      <option key={st} value={st}>
                        {st}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="sm:col-span-2">
                  <label className="block font-semibold text-slate-700 mb-1">Amenities Included</label>
                  <input
                    type="text"
                    value={form.amenities}
                    onChange={(e) => setForm({ ...form, amenities: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block font-semibold text-slate-700 mb-1">Description / Notes</label>
                  <textarea
                    rows={2}
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg"
                >
                  {saving ? 'Saving...' : 'Save Workspace'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
