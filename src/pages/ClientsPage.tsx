import React, { useState, useEffect, useCallback } from 'react';
import { useApp } from '../context/AppContext';
import { apiRequest } from '../services/api';
import { formatCurrency, formatDate, formatDateTime, exportToExcel } from '../utils/format';
import {
  Plus,
  Search,
  Download,
  Printer,
  Edit2,
  Trash2,
  Eye,
  X,
  ArrowLeft,
  Upload,
  FileText,
  Camera,
  CreditCard,
  User,
} from 'lucide-react';

const STATUS_OPTIONS = ['Active', 'Inactive', 'Pending', 'Archived'];

export default function ClientsPage() {
  const { hasPermission, appSettings, company, showToast, confirmAction, openPrintPreview } = useApp();
  const [clients, setClients] = useState<any[]>([]);
  const [workspaces, setWorkspaces] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters, sorting, pagination
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [sortBy, setSortBy] = useState<'newest' | 'name' | 'balance'>('newest');
  const [page, setPage] = useState(1);
  const pageSize = 10;

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [editingClient, setEditingClient] = useState<any>(null);
  const [saving, setSaving] = useState(false);

  // Selected Client Profile 360 View
  const [selectedClientId, setSelectedClientId] = useState<number | null>(null);
  const [profileData, setProfileData] = useState<any>(null);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [previewImage, setPreviewImage] = useState<{ title: string; src: string } | null>(null);

  const symbol = appSettings?.currency_symbol || 'Rs.';

  const [form, setForm] = useState({
    client_name: '',
    company_name: '',
    phone: '',
    whatsapp: '',
    email: '',
    cnic: '',
    client_photo: '',
    cnic_front: '',
    cnic_back: '',
    address: '',
    city: 'Lahore',
    contact_person: '',
    business_type: '',
    notes: '',
    status: 'Active',
    workspace_id: '',
  });

  const fetchClients = useCallback(async () => {
    setLoading(true);
    try {
      const [clRes, wsRes] = await Promise.all([
        apiRequest('/clients'),
        apiRequest('/workspaces').catch(() => ({ workspaces: [] })),
      ]);
      setClients(clRes.clients || []);
      setWorkspaces(wsRes.workspaces || []);
    } catch (err: any) {
      showToast(err.message || 'Failed to load clients', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    fetchClients();
  }, [fetchClients]);

  const fetchClientProfile = useCallback(
    async (id: number) => {
      setLoadingProfile(true);
      try {
        const res = await apiRequest(`/clients/${id}`);
        setProfileData(res);
      } catch (err: any) {
        showToast(err.message || 'Failed to load client profile', 'error');
        setSelectedClientId(null);
      } finally {
        setLoadingProfile(false);
      }
    },
    [showToast]
  );

  useEffect(() => {
    if (selectedClientId) {
      fetchClientProfile(selectedClientId);
    } else {
      setProfileData(null);
    }
  }, [selectedClientId, fetchClientProfile]);

  const openAddModal = () => {
    setEditingClient(null);
    setForm({
      client_name: '',
      company_name: '',
      phone: '',
      whatsapp: '',
      email: '',
      cnic: '',
      client_photo: '',
      cnic_front: '',
      cnic_back: '',
      address: '',
      city: 'Lahore',
      contact_person: '',
      business_type: '',
      notes: '',
      status: 'Active',
      workspace_id: '',
    });
    setShowModal(true);
  };

  const openEditModal = (c: any) => {
    setEditingClient(c);
    setForm({
      client_name: c.client_name || '',
      company_name: c.company_name || '',
      phone: c.phone || '',
      whatsapp: c.whatsapp || '',
      email: c.email || '',
      cnic: c.cnic || '',
      client_photo: c.client_photo || '',
      cnic_front: c.cnic_front || '',
      cnic_back: c.cnic_back || '',
      address: c.address || '',
      city: c.city || 'Lahore',
      contact_person: c.contact_person || '',
      business_type: c.business_type || '',
      notes: c.notes || '',
      status: c.status || 'Active',
      workspace_id: c.workspace_id ? String(c.workspace_id) : '',
    });
    setShowModal(true);
  };

  const handleFormImageSelect = (field: 'client_photo' | 'cnic_front' | 'cnic_back', e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setForm((prev) => ({ ...prev, [field]: String(reader.result || '') }));
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleDirectProfileImageUpdate = async (
    field: 'client_photo' | 'cnic_front' | 'cnic_back',
    value: string,
    label: string
  ) => {
    if (!profileData?.client) return;
    const cl = profileData.client;
    try {
      await apiRequest(`/clients/${cl.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          ...cl,
          [field]: value,
        }),
      });
      showToast(`${label} updated successfully.`, 'success');
      fetchClientProfile(cl.id);
      fetchClients();
    } catch (err: any) {
      showToast(err.message || `Failed to update ${label}`, 'error');
    }
  };

  const handlePrintClientProfile = async (clientOrId?: any) => {
    try {
      if (profileData && (!clientOrId || clientOrId.id === profileData.client?.id)) {
        openPrintPreview({
          type: 'client-profile',
          title: `Client Profile — ${profileData.client.client_name} (${profileData.client.client_code})`,
          data: profileData,
        });
        return;
      }
      const targetId = typeof clientOrId === 'number' ? clientOrId : clientOrId?.id;
      if (!targetId) return;
      const fullProfile = await apiRequest(`/clients/${targetId}`);
      openPrintPreview({
        type: 'client-profile',
        title: `Client Profile — ${fullProfile.client.client_name} (${fullProfile.client.client_code})`,
        data: fullProfile,
      });
    } catch (err: any) {
      showToast(err.message || 'Failed to load client profile for printing', 'error');
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editingClient) {
        await apiRequest(`/clients/${editingClient.id}`, {
          method: 'PUT',
          body: JSON.stringify(form),
        });
      } else {
        await apiRequest('/clients', {
          method: 'POST',
          body: JSON.stringify(form),
        });
      }
      showToast('Saved successfully.', 'success');
      setShowModal(false);
      fetchClients();
      if (selectedClientId) fetchClientProfile(selectedClientId);
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (c: any) => {
    confirmAction({
      title: 'Move Client to Trash',
      message: `Are you sure you want to move "${c.client_name}" (${c.client_code}) to Trash? Their contracts, invoices, and payment history will remain safely preserved and can be restored anytime.`,
      confirmLabel: 'Move to Trash',
      danger: true,
      requireReason: true,
      onConfirm: async (reason) => {
        await apiRequest(`/clients/${c.id}`, {
          method: 'DELETE',
          body: JSON.stringify({ reason }),
        });
        showToast('Client moved to Trash.', 'info');
        if (selectedClientId === c.id) setSelectedClientId(null);
        fetchClients();
      },
    });
  };

  const handleAttachmentUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedClientId) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        await apiRequest('/attachments', {
          method: 'POST',
          body: JSON.stringify({
            entity_type: 'Client',
            entity_id: selectedClientId,
            file_name: file.name,
            mime_type: file.type,
            file_size: file.size,
            file_data: reader.result,
          }),
        });
        showToast('Saved successfully.', 'success');
        fetchClientProfile(selectedClientId);
      } catch (err: any) {
        showToast(err.message, 'error');
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  // Filtered and sorted list
  const filtered = clients
    .filter((c) => {
      if (statusFilter !== 'All' && c.status !== statusFilter) return false;
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return (
        c.client_name?.toLowerCase().includes(q) ||
        c.company_name?.toLowerCase().includes(q) ||
        c.phone?.toLowerCase().includes(q) ||
        c.client_code?.toLowerCase().includes(q) ||
        c.email?.toLowerCase().includes(q)
      );
    })
    .sort((a, b) => {
      if (sortBy === 'name') return (a.client_name || '').localeCompare(b.client_name || '');
      if (sortBy === 'balance') return Number(b.total_outstanding || 0) - Number(a.total_outstanding || 0);
      return b.id - a.id;
    });

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paginated = filtered.slice((page - 1) * pageSize, page * pageSize);

  const handleExportExcel = () => {
    exportToExcel(
      'Clients_Directory.xls',
      'Clients Directory & Balance Statement',
      `Status Filter: ${statusFilter} | Total Clients: ${filtered.length}`,
      ['Client ID', 'Client Name', 'Company Name', 'Phone', 'Email', 'Workspace', 'Status', 'Total Billed', 'Total Paid', 'Outstanding'],
      filtered.map((c) => [
        c.client_code,
        c.client_name,
        c.company_name || '—',
        c.phone,
        c.email || '—',
        c.workspace_number ? `${c.workspace_number} (${c.workspace_name})` : 'Unassigned',
        c.status,
        formatCurrency(c.total_billed, symbol),
        formatCurrency(c.total_paid, symbol),
        formatCurrency(c.total_outstanding, symbol),
      ]),
      company?.company_name
    );
  };

  const handleExportPdf = () => {
    openPrintPreview({
      type: 'generic-table',
      title: 'Clients Directory & Financial Ledger',
      data: {
        subtitle: `Total Clients: ${filtered.length}`,
        headers: ['Client ID', 'Name', 'Company', 'Phone', 'Workspace', 'Status', 'Billed', 'Paid', 'Balance'],
        rows: filtered.map((c) => [
          c.client_code,
          c.client_name,
          c.company_name || '—',
          c.phone,
          c.workspace_number || '—',
          c.status,
          formatCurrency(c.total_billed, symbol),
          formatCurrency(c.total_paid, symbol),
          formatCurrency(c.total_outstanding, symbol),
        ]),
      },
    });
  };

  // ---------------------------------------------------------------------------
  // CLIENT 360 PROFILE VIEW
  // ---------------------------------------------------------------------------
  return (
    <div className="space-y-5">
      {selectedClientId && profileData ? (
        (() => {
          const cl = profileData.client;
          const bal = profileData.balance || {};
          return (
            <div className="space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-4 bg-white border border-slate-200 rounded-xl p-4">
                <div className="flex flex-wrap items-center gap-3.5">
                  <button
                    onClick={() => setSelectedClientId(null)}
                    className="px-3 py-1.5 text-xs font-medium bg-slate-100 border border-slate-200 hover:bg-slate-200 rounded-lg flex items-center gap-1.5 cursor-pointer"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>Back</span>
                  </button>

                  <div className="relative group">
                    {cl.client_photo ? (
                      <img
                        src={cl.client_photo}
                        alt={cl.client_name}
                        onClick={() => setPreviewImage({ title: `${cl.client_name} — Client Photo`, src: cl.client_photo })}
                        className="w-14 h-14 rounded-xl object-cover border-2 border-teal-500 cursor-pointer shadow-xs"
                      />
                    ) : (
                      <div className="w-14 h-14 rounded-xl bg-slate-900 text-white flex items-center justify-center font-bold text-base">
                        {(cl.client_name || 'CL').slice(0, 2).toUpperCase()}
                      </div>
                    )}
                    {hasPermission('clients.edit') && (
                      <label
                        title="Upload / Change Client Photo"
                        className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-teal-600 text-white flex items-center justify-center shadow cursor-pointer hover:bg-teal-700"
                      >
                        <Camera className="w-3 h-3" />
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (!f) return;
                            const r = new FileReader();
                            r.onload = () => handleDirectProfileImageUpdate('client_photo', String(r.result || ''), 'Client Photo');
                            r.readAsDataURL(f);
                            e.target.value = '';
                          }}
                        />
                      </label>
                    )}
                  </div>

                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-lg font-bold text-slate-900">{cl.client_name}</h2>
                      <span className="text-xs font-mono text-slate-500">· {cl.client_code}</span>
                      <span className="px-2 py-0.5 text-[11px] font-semibold bg-emerald-50 text-emerald-700 rounded-md border border-emerald-200">
                        {cl.status}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500">{cl.company_name || 'Individual Member'} · {cl.business_type || 'General Business'}</p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => handlePrintClientProfile()}
                    className="px-3.5 py-2 text-xs font-semibold bg-teal-600 text-white hover:bg-teal-700 rounded-lg flex items-center gap-1.5 cursor-pointer shadow-xs"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    <span>Print Complete Profile</span>
                  </button>
                  {hasPermission('clients.edit') && (
                    <button
                      onClick={() => openEditModal(cl)}
                      className="px-3.5 py-2 text-xs font-medium bg-slate-900 text-white hover:bg-slate-800 rounded-lg flex items-center gap-1.5 cursor-pointer"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                      <span>Edit Client</span>
                    </button>
                  )}
                  {hasPermission('clients.delete') && (
                    <button
                      onClick={() => handleDelete(cl)}
                      className="px-3.5 py-2 text-xs font-medium bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 rounded-lg flex items-center gap-1.5 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Delete Client</span>
                    </button>
                  )}
                </div>
              </div>

        {/* Client Financial Balance Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white border border-slate-200 rounded-lg p-4">
            <div className="text-xs text-slate-500">Assigned Workspace</div>
            <div className="text-base font-bold text-slate-900 mt-1">
              {cl.workspace_number ? `${cl.workspace_number} — ${cl.workspace_name}` : 'Unassigned'}
            </div>
            <div className="text-xs text-slate-500 mt-0.5">
              {cl.workspace_type ? `${cl.workspace_type} · ${cl.workspace_floor}` : 'No active room assigned'}
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-lg p-4">
            <div className="text-xs text-slate-500">Total Billed</div>
            <div className="text-xl font-bold font-mono tabular-nums text-slate-900 mt-1">
              {formatCurrency(bal.total_billed, symbol)}
            </div>
            <div className="text-xs text-slate-500 mt-0.5">{profileData.invoices?.length || 0} invoices issued</div>
          </div>

          <div className="bg-white border border-slate-200 rounded-lg p-4">
            <div className="text-xs text-slate-500">Total Paid</div>
            <div className="text-xl font-bold font-mono tabular-nums text-emerald-700 mt-1">
              {formatCurrency(bal.total_paid, symbol)}
            </div>
            <div className="text-xs text-slate-500 mt-0.5">{profileData.payments?.length || 0} payments received</div>
          </div>

          <div className="bg-white border border-slate-200 rounded-lg p-4">
            <div className="text-xs text-slate-500">Total Outstanding Balance</div>
            <div
              className={`text-xl font-bold font-mono tabular-nums mt-1 ${
                Number(bal.total_outstanding) > 0 ? 'text-red-600' : 'text-slate-900'
              }`}
            >
              {formatCurrency(bal.total_outstanding, symbol)}
            </div>
            <div className="text-xs text-slate-500 mt-0.5">Remaining receivable</div>
          </div>
        </div>

        {/* Client Details + Documents */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-7 bg-white border border-slate-200 rounded-lg p-5">
            <h3 className="text-sm font-semibold text-slate-900 mb-4">Complete Client Information</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-xs">
              <div>
                <div className="text-slate-500">Phone Number</div>
                <div className="font-mono font-medium text-slate-900 mt-0.5">{cl.phone}</div>
              </div>
              <div>
                <div className="text-slate-500">WhatsApp Number</div>
                <div className="font-mono font-medium text-slate-900 mt-0.5">{cl.whatsapp || '—'}</div>
              </div>
              <div>
                <div className="text-slate-500">Email Address</div>
                <div className="font-medium text-slate-900 mt-0.5">{cl.email || '—'}</div>
              </div>
              <div>
                <div className="text-slate-500">CNIC / National ID</div>
                <div className="font-mono font-medium text-slate-900 mt-0.5">{cl.cnic || '—'}</div>
              </div>
              <div>
                <div className="text-slate-500">Contact Person</div>
                <div className="font-medium text-slate-900 mt-0.5">{cl.contact_person || '—'}</div>
              </div>
              <div>
                <div className="text-slate-500">City</div>
                <div className="font-medium text-slate-900 mt-0.5">{cl.city || '—'}</div>
              </div>
              <div className="col-span-2 sm:col-span-3">
                <div className="text-slate-500">Address</div>
                <div className="font-medium text-slate-900 mt-0.5">{cl.address || '—'}</div>
              </div>
              {cl.notes && (
                <div className="col-span-2 sm:col-span-3">
                  <div className="text-slate-500">Notes</div>
                  <div className="text-slate-700 mt-0.5">{cl.notes}</div>
                </div>
              )}
              <div className="col-span-2 sm:col-span-3 pt-3 border-t border-slate-100 text-[11px] text-slate-400 flex flex-wrap gap-4">
                <span>Created by {cl.created_by} on {formatDateTime(cl.created_at)}</span>
                <span>· Updated by {cl.updated_by} on {formatDateTime(cl.updated_at)}</span>
              </div>
            </div>
          </div>

          <div className="lg:col-span-5 bg-white border border-slate-200 rounded-lg p-5 flex flex-col justify-between space-y-5">
            {/* Client Photo & CNIC Front / Back Section */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-1.5">
                  <CreditCard className="w-4 h-4 text-teal-600" />
                  <span>Client Photo & CNIC (Front / Back)</span>
                </h3>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                {/* Client Photo Card */}
                <div className="border border-slate-200 rounded-lg p-2.5 flex flex-col justify-between bg-slate-50/50">
                  <div className="font-semibold text-slate-700 mb-1.5 flex items-center justify-between">
                    <span>Client Pic</span>
                    {cl.client_photo && hasPermission('clients.edit') && (
                      <button
                        type="button"
                        onClick={() => handleDirectProfileImageUpdate('client_photo', '', 'Client Photo')}
                        className="text-[10px] text-red-600 hover:underline cursor-pointer"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                  {cl.client_photo ? (
                    <img
                      src={cl.client_photo}
                      alt="Client Photo"
                      onClick={() => setPreviewImage({ title: `${cl.client_name} — Client Picture`, src: cl.client_photo })}
                      className="h-24 w-full object-cover rounded border border-slate-200 bg-white cursor-pointer"
                    />
                  ) : (
                    <div className="h-24 rounded border border-dashed border-slate-300 flex flex-col items-center justify-center text-slate-400 bg-white">
                      <User className="w-5 h-5 mb-1" />
                      <span className="text-[10px]">No Photo</span>
                    </div>
                  )}
                  {hasPermission('clients.edit') && (
                    <label className="mt-2 w-full py-1.5 px-2 bg-slate-900 hover:bg-slate-800 text-white rounded text-[11px] font-medium text-center cursor-pointer block">
                      {cl.client_photo ? 'Change Pic' : '+ Upload Pic'}
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (!f) return;
                          const r = new FileReader();
                          r.onload = () => handleDirectProfileImageUpdate('client_photo', String(r.result || ''), 'Client Photo');
                          r.readAsDataURL(f);
                          e.target.value = '';
                        }}
                      />
                    </label>
                  )}
                </div>

                {/* CNIC Front Card */}
                <div className="border border-slate-200 rounded-lg p-2.5 flex flex-col justify-between bg-slate-50/50">
                  <div className="font-semibold text-slate-700 mb-1.5 flex items-center justify-between">
                    <span>CNIC Front</span>
                    {cl.cnic_front && hasPermission('clients.edit') && (
                      <button
                        type="button"
                        onClick={() => handleDirectProfileImageUpdate('cnic_front', '', 'CNIC Front')}
                        className="text-[10px] text-red-600 hover:underline cursor-pointer"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                  {cl.cnic_front ? (
                    <img
                      src={cl.cnic_front}
                      alt="CNIC Front"
                      onClick={() => setPreviewImage({ title: `${cl.client_name} — CNIC Front Side`, src: cl.cnic_front })}
                      className="h-24 w-full object-cover rounded border border-slate-200 bg-white cursor-pointer"
                    />
                  ) : (
                    <div className="h-24 rounded border border-dashed border-slate-300 flex flex-col items-center justify-center text-slate-400 bg-white">
                      <CreditCard className="w-5 h-5 mb-1" />
                      <span className="text-[10px]">No CNIC Front</span>
                    </div>
                  )}
                  {hasPermission('clients.edit') && (
                    <label className="mt-2 w-full py-1.5 px-2 bg-teal-600 hover:bg-teal-700 text-white rounded text-[11px] font-medium text-center cursor-pointer block">
                      {cl.cnic_front ? 'Change Front' : '+ CNIC Front'}
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (!f) return;
                          const r = new FileReader();
                          r.onload = () => handleDirectProfileImageUpdate('cnic_front', String(r.result || ''), 'CNIC Front');
                          r.readAsDataURL(f);
                          e.target.value = '';
                        }}
                      />
                    </label>
                  )}
                </div>

                {/* CNIC Back Card */}
                <div className="border border-slate-200 rounded-lg p-2.5 flex flex-col justify-between bg-slate-50/50">
                  <div className="font-semibold text-slate-700 mb-1.5 flex items-center justify-between">
                    <span>CNIC Back</span>
                    {cl.cnic_back && hasPermission('clients.edit') && (
                      <button
                        type="button"
                        onClick={() => handleDirectProfileImageUpdate('cnic_back', '', 'CNIC Back')}
                        className="text-[10px] text-red-600 hover:underline cursor-pointer"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                  {cl.cnic_back ? (
                    <img
                      src={cl.cnic_back}
                      alt="CNIC Back"
                      onClick={() => setPreviewImage({ title: `${cl.client_name} — CNIC Back Side`, src: cl.cnic_back })}
                      className="h-24 w-full object-cover rounded border border-slate-200 bg-white cursor-pointer"
                    />
                  ) : (
                    <div className="h-24 rounded border border-dashed border-slate-300 flex flex-col items-center justify-center text-slate-400 bg-white">
                      <CreditCard className="w-5 h-5 mb-1" />
                      <span className="text-[10px]">No CNIC Back</span>
                    </div>
                  )}
                  {hasPermission('clients.edit') && (
                    <label className="mt-2 w-full py-1.5 px-2 bg-teal-600 hover:bg-teal-700 text-white rounded text-[11px] font-medium text-center cursor-pointer block">
                      {cl.cnic_back ? 'Change Back' : '+ CNIC Back'}
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (!f) return;
                          const r = new FileReader();
                          r.onload = () => handleDirectProfileImageUpdate('cnic_back', String(r.result || ''), 'CNIC Back');
                          r.readAsDataURL(f);
                          e.target.value = '';
                        }}
                      />
                    </label>
                  )}
                </div>
              </div>
            </div>

            {/* Additional Attached Files */}
            <div className="border-t border-slate-200 pt-4">
              <div className="flex items-center justify-between mb-2.5">
                <h4 className="text-xs font-semibold text-slate-700">Other Supporting Documents</h4>
                <label className="cursor-pointer px-2.5 py-1 text-xs font-medium bg-slate-100 text-slate-800 hover:bg-slate-200 rounded-lg flex items-center gap-1.5">
                  <Upload className="w-3 h-3" />
                  <span>Attach File</span>
                  <input type="file" onChange={handleAttachmentUpload} className="hidden" />
                </label>
              </div>
              {profileData.attachments?.length === 0 ? (
                <p className="text-xs text-slate-400 py-2 text-center">No extra documents attached.</p>
              ) : (
                <div className="space-y-1.5 max-h-32 overflow-y-auto">
                  {profileData.attachments.map((att: any) => (
                    <div
                      key={att.id}
                      className="flex items-center justify-between p-2 border border-slate-200 rounded-lg text-xs"
                    >
                      <div className="flex items-center gap-2 truncate">
                        <FileText className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                        <span className="font-medium text-slate-800 truncate">{att.file_name}</span>
                      </div>
                      <button
                        onClick={async () => {
                          const res = await apiRequest(`/attachments/file/${att.id}`);
                          const a = document.createElement('a');
                          a.href = res.attachment.file_data;
                          a.download = res.attachment.file_name;
                          a.click();
                        }}
                        className="text-teal-700 hover:underline font-medium shrink-0 ml-2 cursor-pointer"
                      >
                        Download
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Contracts, Invoices & Payments History */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Contracts */}
          <div className="bg-white border border-slate-200 rounded-lg">
            <div className="px-4 py-3.5 border-b border-slate-200">
              <h3 className="text-sm font-semibold text-slate-900">Current & Previous Contracts</h3>
            </div>
            <div className="overflow-x-auto">
              {profileData.contracts?.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-500">No contracts linked to this client.</div>
              ) : (
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 text-slate-500 border-b border-slate-200">
                    <tr>
                      <th className="py-2 px-3 text-left">Contract #</th>
                      <th className="py-2 px-3 text-left">Workspace & Equipment</th>
                      <th className="py-2 px-3 text-left">Period</th>
                      <th className="py-2 px-3 text-right">Monthly Rent</th>
                      <th className="py-2 px-3 text-left">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {profileData.contracts.map((ct: any) => (
                      <tr key={ct.id}>
                        <td className="py-2.5 px-3 font-mono font-semibold">{ct.contract_number}</td>
                        <td className="py-2.5 px-3">
                          <div>{ct.workspace_number} ({ct.workspace_name})</div>
                          <div className="text-[11px] text-teal-700">
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
                            <div className="text-[11px] text-slate-500 truncate max-w-[200px]" title={ct.custom_requirements}>
                              {ct.custom_requirements}
                            </div>
                          )}
                        </td>
                        <td className="py-2.5 px-3 font-mono">{formatDate(ct.start_date)} → {formatDate(ct.end_date)}</td>
                        <td className="py-2.5 px-3 text-right font-mono">{formatCurrency(ct.monthly_rent, symbol)}</td>
                        <td className="py-2.5 px-3 font-medium">{ct.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* Invoices */}
          <div className="bg-white border border-slate-200 rounded-lg">
            <div className="px-4 py-3.5 border-b border-slate-200">
              <h3 className="text-sm font-semibold text-slate-900">Client Invoices</h3>
            </div>
            <div className="overflow-x-auto">
              {profileData.invoices?.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-500">No invoices generated for this client.</div>
              ) : (
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 text-slate-500 border-b border-slate-200">
                    <tr>
                      <th className="py-2 px-3 text-left">Invoice #</th>
                      <th className="py-2 px-3 text-left">Period</th>
                      <th className="py-2 px-3 text-right">Total</th>
                      <th className="py-2 px-3 text-right">Balance</th>
                      <th className="py-2 px-3 text-left">Status</th>
                      <th className="py-2 px-3 text-right">A4</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {profileData.invoices.map((inv: any) => (
                      <tr key={inv.id}>
                        <td className="py-2.5 px-3 font-mono font-semibold">{inv.invoice_number}</td>
                        <td className="py-2.5 px-3">{inv.billing_period}</td>
                        <td className="py-2.5 px-3 text-right font-mono">{formatCurrency(inv.total, symbol)}</td>
                        <td className="py-2.5 px-3 text-right font-mono font-semibold">{formatCurrency(inv.remaining_amount, symbol)}</td>
                        <td className="py-2.5 px-3 font-medium">{inv.status}</td>
                        <td className="py-2.5 px-3 text-right">
                          <button
                            onClick={async () => {
                              const full = await apiRequest(`/invoices/${inv.id}`);
                              openPrintPreview({
                                type: 'invoice',
                                title: `Invoice ${inv.invoice_number}`,
                                data: full,
                              });
                            }}
                            className="text-slate-600 hover:text-slate-900"
                            title="Print Preview A4 Invoice"
                          >
                            <Printer className="w-3.5 h-3.5 inline" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>

        {/* Payments & Activity */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white border border-slate-200 rounded-lg">
            <div className="px-4 py-3.5 border-b border-slate-200">
              <h3 className="text-sm font-semibold text-slate-900">Payment History</h3>
            </div>
            <div className="overflow-x-auto">
              {profileData.payments?.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-500">No payments recorded.</div>
              ) : (
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 text-slate-500 border-b border-slate-200">
                    <tr>
                      <th className="py-2 px-3 text-left">Receipt #</th>
                      <th className="py-2 px-3 text-left">Invoice</th>
                      <th className="py-2 px-3 text-left">Method / Proof</th>
                      <th className="py-2 px-3 text-right">Amount</th>
                      <th className="py-2 px-3 text-right">Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {profileData.payments.map((p: any) => (
                      <tr key={p.id}>
                        <td className="py-2.5 px-3 font-mono font-semibold">{p.receipt_number}</td>
                        <td className="py-2.5 px-3 font-mono">{p.invoice_number}</td>
                        <td className="py-2.5 px-3">
                          <div>{p.payment_method}</div>
                          {p.transaction_screenshot && (
                            <button
                              type="button"
                              onClick={() =>
                                setPreviewImage({
                                  title: `Transaction Proof — ${p.receipt_number}`,
                                  src: p.transaction_screenshot,
                                })
                              }
                              className="text-[11px] text-teal-600 hover:underline font-medium cursor-pointer"
                            >
                              View Screenshot
                            </button>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-semibold text-emerald-700">{formatCurrency(p.amount, symbol)}</td>
                        <td className="py-2.5 px-3 text-right font-mono">{formatDate(p.payment_date)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-lg">
            <div className="px-4 py-3.5 border-b border-slate-200">
              <h3 className="text-sm font-semibold text-slate-900">Client Activity Trail</h3>
            </div>
            <div className="p-4 space-y-2.5 max-h-64 overflow-y-auto text-xs">
              {profileData.activities?.length === 0 ? (
                <div className="text-center text-slate-500 py-4">No activity logs found.</div>
              ) : (
                profileData.activities.map((act: any) => (
                  <div key={act.id} className="flex items-start justify-between gap-3 border-b border-slate-100 pb-2">
                    <div>
                      <span className="font-semibold text-slate-900">{act.action}</span>
                      <span className="text-slate-500"> · {act.details}</span>
                    </div>
                    <span className="font-mono text-[11px] text-slate-400 shrink-0">{formatDateTime(act.created_at)}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
            </div>
          );
        })()
      ) : (
        <>
          {/* Top Toolbar */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-white border border-slate-200 rounded-lg p-4">
        <div className="flex flex-wrap items-center gap-3 flex-1">
          <div className="relative flex-1 min-w-[220px] max-w-sm">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Search name, company, phone, ID..."
              className="w-full pl-9 pr-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
            />
          </div>

          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
            {['All', ...STATUS_OPTIONS].map((st) => (
              <button
                key={st}
                onClick={() => {
                  setStatusFilter(st);
                  setPage(1);
                }}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  statusFilter === st ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {st}
              </button>
            ))}
          </div>

          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white text-slate-700"
          >
            <option value="newest">Sort: Newest First</option>
            <option value="name">Sort: Client Name (A-Z)</option>
            <option value="balance">Sort: Highest Balance</option>
          </select>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={handleExportExcel}
            className="px-3 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg flex items-center gap-1.5 whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Excel</span>
          </button>
          <button
            onClick={handleExportPdf}
            className="px-3 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg flex items-center gap-1.5 whitespace-nowrap"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>PDF / Print</span>
          </button>
          {hasPermission('clients.create') && (
            <button
              onClick={openAddModal}
              className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg flex items-center gap-1.5 whitespace-nowrap"
            >
              <Plus className="w-4 h-4" />
              <span>+ Add Client</span>
            </button>
          )}
        </div>
      </div>

      {/* Clients Table */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-xs text-slate-500">Loading clients...</div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <div className="text-sm font-semibold text-slate-900">No clients added yet.</div>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              Register your coworking members and corporate tenants to assign workspaces, contracts, and monthly invoices.
            </p>
            {hasPermission('clients.create') && (
              <button
                onClick={openAddModal}
                className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg inline-flex items-center gap-1.5"
              >
                <Plus className="w-4 h-4" />
                <span>+ Add Client</span>
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                  <tr>
                    <th className="py-3 px-4 text-left font-semibold">Client ID</th>
                    <th className="py-3 px-4 text-left font-semibold">Client / Company</th>
                    <th className="py-3 px-4 text-left font-semibold">Phone / WhatsApp</th>
                    <th className="py-3 px-4 text-left font-semibold">Assigned Workspace</th>
                    <th className="py-3 px-4 text-left font-semibold">Status</th>
                    <th className="py-3 px-4 text-right font-semibold">Total Billed</th>
                    <th className="py-3 px-4 text-right font-semibold">Total Paid</th>
                    <th className="py-3 px-4 text-right font-semibold">Outstanding</th>
                    <th className="py-3 px-4 text-right font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {paginated.map((c) => (
                    <tr key={c.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-4 font-mono font-semibold text-slate-900">{c.client_code}</td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2.5">
                          {c.client_photo ? (
                            <img
                              src={c.client_photo}
                              alt={c.client_name}
                              className="w-8 h-8 rounded-full object-cover border border-slate-200 shrink-0"
                            />
                          ) : (
                            <div className="w-8 h-8 rounded-full bg-slate-200 text-slate-700 font-bold text-[11px] flex items-center justify-center shrink-0">
                              {(c.client_name || 'CL').slice(0, 2).toUpperCase()}
                            </div>
                          )}
                          <div>
                            <button
                              onClick={() => setSelectedClientId(c.id)}
                              className="font-semibold text-slate-900 hover:underline text-left block cursor-pointer"
                            >
                              {c.client_name}
                            </button>
                            <div className="text-slate-500">{c.company_name || c.business_type || 'Individual'}</div>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-700">
                        <div>{c.phone}</div>
                        {c.email && <div className="font-sans text-slate-400 text-[11px]">{c.email}</div>}
                      </td>
                      <td className="py-3 px-4 text-slate-700">
                        {c.workspace_number ? (
                          <div>
                            <span className="font-mono font-semibold">{c.workspace_number}</span> · {c.workspace_name}
                          </div>
                        ) : (
                          <span className="text-slate-400">Unassigned</span>
                        )}
                      </td>
                      <td className="py-3 px-4 font-medium">
                        <span
                          className={
                            c.status === 'Active'
                              ? 'text-emerald-700'
                              : c.status === 'Pending'
                              ? 'text-amber-700'
                              : 'text-slate-500'
                          }
                        >
                          {c.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-700">
                        {formatCurrency(c.total_billed, symbol)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-emerald-700 font-medium">
                        {formatCurrency(c.total_paid, symbol)}
                      </td>
                      <td
                        className={`py-3 px-4 text-right font-mono tabular-nums font-semibold ${
                          Number(c.total_outstanding) > 0 ? 'text-red-600' : 'text-slate-900'
                        }`}
                      >
                        {formatCurrency(c.total_outstanding, symbol)}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => setSelectedClientId(c.id)}
                            className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded cursor-pointer"
                            title="View Full Client Profile"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handlePrintClientProfile(c)}
                            className="p-1.5 text-teal-600 hover:text-teal-800 hover:bg-teal-50 rounded cursor-pointer"
                            title="Print Complete Client Profile"
                          >
                            <Printer className="w-4 h-4" />
                          </button>
                          {hasPermission('clients.edit') && (
                            <button
                              onClick={() => openEditModal(c)}
                              className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded"
                              title="Edit Client"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                          )}
                          {hasPermission('clients.delete') && (
                            <button
                              onClick={() => handleDelete(c)}
                              className="p-1.5 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded"
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

            {/* Pagination Footer */}
            <div className="px-4 py-3 border-t border-slate-200 flex items-center justify-between text-xs text-slate-600">
              <span>
                Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, filtered.length)} of {filtered.length} clients
              </span>
              <div className="flex items-center gap-2">
                <button
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                  className="px-3 py-1 border border-slate-300 rounded disabled:opacity-40 hover:bg-slate-50"
                >
                  Previous
                </button>
                <span className="font-mono">
                  Page {page} / {totalPages}
                </span>
                <button
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                  className="px-3 py-1 border border-slate-300 rounded disabled:opacity-40 hover:bg-slate-50"
                >
                  Next
                </button>
              </div>
            </div>
          </>
        )}
      </div>
        </>
      )}

      {/* Add / Edit Client Modal */}
      {showModal && (
        <div className="fixed inset-0 z-40 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl max-w-2xl w-full max-h-[90vh] flex flex-col shadow-2xl">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900">
                {editingClient ? `Edit Client — ${editingClient.client_code}` : 'Register New Client'}
              </h3>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="p-6 overflow-y-auto space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Client Name *</label>
                  <input
                    type="text"
                    required
                    value={form.client_name}
                    onChange={(e) => setForm({ ...form, client_name: e.target.value })}
                    placeholder="e.g. Kamran Siddiqui"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                    autoFocus
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Company Name</label>
                  <input
                    type="text"
                    value={form.company_name}
                    onChange={(e) => setForm({ ...form, company_name: e.target.value })}
                    placeholder="e.g. NexaCloud Technologies Pvt. Ltd."
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Phone Number *</label>
                  <input
                    type="text"
                    required
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    placeholder="+92 300 1234567"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">WhatsApp Number</label>
                  <input
                    type="text"
                    value={form.whatsapp}
                    onChange={(e) => setForm({ ...form, whatsapp: e.target.value })}
                    placeholder="+92 300 1234567"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Email Address</label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    placeholder="client@company.pk"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">CNIC / National ID (Optional)</label>
                  <input
                    type="text"
                    value={form.cnic}
                    onChange={(e) => setForm({ ...form, cnic: e.target.value })}
                    placeholder="35202-1234567-1"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Contact Person</label>
                  <input
                    type="text"
                    value={form.contact_person}
                    onChange={(e) => setForm({ ...form, contact_person: e.target.value })}
                    placeholder="Primary representative"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Business Type / Industry</label>
                  <input
                    type="text"
                    value={form.business_type}
                    onChange={(e) => setForm({ ...form, business_type: e.target.value })}
                    placeholder="Software, Fintech, Consulting..."
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Assigned Workspace</label>
                  <select
                    value={form.workspace_id}
                    onChange={(e) => setForm({ ...form, workspace_id: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                  >
                    <option value="">— Unassigned —</option>
                    {workspaces.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.workspace_number} — {w.name} ({w.type}, {formatCurrency(w.monthly_price, symbol)}/mo) [{w.status}]
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Client Status</label>
                  <select
                    value={form.status}
                    onChange={(e) => setForm({ ...form, status: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                  >
                    {STATUS_OPTIONS.map((st) => (
                      <option key={st} value={st}>
                        {st}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">City</label>
                  <input
                    type="text"
                    value={form.city}
                    onChange={(e) => setForm({ ...form, city: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Address</label>
                  <input
                    type="text"
                    value={form.address}
                    onChange={(e) => setForm({ ...form, address: e.target.value })}
                    placeholder="Street, Sector/Block"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block font-semibold text-slate-700 mb-1">Notes</label>
                  <textarea
                    rows={2}
                    value={form.notes}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                    placeholder="Special billing terms, access card numbers, or remarks..."
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>

                {/* Client Photo & CNIC Front / Back Upload inside Modal */}
                <div className="sm:col-span-2 border-t border-slate-200 pt-4">
                  <label className="block font-semibold text-slate-800 mb-2">
                    Client Picture & CNIC (Front / Back) Photos
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="border border-slate-200 rounded-lg p-3 bg-slate-50/50 text-center">
                      <div className="text-[11px] font-semibold text-slate-700 mb-1.5">Client Picture</div>
                      {form.client_photo ? (
                        <div className="space-y-1.5">
                          <img src={form.client_photo} alt="Client Preview" className="h-20 w-20 object-cover rounded-full mx-auto border border-slate-300" />
                          <button
                            type="button"
                            onClick={() => setForm({ ...form, client_photo: '' })}
                            className="text-[11px] text-red-600 hover:underline block mx-auto"
                          >
                            Remove Photo
                          </button>
                        </div>
                      ) : (
                        <div className="h-20 flex items-center justify-center text-slate-400 text-[11px]">No photo selected</div>
                      )}
                      <label className="mt-2 inline-block px-3 py-1.5 bg-slate-900 text-white rounded-md text-[11px] font-medium cursor-pointer hover:bg-slate-800">
                        Choose Client Pic
                        <input type="file" accept="image/*" onChange={(e) => handleFormImageSelect('client_photo', e)} className="hidden" />
                      </label>
                    </div>

                    <div className="border border-slate-200 rounded-lg p-3 bg-slate-50/50 text-center">
                      <div className="text-[11px] font-semibold text-slate-700 mb-1.5">CNIC Front Side</div>
                      {form.cnic_front ? (
                        <div className="space-y-1.5">
                          <img src={form.cnic_front} alt="CNIC Front Preview" className="h-20 w-full object-contain rounded mx-auto border border-slate-300 bg-white" />
                          <button
                            type="button"
                            onClick={() => setForm({ ...form, cnic_front: '' })}
                            className="text-[11px] text-red-600 hover:underline block mx-auto"
                          >
                            Remove Front
                          </button>
                        </div>
                      ) : (
                        <div className="h-20 flex items-center justify-center text-slate-400 text-[11px]">No front image</div>
                      )}
                      <label className="mt-2 inline-block px-3 py-1.5 bg-teal-600 text-white rounded-md text-[11px] font-medium cursor-pointer hover:bg-teal-700">
                        Choose CNIC Front
                        <input type="file" accept="image/*" onChange={(e) => handleFormImageSelect('cnic_front', e)} className="hidden" />
                      </label>
                    </div>

                    <div className="border border-slate-200 rounded-lg p-3 bg-slate-50/50 text-center">
                      <div className="text-[11px] font-semibold text-slate-700 mb-1.5">CNIC Back Side</div>
                      {form.cnic_back ? (
                        <div className="space-y-1.5">
                          <img src={form.cnic_back} alt="CNIC Back Preview" className="h-20 w-full object-contain rounded mx-auto border border-slate-300 bg-white" />
                          <button
                            type="button"
                            onClick={() => setForm({ ...form, cnic_back: '' })}
                            className="text-[11px] text-red-600 hover:underline block mx-auto"
                          >
                            Remove Back
                          </button>
                        </div>
                      ) : (
                        <div className="h-20 flex items-center justify-center text-slate-400 text-[11px]">No back image</div>
                      )}
                      <label className="mt-2 inline-block px-3 py-1.5 bg-teal-600 text-white rounded-md text-[11px] font-medium cursor-pointer hover:bg-teal-700">
                        Choose CNIC Back
                        <input type="file" accept="image/*" onChange={(e) => handleFormImageSelect('cnic_back', e)} className="hidden" />
                      </label>
                    </div>
                  </div>
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
                  {saving ? 'Saving...' : 'Save Client'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Lightbox Image Preview Modal */}
      {previewImage && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setPreviewImage(null)}
        >
          <div
            className="bg-white rounded-xl max-w-3xl w-full overflow-hidden shadow-2xl border border-slate-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900">{previewImage.title}</h3>
              <button onClick={() => setPreviewImage(null)} className="text-slate-400 hover:text-slate-700 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 bg-slate-900 flex justify-center">
              <img src={previewImage.src} alt={previewImage.title} className="max-h-[75vh] object-contain rounded" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
