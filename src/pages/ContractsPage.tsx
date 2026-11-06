import React, { useState, useEffect, useCallback } from 'react';
import { useApp } from '../context/AppContext';
import { apiRequest } from '../services/api';
import { formatCurrency, formatDate } from '../utils/format';
import { Plus, Search, RefreshCw, Edit2, Trash2, X, Printer } from 'lucide-react';

const CONTRACT_STATUSES = ['Active', 'Expiring Soon', 'Expired', 'Cancelled'];
const QUICK_REQUIREMENT_CHIPS = [
  'Executive Ergonomic Chairs',
  'Work Desks / Tables',
  'Dedicated Split AC',
  'Lockable Pedestal Drawers',
  'Glass Whiteboard',
  'High-Speed Wi-Fi + LAN Ports',
  'Biometric Access Cards',
  '24/7 Generator / UPS Backup',
  'Tea / Coffee & Pantry Access',
];

export default function ContractsPage() {
  const { hasPermission, appSettings, showToast, confirmAction, openPrintPreview } = useApp();
  const [contracts, setContracts] = useState<any[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [workspaces, setWorkspaces] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');

  const [showModal, setShowModal] = useState(false);
  const [editingContract, setEditingContract] = useState<any>(null);
  const [renewingFrom, setRenewingFrom] = useState<any>(null);
  const [saving, setSaving] = useState(false);

  const symbol = appSettings?.currency_symbol || 'Rs.';

  const [form, setForm] = useState({
    client_id: '',
    workspace_id: '',
    start_date: new Date().toISOString().slice(0, 10),
    end_date: new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString().slice(0, 10),
    monthly_rent: 50000,
    security_deposit: 100000,
    payment_due_day: 5,
    chairs_count: 4,
    tables_count: 2,
    ac_units: 1,
    lockers_count: 1,
    custom_requirements: '',
    contract_terms: 'Standard 12-month coworking office agreement with 30-day notice period.',
    additional_charges: 0,
    notes: '',
    status: 'Active',
  });

  const fetchContractsData = useCallback(async () => {
    setLoading(true);
    try {
      const [ctRes, clRes, wsRes] = await Promise.all([
        apiRequest('/contracts'),
        apiRequest('/clients').catch(() => ({ clients: [] })),
        apiRequest('/workspaces').catch(() => ({ workspaces: [] })),
      ]);
      setContracts(ctRes.contracts || []);
      setClients(clRes.clients || []);
      setWorkspaces(wsRes.workspaces || []);
    } catch (err: any) {
      showToast(err.message || 'Failed to load contracts', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    fetchContractsData();
  }, [fetchContractsData]);

  const openCreateModal = () => {
    setEditingContract(null);
    setRenewingFrom(null);
    const defaultWs = workspaces[0];
    setForm({
      client_id: clients[0]?.id ? String(clients[0].id) : '',
      workspace_id: defaultWs?.id ? String(defaultWs.id) : '',
      start_date: new Date().toISOString().slice(0, 10),
      end_date: new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString().slice(0, 10),
      monthly_rent: defaultWs?.monthly_price || 50000,
      security_deposit: (defaultWs?.monthly_price || 50000) * 2,
      payment_due_day: 5,
      chairs_count: defaultWs?.capacity ? Number(defaultWs.capacity) : 4,
      tables_count: defaultWs?.capacity ? Math.max(1, Math.ceil(Number(defaultWs.capacity) / 2)) : 2,
      ac_units: 1,
      lockers_count: 1,
      custom_requirements: '',
      contract_terms: 'Standard coworking office lease agreement including high-speed internet, backup power, and communal facilities.',
      additional_charges: 0,
      notes: '',
      status: 'Active',
    });
    setShowModal(true);
  };

  const openRenewModal = (ct: any) => {
    setEditingContract(null);
    setRenewingFrom(ct);
    const nextStart = ct.end_date || new Date().toISOString().slice(0, 10);
    const nextEndObj = new Date(nextStart);
    nextEndObj.setFullYear(nextEndObj.getFullYear() + 1);
    setForm({
      client_id: String(ct.client_id),
      workspace_id: String(ct.workspace_id),
      start_date: nextStart,
      end_date: nextEndObj.toISOString().slice(0, 10),
      monthly_rent: Number(ct.monthly_rent) || 0,
      security_deposit: Number(ct.security_deposit) || 0,
      payment_due_day: Number(ct.payment_due_day) || 5,
      chairs_count: Number(ct.chairs_count) || 0,
      tables_count: Number(ct.tables_count) || 0,
      ac_units: Number(ct.ac_units) || 0,
      lockers_count: Number(ct.lockers_count) || 0,
      custom_requirements: ct.custom_requirements || '',
      contract_terms: ct.contract_terms || '',
      additional_charges: Number(ct.additional_charges) || 0,
      notes: `Renewed from previous contract ${ct.contract_number}`,
      status: 'Active',
    });
    setShowModal(true);
  };

  const openEditModal = (ct: any) => {
    setEditingContract(ct);
    setRenewingFrom(null);
    setForm({
      client_id: String(ct.client_id),
      workspace_id: String(ct.workspace_id),
      start_date: ct.start_date,
      end_date: ct.end_date,
      monthly_rent: Number(ct.monthly_rent) || 0,
      security_deposit: Number(ct.security_deposit) || 0,
      payment_due_day: Number(ct.payment_due_day) || 5,
      chairs_count: Number(ct.chairs_count) || 0,
      tables_count: Number(ct.tables_count) || 0,
      ac_units: Number(ct.ac_units) || 0,
      lockers_count: Number(ct.lockers_count) || 0,
      custom_requirements: ct.custom_requirements || '',
      contract_terms: ct.contract_terms || '',
      additional_charges: Number(ct.additional_charges) || 0,
      notes: ct.notes || '',
      status: ct.status || 'Active',
    });
    setShowModal(true);
  };

  const handleAppendRequirementChip = (chipText: string) => {
    setForm((prev) => {
      const existing = prev.custom_requirements.trim();
      const bullet = `• ${chipText}`;
      if (existing.includes(chipText)) return prev;
      return {
        ...prev,
        custom_requirements: existing ? `${existing}\n${bullet}` : bullet,
      };
    });
  };

  const handlePrintContract = (ct: any) => {
    openPrintPreview({
      type: 'contract',
      title: `Contract ${ct.contract_number} — ${ct.client_name}`,
      data: ct,
    });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editingContract) {
        await apiRequest(`/contracts/${editingContract.id}`, {
          method: 'PUT',
          body: JSON.stringify(form),
        });
      } else {
        await apiRequest('/contracts', {
          method: 'POST',
          body: JSON.stringify({
            ...form,
            renewed_from_id: renewingFrom?.id || null,
          }),
        });
      }
      showToast('Saved successfully.', 'success');
      setShowModal(false);
      fetchContractsData();
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (ct: any) => {
    confirmAction({
      title: 'Move Contract to Trash',
      message: `Move contract "${ct.contract_number}" for ${ct.client_name} to Trash? Previous contract history remains recoverable from Trash.`,
      confirmLabel: 'Move to Trash',
      danger: true,
      requireReason: true,
      onConfirm: async (reason) => {
        await apiRequest(`/contracts/${ct.id}`, {
          method: 'DELETE',
          body: JSON.stringify({ reason }),
        });
        showToast('Contract moved to Trash.', 'info');
        fetchContractsData();
      },
    });
  };

  const filtered = contracts.filter((ct) => {
    if (statusFilter !== 'All' && ct.status !== statusFilter) return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      ct.contract_number?.toLowerCase().includes(q) ||
      ct.client_name?.toLowerCase().includes(q) ||
      ct.company_name?.toLowerCase().includes(q) ||
      ct.workspace_number?.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-5">
      {/* Toolbar */}
      <div className="bg-white border border-slate-200 rounded-lg p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3 flex-1">
          <div className="relative flex-1 min-w-[220px] max-w-sm">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search contract number, client, workspace..."
              className="w-full pl-9 pr-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
            />
          </div>

          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
            {['All', ...CONTRACT_STATUSES].map((st) => (
              <button
                key={st}
                onClick={() => setStatusFilter(st)}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  statusFilter === st ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {st}
              </button>
            ))}
          </div>
        </div>

        {hasPermission('contracts.create') && (
          <button
            onClick={openCreateModal}
            className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg flex items-center gap-1.5 whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            <span>+ New Contract</span>
          </button>
        )}
      </div>

      {/* Contracts Table */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-xs text-slate-500">Loading contracts...</div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <div className="text-sm font-semibold text-slate-900">No contracts found.</div>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              Create rental agreements linking clients to workspaces with monthly rent, security deposit, and automatic expiry alerts.
            </p>
            {hasPermission('contracts.create') && (
              <button
                onClick={openCreateModal}
                className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg inline-flex items-center gap-1.5"
              >
                <Plus className="w-4 h-4" />
                <span>+ Create Contract</span>
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                <tr>
                  <th className="py-3 px-4 text-left font-semibold">Contract #</th>
                  <th className="py-3 px-4 text-left font-semibold">Client</th>
                  <th className="py-3 px-4 text-left font-semibold">Workspace & Equipment</th>
                  <th className="py-3 px-4 text-left font-semibold">Start Date</th>
                  <th className="py-3 px-4 text-left font-semibold">End Date</th>
                  <th className="py-3 px-4 text-right font-semibold">Monthly Rent</th>
                  <th className="py-3 px-4 text-right font-semibold">Security Deposit</th>
                  <th className="py-3 px-4 text-left font-semibold">Status</th>
                  <th className="py-3 px-4 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filtered.map((ct) => (
                  <tr key={ct.id} className="hover:bg-slate-50">
                    <td className="py-3 px-4 font-mono font-semibold text-slate-900">
                      <div>{ct.contract_number}</div>
                      {ct.renewed_from_id && <div className="text-[10px] text-slate-400">Renewed Agreement</div>}
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-semibold text-slate-900">{ct.client_name}</div>
                      <div className="text-slate-500">{ct.company_name || 'Individual'}</div>
                    </td>
                    <td className="py-3 px-4">
                      <div>
                        <span className="font-mono font-semibold">{ct.workspace_number}</span> · {ct.workspace_name}
                      </div>
                      <div className="text-[11px] text-teal-700 font-medium mt-0.5">
                        {[
                          ct.chairs_count ? `${ct.chairs_count} Chairs` : '',
                          ct.tables_count ? `${ct.tables_count} Tables` : '',
                          ct.ac_units ? `${ct.ac_units} AC` : '',
                          ct.lockers_count ? `${ct.lockers_count} Lockers` : '',
                        ]
                          .filter(Boolean)
                          .join(' · ') || 'Standard Setup'}
                      </div>
                      {ct.custom_requirements && (
                        <div className="text-[11px] text-slate-500 max-w-xs truncate" title={ct.custom_requirements}>
                          {ct.custom_requirements}
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-4 font-mono">{formatDate(ct.start_date)}</td>
                    <td className="py-3 px-4 font-mono font-medium">{formatDate(ct.end_date)}</td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold">
                      {formatCurrency(ct.monthly_rent, symbol)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-600">
                      {formatCurrency(ct.security_deposit, symbol)}
                    </td>
                    <td className="py-3 px-4 font-semibold">
                      <span
                        className={
                          ct.status === 'Active'
                            ? 'text-emerald-700'
                            : ct.status === 'Expiring Soon'
                            ? 'text-amber-700'
                            : ct.status === 'Expired'
                            ? 'text-red-600'
                            : 'text-slate-500'
                        }
                      >
                        {ct.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => handlePrintContract(ct)}
                          className="p-1.5 text-teal-600 hover:text-teal-800 hover:bg-teal-50 rounded cursor-pointer"
                          title="Print / Save Contract Agreement (A4)"
                        >
                          <Printer className="w-4 h-4" />
                        </button>
                        {hasPermission('contracts.create') && (
                          <button
                            onClick={() => openRenewModal(ct)}
                            className="px-2.5 py-1 text-xs font-medium bg-slate-100 hover:bg-slate-200 text-slate-800 rounded flex items-center gap-1 cursor-pointer"
                            title="Renew Contract (Preserves Previous Contract History)"
                          >
                            <RefreshCw className="w-3 h-3" />
                            <span>Renew</span>
                          </button>
                        )}
                        {hasPermission('contracts.edit') && (
                          <button
                            onClick={() => openEditModal(ct)}
                            className="p-1.5 text-slate-600 hover:text-slate-900 rounded"
                            title="Edit Contract"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                        )}
                        {hasPermission('contracts.delete') && (
                          <button
                            onClick={() => handleDelete(ct)}
                            className="p-1.5 text-slate-400 hover:text-red-600 rounded"
                            title="Move to Trash"
                          >
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
      </div>

      {/* Create / Edit / Renew Contract Modal */}
      {showModal && (
        <div className="fixed inset-0 z-40 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl max-w-2xl w-full max-h-[90vh] flex flex-col shadow-2xl">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900">
                {renewingFrom
                  ? `Renew Contract (Previous: ${renewingFrom.contract_number})`
                  : editingContract
                  ? `Edit Contract — ${editingContract.contract_number}`
                  : 'Create Workspace Rental Contract'}
              </h3>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="p-6 overflow-y-auto space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Client *</label>
                  <select
                    required
                    value={form.client_id}
                    onChange={(e) => setForm({ ...form, client_id: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                  >
                    <option value="">— Select Client —</option>
                    {clients.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.client_name} {c.company_name ? `(${c.company_name})` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Workspace / Office *</label>
                  <select
                    required
                    value={form.workspace_id}
                    onChange={(e) => {
                      const ws = workspaces.find((w) => String(w.id) === e.target.value);
                      setForm({
                        ...form,
                        workspace_id: e.target.value,
                        monthly_rent: ws ? Number(ws.monthly_price) : form.monthly_rent,
                      });
                    }}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                  >
                    <option value="">— Select Workspace —</option>
                    {workspaces.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.workspace_number} — {w.name} ({formatCurrency(w.monthly_price, symbol)}/mo)
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Start Date *</label>
                  <input
                    type="date"
                    required
                    value={form.start_date}
                    onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">End Date *</label>
                  <input
                    type="date"
                    required
                    value={form.end_date}
                    onChange={(e) => setForm({ ...form, end_date: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Monthly Rent ({symbol}) *</label>
                  <input
                    type="number"
                    min={0}
                    required
                    value={form.monthly_rent}
                    onChange={(e) => setForm({ ...form, monthly_rent: Number(e.target.value) })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Security Deposit ({symbol})</label>
                  <input
                    type="number"
                    min={0}
                    value={form.security_deposit}
                    onChange={(e) => setForm({ ...form, security_deposit: Number(e.target.value) })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Monthly Payment Due Day (1–28)</label>
                  <input
                    type="number"
                    min={1}
                    max={28}
                    value={form.payment_due_day}
                    onChange={(e) => setForm({ ...form, payment_due_day: Number(e.target.value) })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Recurring Additional Charges ({symbol})</label>
                  <input
                    type="number"
                    min={0}
                    value={form.additional_charges}
                    onChange={(e) => setForm({ ...form, additional_charges: Number(e.target.value) })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
                  />
                </div>

                {editingContract && (
                  <div className="sm:col-span-2">
                    <label className="block font-semibold text-slate-700 mb-1">Contract Status</label>
                    <select
                      value={form.status}
                      onChange={(e) => setForm({ ...form, status: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                    >
                      {CONTRACT_STATUSES.map((st) => (
                        <option key={st} value={st}>
                          {st}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Furniture, AC & Custom Client Inventory Requirements */}
                <div className="sm:col-span-2 border border-slate-200 rounded-xl p-4 bg-slate-50/70 space-y-3">
                  <div className="font-bold text-slate-900 text-xs">
                    Client Furniture, AC, Tables & Custom Facility Requirements
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Chairs Needed</label>
                      <input
                        type="number"
                        min={0}
                        value={form.chairs_count}
                        onChange={(e) => setForm({ ...form, chairs_count: Number(e.target.value) })}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono bg-white"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Tables / Desks</label>
                      <input
                        type="number"
                        min={0}
                        value={form.tables_count}
                        onChange={(e) => setForm({ ...form, tables_count: Number(e.target.value) })}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono bg-white"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">AC Units</label>
                      <input
                        type="number"
                        min={0}
                        value={form.ac_units}
                        onChange={(e) => setForm({ ...form, ac_units: Number(e.target.value) })}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono bg-white"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Lockers / Cabinets</label>
                      <input
                        type="number"
                        min={0}
                        value={form.lockers_count}
                        onChange={(e) => setForm({ ...form, lockers_count: Number(e.target.value) })}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono bg-white"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      Additional Items, Equipment & Anything Else Client Needs (Text)
                    </label>
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {QUICK_REQUIREMENT_CHIPS.map((chip) => (
                        <button
                          key={chip}
                          type="button"
                          onClick={() => handleAppendRequirementChip(chip)}
                          className="px-2 py-1 text-[11px] font-medium bg-white border border-slate-300 hover:border-teal-600 hover:text-teal-700 rounded-md transition-colors cursor-pointer"
                        >
                          + {chip}
                        </button>
                      ))}
                    </div>
                    <textarea
                      rows={3}
                      value={form.custom_requirements}
                      onChange={(e) => setForm({ ...form, custom_requirements: e.target.value })}
                      placeholder="Write any custom items client needs: e.g. 6 Executive Chairs, 2 L-Shaped Manager Tables, 1.5 Ton Inverter AC, 1 Glass Whiteboard, 4 Door Access Cards, Dedicated Static IP..."
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                    />
                  </div>
                </div>

                <div className="sm:col-span-2">
                  <label className="block font-semibold text-slate-700 mb-1">Contract Terms & Clauses</label>
                  <textarea
                    rows={3}
                    value={form.contract_terms}
                    onChange={(e) => setForm({ ...form, contract_terms: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block font-semibold text-slate-700 mb-1">Internal Notes</label>
                  <input
                    type="text"
                    value={form.notes}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
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
                  {saving ? 'Saving...' : renewingFrom ? 'Confirm Contract Renewal' : 'Save Contract'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
