import React, { useState, useEffect, useCallback } from 'react';
import { useApp } from '../context/AppContext';
import { apiRequest } from '../services/api';
import { formatCurrency, formatDate, exportToExcel } from '../utils/format';
import { Plus, Search, Printer, Download, Edit2, Trash2, FileText, DollarSign, CheckCircle2, Clock, AlertCircle, X, Upload, Image as ImageIcon } from 'lucide-react';

interface InvoiceItemInput {
  description: string;
  category: string;
  quantity: number;
  unit_price: number;
  amount: number;
}

const ITEM_CATEGORIES = [
  'Monthly Office Rental',
  'Private Office Rent',
  'Dedicated Desk Rent',
  'Hot Desk Membership',
  'Meeting Room Booking',
  'Conference Room Booking',
  'Electricity / Utility Share',
  'Security Deposit',
  'Printing / Scanning Charges',
  'Refreshments / Tea Service',
  'Additional Services',
];

export default function InvoicesPage() {
  const { hasPermission, showToast, confirmAction, openPrintPreview, company, appSettings, refreshSettings } = useApp();
  const symbol = appSettings?.currency_symbol || 'Rs.';

  const [invoices, setInvoices] = useState<any[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [workspaces, setWorkspaces] = useState<any[]>([]);
  const [contracts, setContracts] = useState<any[]>([]);
  const [nextInvoicePreview, setNextInvoicePreview] = useState('INV-000001');
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');

  const [showModal, setShowModal] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState<any | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Quick Record Payment Modal directly from Invoice row
  const [paymentModalInvoice, setPaymentModalInvoice] = useState<any | null>(null);
  const [quickPaymentForm, setQuickPaymentForm] = useState({
    payment_date: new Date().toISOString().slice(0, 10),
    amount: 0,
    payment_method: 'Bank Transfer',
    reference_number: '',
    transaction_screenshot: '',
    notes: '',
  });

  const [formData, setFormData] = useState({
    invoice_date: new Date().toISOString().slice(0, 10),
    due_date: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
    expected_payment_date: '',
    client_id: '',
    workspace_id: '',
    contract_id: '',
    billing_period: new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
    custom_paragraph: '',
    discount: 0,
    additional_charges: 0,
    status: 'Unpaid',
    notes: '',
    terms: '',
    show_signature: 1,
    show_stamp: 1,
    signature_position: 'right',
    stamp_position: 'beside-signature',
    role1_title: 'Prepared By',
    role1_name: '',
    role2_title: 'Accountant',
    role2_name: '',
    role3_title: 'Authorized Signatory',
    role3_name: '',
    items: [
      {
        description: 'Monthly Coworking Office Rental',
        category: 'Monthly Office Rental',
        quantity: 1,
        unit_price: 0,
        amount: 0,
      },
    ] as InvoiceItemInput[],
  });

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [invRes, clRes, wsRes, ctRes] = await Promise.all([
        apiRequest<{ invoices: any[]; nextInvoicePreview: string }>('/invoices'),
        apiRequest<{ clients: any[] }>('/clients'),
        apiRequest<{ workspaces: any[] }>('/workspaces'),
        apiRequest<{ contracts: any[] }>('/contracts'),
      ]);
      setInvoices(invRes.invoices || []);
      if (invRes.nextInvoicePreview) setNextInvoicePreview(invRes.nextInvoicePreview);
      setClients(clRes.clients || []);
      setWorkspaces(wsRes.workspaces || []);
      setContracts(ctRes.contracts || []);
    } catch (err: any) {
      showToast(err.message || 'Failed to load invoices', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleOpenCreate = () => {
    const firstClient = clients.find(c => c.status === 'Active') || clients[0];
    const clientContract = firstClient
      ? contracts.find(ct => ct.client_id === firstClient.id && (ct.status === 'Active' || ct.status === 'Expiring Soon'))
      : null;
    const wsId = clientContract?.workspace_id || firstClient?.workspace_id || '';
    const wsObj = workspaces.find(w => w.id === Number(wsId));
    const defaultRent = clientContract ? Number(clientContract.monthly_rent) : wsObj ? Number(wsObj.monthly_price) : 0;

    const defaultDueDays = Number(company?.default_payment_due_days) || 7;
    const defaultDueDate = new Date(Date.now() + defaultDueDays * 86400000).toISOString().slice(0, 10);

    setEditingInvoice(null);
    setFormData({
      invoice_date: new Date().toISOString().slice(0, 10),
      due_date: defaultDueDate,
      expected_payment_date: defaultDueDate,
      client_id: firstClient ? String(firstClient.id) : '',
      workspace_id: wsId ? String(wsId) : '',
      contract_id: clientContract ? String(clientContract.id) : '',
      billing_period: new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
      custom_paragraph:
        company?.default_invoice_paragraph ||
        `Monthly coworking workspace rental charges for ${new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}. Includes high-speed fiber internet, backup power, daily housekeeping, and complimentary refreshments.`,
      discount: 0,
      additional_charges: clientContract ? Number(clientContract.additional_charges || 0) : 0,
      status: 'Unpaid',
      notes: company?.default_invoice_notes || 'Please share transfer receipt via WhatsApp or email once payment is completed.',
      terms: company?.default_invoice_terms || 'All rental invoices are payable on or before the due date.',
      show_signature: company?.show_signature !== undefined ? (company.show_signature ? 1 : 0) : 1,
      show_stamp: company?.show_stamp !== undefined ? (company.show_stamp ? 1 : 0) : 1,
      signature_position: company?.signature_position || 'right',
      stamp_position: company?.stamp_position || 'beside-signature',
      role1_title: company?.role1_title || 'Prepared By',
      role1_name: company?.role1_name || '',
      role2_title: company?.role2_title || 'Accountant',
      role2_name: company?.role2_name || '',
      role3_title: company?.role3_title || 'Authorized Signatory',
      role3_name: company?.role3_name || '',
      items: [
        {
          description: wsObj
            ? `Monthly Rental — ${wsObj.workspace_number} (${wsObj.name})`
            : 'Monthly Coworking Workspace Rental',
          category: 'Monthly Office Rental',
          quantity: 1,
          unit_price: defaultRent,
          amount: defaultRent,
        },
      ],
    });
    setShowModal(true);
  };

  const handleOpenEdit = (inv: any) => {
    setEditingInvoice(inv);
    setFormData({
      invoice_date: inv.invoice_date,
      due_date: inv.due_date,
      expected_payment_date: inv.expected_payment_date || '',
      client_id: String(inv.client_id),
      workspace_id: inv.workspace_id ? String(inv.workspace_id) : '',
      contract_id: inv.contract_id ? String(inv.contract_id) : '',
      billing_period: inv.billing_period || '',
      custom_paragraph: inv.custom_paragraph || '',
      discount: Number(inv.discount || 0),
      additional_charges: Number(inv.additional_charges || 0),
      status: inv.status,
      notes: inv.notes || '',
      terms: inv.terms || '',
      show_signature: inv.show_signature !== undefined ? (inv.show_signature ? 1 : 0) : 1,
      show_stamp: inv.show_stamp !== undefined ? (inv.show_stamp ? 1 : 0) : 1,
      signature_position: inv.signature_position || company?.signature_position || 'right',
      stamp_position: inv.stamp_position || company?.stamp_position || 'beside-signature',
      role1_title: inv.role1_title || company?.role1_title || 'Prepared By',
      role1_name: inv.role1_name || company?.role1_name || '',
      role2_title: inv.role2_title || company?.role2_title || 'Accountant',
      role2_name: inv.role2_name || company?.role2_name || '',
      role3_title: inv.role3_title || company?.role3_title || 'Authorized Signatory',
      role3_name: inv.role3_name || company?.role3_name || '',
      items:
        Array.isArray(inv.items) && inv.items.length > 0
          ? inv.items.map((it: any) => ({
              description: it.description,
              category: it.category || 'Monthly Office Rental',
              quantity: Number(it.quantity || 1),
              unit_price: Number(it.unit_price || 0),
              amount: Number(it.amount || 0),
            }))
          : [
              {
                description: 'Workspace Rental Charges',
                category: 'Monthly Office Rental',
                quantity: 1,
                unit_price: Number(inv.subtotal || 0),
                amount: Number(inv.subtotal || 0),
              },
            ],
    });
    setShowModal(true);
  };

  const handleClientSelect = (clientId: string) => {
    const cl = clients.find(c => String(c.id) === clientId);
    const activeCt = contracts.find(
      ct => String(ct.client_id) === clientId && (ct.status === 'Active' || ct.status === 'Expiring Soon')
    );
    const wsId = activeCt ? String(activeCt.workspace_id) : cl?.workspace_id ? String(cl.workspace_id) : '';
    const wsObj = workspaces.find(w => String(w.id) === wsId);
    const rent = activeCt ? Number(activeCt.monthly_rent) : wsObj ? Number(wsObj.monthly_price) : 0;

    setFormData(prev => ({
      ...prev,
      client_id: clientId,
      workspace_id: wsId,
      contract_id: activeCt ? String(activeCt.id) : '',
      additional_charges: activeCt ? Number(activeCt.additional_charges || 0) : prev.additional_charges,
      items:
        prev.items.length === 1 && !editingInvoice
          ? [
              {
                description: wsObj
                  ? `Monthly Rental — ${wsObj.workspace_number} (${wsObj.name})`
                  : 'Monthly Workspace Rental',
                category: 'Monthly Office Rental',
                quantity: 1,
                unit_price: rent,
                amount: rent,
              },
            ]
          : prev.items,
    }));
  };

  const handleWorkspaceSelect = (workspaceId: string) => {
    const wsObj = workspaces.find(w => String(w.id) === workspaceId);
    const rent = wsObj ? Number(wsObj.monthly_price || 0) : 0;

    setFormData(prev => ({
      ...prev,
      workspace_id: workspaceId,
      items:
        prev.items.length === 1 && (!editingInvoice || Number(prev.items[0].unit_price) === 0) && wsObj
          ? [
              {
                description: `Monthly Rental — ${wsObj.workspace_number} (${wsObj.name})`,
                category: 'Monthly Office Rental',
                quantity: Number(prev.items[0].quantity) || 1,
                unit_price: rent,
                amount: Math.round((Number(prev.items[0].quantity) || 1) * rent * 100) / 100,
              },
            ]
          : prev.items,
    }));
  };

  const updateItem = (idx: number, field: keyof InvoiceItemInput, value: string | number) => {
    setFormData(prev => {
      const next = [...prev.items];
      const current = { ...next[idx], [field]: value };
      const qty = Number(current.quantity) || 0;
      const price = Number(current.unit_price) || 0;
      current.amount = Math.round(qty * price * 100) / 100;
      next[idx] = current;
      return { ...prev, items: next };
    });
  };

  const addItem = () => {
    setFormData(prev => ({
      ...prev,
      items: [
        ...prev.items,
        { description: '', category: 'Additional Services', quantity: 1, unit_price: 0, amount: 0 },
      ],
    }));
  };

  const removeItem = (idx: number) => {
    if (formData.items.length <= 1) return;
    setFormData(prev => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== idx),
    }));
  };

  const subtotal = formData.items.reduce((sum, it) => sum + Number(it.amount || 0), 0);
  const grandTotal = Math.max(0, subtotal - Number(formData.discount || 0) + Number(formData.additional_charges || 0));

  const handleSaveInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.client_id || !formData.billing_period) {
      showToast('Please select a client and enter the billing period', 'error');
      return;
    }

    try {
      setSubmitting(true);
      const payload = {
        ...formData,
        client_id: Number(formData.client_id),
        workspace_id: formData.workspace_id ? Number(formData.workspace_id) : null,
        contract_id: formData.contract_id ? Number(formData.contract_id) : null,
      };

      if (editingInvoice) {
        await apiRequest(`/invoices/${editingInvoice.id}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
        showToast('Invoice updated successfully', 'success');
      } else {
        await apiRequest('/invoices', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        await refreshSettings();
        showToast('Invoice generated and saved to database', 'success');
      }
      setShowModal(false);
      loadData();
    } catch (err: any) {
      showToast(err.message || 'Failed to save invoice', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteInvoice = (inv: any) => {
    confirmAction({
      title: 'Move Invoice to Trash',
      message: `Are you sure you want to move invoice "${inv.invoice_number}" (${formatCurrency(inv.total, symbol)}) to Trash? You can restore it anytime from the Trash module.`,
      confirmLabel: 'Move to Trash',
      danger: true,
      onConfirm: async (reason) => {
        try {
          await apiRequest(`/invoices/${inv.id}`, {
            method: 'DELETE',
            body: JSON.stringify({ reason }),
          });
          showToast('Invoice moved to Trash', 'info');
          loadData();
        } catch (err: any) {
          showToast(err.message || 'Failed to delete invoice', 'error');
        }
      },
    });
  };

  const handlePrintInvoice = async (inv: any) => {
    try {
      const detail = await apiRequest<{ invoice: any; company: any }>(`/invoices/${inv.id}`);
      openPrintPreview({
        type: 'invoice',
        title: `Invoice ${detail.invoice.invoice_number}`,
        data: detail,
      });
    } catch (err: any) {
      showToast(err.message || 'Failed to open invoice print preview', 'error');
    }
  };

  const handleOpenQuickPayment = (inv: any) => {
    setPaymentModalInvoice(inv);
    setQuickPaymentForm({
      payment_date: new Date().toISOString().slice(0, 10),
      amount: Number(inv.remaining_amount || 0),
      payment_method: 'Bank Transfer',
      reference_number: '',
      transaction_screenshot: '',
      notes: `Payment against ${inv.invoice_number}`,
    });
  };

  const handleSaveQuickPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!paymentModalInvoice) return;
    try {
      await apiRequest('/payments', {
        method: 'POST',
        body: JSON.stringify({
          invoice_id: paymentModalInvoice.id,
          ...quickPaymentForm,
        }),
      });
      showToast('Payment recorded and invoice updated', 'success');
      setPaymentModalInvoice(null);
      loadData();
    } catch (err: any) {
      showToast(err.message || 'Failed to record payment', 'error');
    }
  };

  const filteredInvoices = invoices.filter(inv => {
    const matchesStatus = statusFilter === 'All' || inv.status === statusFilter;
    const q = search.toLowerCase();
    const matchesSearch =
      !q ||
      (inv.invoice_number || '').toLowerCase().includes(q) ||
      (inv.client_name_snapshot || '').toLowerCase().includes(q) ||
      (inv.client_company_snapshot || '').toLowerCase().includes(q) ||
      (inv.billing_period || '').toLowerCase().includes(q);
    return matchesStatus && matchesSearch;
  });

  const totalBilled = filteredInvoices
    .filter(i => i.status !== 'Cancelled')
    .reduce((s, i) => s + Number(i.total || 0), 0);
  const totalCollected = filteredInvoices
    .filter(i => i.status !== 'Cancelled')
    .reduce((s, i) => s + Number(i.paid_amount || 0), 0);
  const totalReceivable = filteredInvoices
    .filter(i => i.status !== 'Cancelled')
    .reduce((s, i) => s + Number(i.remaining_amount || 0), 0);

  const statusBadge = (status: string) => {
    switch (status) {
      case 'Paid':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'Partially Paid':
        return 'bg-blue-50 text-blue-700 border-blue-200';
      case 'Overdue':
        return 'bg-red-50 text-red-700 border-red-200';
      case 'Draft':
        return 'bg-slate-100 text-slate-600 border-slate-300';
      case 'Cancelled':
        return 'bg-slate-100 text-slate-400 border-slate-200 line-through';
      default:
        return 'bg-amber-50 text-amber-700 border-amber-200';
    }
  };

  return (
    <div className="space-y-5">
      {/* Summary Strip */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-slate-200/80 p-4 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-xs font-medium text-slate-500">Total Invoiced (Filtered)</span>
            <p className="text-xl font-bold text-slate-900 font-mono tabular-nums mt-1">{formatCurrency(totalBilled, symbol)}</p>
          </div>
          <div className="w-10 h-10 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center">
            <FileText className="w-5 h-5" />
          </div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200/80 p-4 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-xs font-medium text-slate-500">Total Paid / Collected</span>
            <p className="text-xl font-bold text-emerald-700 font-mono tabular-nums mt-1">{formatCurrency(totalCollected, symbol)}</p>
          </div>
          <div className="w-10 h-10 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
            <CheckCircle2 className="w-5 h-5" />
          </div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200/80 p-4 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-xs font-medium text-slate-500">Outstanding Balance Due</span>
            <p className="text-xl font-bold text-amber-600 font-mono tabular-nums mt-1">{formatCurrency(totalReceivable, symbol)}</p>
          </div>
          <div className="w-10 h-10 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
            <Clock className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Filter & Actions Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3 flex-1 min-w-[260px]">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search invoice #, client name, company, billing period..."
              className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-teal-600 focus:bg-white"
            />
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-700 font-medium"
          >
            <option value="All">All Statuses</option>
            <option value="Unpaid">Unpaid</option>
            <option value="Partially Paid">Partially Paid</option>
            <option value="Paid">Paid</option>
            <option value="Overdue">Overdue</option>
            <option value="Draft">Draft</option>
            <option value="Cancelled">Cancelled</option>
          </select>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() =>
              exportToExcel(
                filteredInvoices.map(i => ({
                  'Invoice #': i.invoice_number,
                  'Invoice Date': i.invoice_date,
                  'Due Date': i.due_date,
                  'Client': i.client_name_snapshot,
                  'Company': i.client_company_snapshot,
                  'Workspace': i.workspace_snapshot,
                  'Billing Period': i.billing_period,
                  'Subtotal (PKR)': i.subtotal,
                  'Discount (PKR)': i.discount,
                  'Additional Charges (PKR)': i.additional_charges,
                  'Total (PKR)': i.total,
                  'Paid (PKR)': i.paid_amount,
                  'Remaining Balance (PKR)': i.remaining_amount,
                  'Status': i.status,
                })),
                'Invoices_Register'
              )
            }
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-medium rounded-lg transition-colors cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            Export Excel
          </button>

          {hasPermission('invoices.create') && (
            <button
              onClick={handleOpenCreate}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold rounded-lg shadow-xs transition-colors cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              Create Invoice
            </button>
          )}
        </div>
      </div>

      {/* Invoices Table */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden">
        {loading ? (
          <div className="py-16 text-center text-sm text-slate-400">Loading invoices...</div>
        ) : filteredInvoices.length === 0 ? (
          <div className="py-16 text-center">
            <FileText className="w-10 h-10 text-slate-300 mx-auto mb-2" />
            <h3 className="text-sm font-semibold text-slate-800">No invoices found</h3>
            <p className="text-xs text-slate-500 mt-0.5">Generate client rental invoices with customizable line items and paragraphs.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/80 text-[11px] font-semibold uppercase tracking-wider text-slate-500 border-b border-slate-200">
                  <th className="py-3 px-4">Invoice #</th>
                  <th className="py-3 px-4">Client & Workspace</th>
                  <th className="py-3 px-4">Period</th>
                  <th className="py-3 px-4">Issue / Due</th>
                  <th className="py-3 px-4 text-right">Total</th>
                  <th className="py-3 px-4 text-right">Paid</th>
                  <th className="py-3 px-4 text-right">Balance</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {filteredInvoices.map((inv) => (
                  <tr key={inv.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3 px-4 font-mono font-bold text-slate-900">{inv.invoice_number}</td>
                    <td className="py-3 px-4">
                      <div className="font-semibold text-slate-900">{inv.client_name_snapshot}</div>
                      {inv.client_company_snapshot && (
                        <div className="text-[11px] text-slate-500">{inv.client_company_snapshot}</div>
                      )}
                      {inv.workspace_snapshot && (
                        <div className="text-[11px] text-teal-700 font-medium truncate max-w-xs">{inv.workspace_snapshot}</div>
                      )}
                    </td>
                    <td className="py-3 px-4 font-medium text-slate-700">{inv.billing_period}</td>
                    <td className="py-3 px-4 text-slate-600">
                      <div>Issued: {formatDate(inv.invoice_date)}</div>
                      <div className="text-[11px] text-slate-400">Due: {formatDate(inv.due_date)}</div>
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-bold text-slate-900 tabular-nums">
                      {formatCurrency(inv.total, symbol)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-emerald-700 font-medium tabular-nums">
                      {formatCurrency(inv.paid_amount, symbol)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-bold text-amber-700 tabular-nums">
                      {formatCurrency(inv.remaining_amount, symbol)}
                    </td>
                    <td className="py-3 px-4">
                      <span className={`inline-flex px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${statusBadge(inv.status)}`}>
                        {inv.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="inline-flex items-center gap-1">
                        <button
                          onClick={() => handlePrintInvoice(inv)}
                          className="p-1.5 text-slate-600 hover:text-teal-700 hover:bg-teal-50 rounded-md transition-colors cursor-pointer"
                          title="Print / Save A4 Invoice PDF"
                        >
                          <Printer className="w-4 h-4" />
                        </button>
                        {hasPermission('payments.create') && Number(inv.remaining_amount) > 0 && inv.status !== 'Cancelled' && (
                          <button
                            onClick={() => handleOpenQuickPayment(inv)}
                            className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-md transition-colors cursor-pointer"
                            title="Record Payment Against Invoice"
                          >
                            <DollarSign className="w-4 h-4" />
                          </button>
                        )}
                        {hasPermission('invoices.edit') && (
                          <button
                            onClick={() => handleOpenEdit(inv)}
                            className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors cursor-pointer"
                            title="Edit Invoice & Custom Paragraph"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                        )}
                        {hasPermission('invoices.delete') && (
                          <button
                            onClick={() => handleDeleteInvoice(inv)}
                            className="p-1.5 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors cursor-pointer"
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

      {/* Create / Edit Invoice Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-xl border border-slate-200 shadow-2xl w-full max-w-4xl overflow-hidden my-6">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-900 text-white">
              <div>
                <h3 className="text-base font-bold">
                  {editingInvoice ? `Edit Invoice ${editingInvoice.invoice_number}` : `Create New Invoice (Next: ${nextInvoicePreview})`}
                </h3>
                <p className="text-xs text-slate-400">
                  Full A4 company invoice with multi-line items and editable custom paragraph
                </p>
              </div>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-white cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveInvoice} className="p-6 space-y-5 max-h-[82vh] overflow-y-auto">
              {/* Top Metadata */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Select Client *</label>
                  <select
                    required
                    value={formData.client_id}
                    onChange={(e) => handleClientSelect(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
                  >
                    <option value="">-- Select Client --</option>
                    {clients.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.client_name} {c.company_name ? `(${c.company_name})` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Workspace / Office</label>
                  <select
                    value={formData.workspace_id}
                    onChange={(e) => handleWorkspaceSelect(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
                  >
                    <option value="">-- Optional Workspace --</option>
                    {workspaces.map(w => (
                      <option key={w.id} value={w.id}>
                        {w.workspace_number} — {w.name} ({w.type})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Billing Period *</label>
                  <input
                    type="text"
                    required
                    value={formData.billing_period}
                    onChange={(e) => setFormData({ ...formData, billing_period: e.target.value })}
                    placeholder="e.g. October 2026"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Invoice Date *</label>
                  <input
                    type="date"
                    required
                    value={formData.invoice_date}
                    onChange={(e) => setFormData({ ...formData, invoice_date: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Due Date *</label>
                  <input
                    type="date"
                    required
                    value={formData.due_date}
                    onChange={(e) => setFormData({ ...formData, due_date: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Expected Payment Date (Optional)</label>
                  <input
                    type="date"
                    value={formData.expected_payment_date}
                    onChange={(e) => setFormData({ ...formData, expected_payment_date: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Invoice Status</label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
                  >
                    <option value="Unpaid">Unpaid</option>
                    <option value="Draft">Draft</option>
                    <option value="Partially Paid">Partially Paid</option>
                    <option value="Paid">Paid</option>
                    <option value="Overdue">Overdue</option>
                    <option value="Cancelled">Cancelled</option>
                  </select>
                </div>
              </div>

              {/* Signature, Stamp & Role Controls for Invoice */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-bold text-slate-900">Signatures & Official Stamp Controls</span>
                  <div className="flex items-center gap-4 text-xs font-semibold text-slate-700">
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={Boolean(formData.show_signature)}
                        onChange={(e) => setFormData({ ...formData, show_signature: e.target.checked ? 1 : 0 })}
                        className="rounded text-teal-600 focus:ring-teal-500"
                      />
                      Show Signature
                    </label>
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={Boolean(formData.show_stamp)}
                        onChange={(e) => setFormData({ ...formData, show_stamp: e.target.checked ? 1 : 0 })}
                        className="rounded text-teal-600 focus:ring-teal-500"
                      />
                      Show Stamp
                    </label>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 mb-0.5">
                      Role 1: {formData.role1_title || 'Prepared By'}
                    </label>
                    <input
                      type="text"
                      value={formData.role1_name}
                      onChange={(e) => setFormData({ ...formData, role1_name: e.target.value })}
                      placeholder="Officer Name"
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 mb-0.5">
                      Role 2: {formData.role2_title || 'Accountant'}
                    </label>
                    <input
                      type="text"
                      value={formData.role2_name}
                      onChange={(e) => setFormData({ ...formData, role2_name: e.target.value })}
                      placeholder="Officer Name"
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 mb-0.5">
                      Role 3: {formData.role3_title || 'Authorized Signatory'}
                    </label>
                    <input
                      type="text"
                      value={formData.role3_name}
                      onChange={(e) => setFormData({ ...formData, role3_name: e.target.value })}
                      placeholder="Signatory Name"
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded text-xs"
                    />
                  </div>
                </div>
              </div>

              {/* Editable Custom Invoice Paragraph */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                <label className="block text-xs font-bold text-slate-800 mb-1">
                  Custom Invoice Description Paragraph (Printed on A4 Invoice)
                </label>
                <textarea
                  rows={2}
                  value={formData.custom_paragraph}
                  onChange={(e) => setFormData({ ...formData, custom_paragraph: e.target.value })}
                  placeholder="Write a custom narrative or description paragraph for this invoice..."
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs leading-relaxed"
                />
              </div>

              {/* Line Items Table */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-600">
                    Invoice Line Items
                  </label>
                  <button
                    type="button"
                    onClick={addItem}
                    className="inline-flex items-center gap-1 px-2.5 py-1 bg-teal-50 hover:bg-teal-100 text-teal-700 text-xs font-semibold rounded-md cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add Line Item
                  </button>
                </div>

                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-100 text-slate-600 font-semibold">
                      <tr>
                        <th className="py-2 px-3 text-left">Description</th>
                        <th className="py-2 px-3 text-left w-44">Category</th>
                        <th className="py-2 px-3 text-right w-20">Qty</th>
                        <th className="py-2 px-3 text-right w-32">Unit Price</th>
                        <th className="py-2 px-3 text-right w-32">Amount</th>
                        <th className="py-2 px-2 w-10"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {formData.items.map((item, idx) => (
                        <tr key={idx}>
                          <td className="p-2">
                            <input
                              type="text"
                              required
                              value={item.description}
                              onChange={(e) => updateItem(idx, 'description', e.target.value)}
                              placeholder="Service description"
                              className="w-full px-2.5 py-1.5 border border-slate-300 rounded text-xs"
                            />
                          </td>
                          <td className="p-2">
                            <select
                              value={item.category}
                              onChange={(e) => updateItem(idx, 'category', e.target.value)}
                              className="w-full px-2 py-1.5 border border-slate-300 rounded text-xs bg-white"
                            >
                              {ITEM_CATEGORIES.map(cat => (
                                <option key={cat} value={cat}>{cat}</option>
                              ))}
                            </select>
                          </td>
                          <td className="p-2">
                            <input
                              type="number"
                              min="0.01"
                              step="any"
                              required
                              value={item.quantity}
                              onChange={(e) => updateItem(idx, 'quantity', Number(e.target.value))}
                              className="w-full px-2 py-1.5 border border-slate-300 rounded text-xs text-right font-mono"
                            />
                          </td>
                          <td className="p-2">
                            <input
                              type="number"
                              min="0"
                              step="any"
                              required
                              value={item.unit_price}
                              onChange={(e) => updateItem(idx, 'unit_price', Number(e.target.value))}
                              className="w-full px-2 py-1.5 border border-slate-300 rounded text-xs text-right font-mono"
                            />
                          </td>
                          <td className="p-2 text-right font-mono font-semibold text-slate-900">
                            {formatCurrency(item.amount, symbol)}
                          </td>
                          <td className="p-2 text-center">
                            {formData.items.length > 1 && (
                              <button
                                type="button"
                                onClick={() => removeItem(idx)}
                                className="text-slate-400 hover:text-red-600 cursor-pointer"
                              >
                                ✕
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Totals & Notes */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Invoice Notes / Payment Instructions</label>
                    <textarea
                      rows={2}
                      value={formData.notes}
                      onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Terms & Conditions</label>
                    <textarea
                      rows={2}
                      value={formData.terms}
                      onChange={(e) => setFormData({ ...formData, terms: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs"
                    />
                  </div>
                </div>

                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3 text-xs">
                  <div className="flex justify-between items-center">
                    <span className="text-slate-600">Subtotal:</span>
                    <span className="font-mono font-semibold text-sm">{formatCurrency(subtotal, symbol)}</span>
                  </div>
                  <div className="flex justify-between items-center gap-4">
                    <span className="text-slate-600">Discount (PKR):</span>
                    <input
                      type="number"
                      min="0"
                      value={formData.discount}
                      onChange={(e) => setFormData({ ...formData, discount: Number(e.target.value) })}
                      className="w-32 px-2.5 py-1 bg-white border border-slate-300 rounded text-right font-mono"
                    />
                  </div>
                  <div className="flex justify-between items-center gap-4">
                    <span className="text-slate-600">Additional Charges (PKR):</span>
                    <input
                      type="number"
                      min="0"
                      value={formData.additional_charges}
                      onChange={(e) => setFormData({ ...formData, additional_charges: Number(e.target.value) })}
                      className="w-32 px-2.5 py-1 bg-white border border-slate-300 rounded text-right font-mono"
                    />
                  </div>
                  <div className="flex justify-between items-center pt-3 border-t border-slate-300 text-sm font-bold text-slate-900">
                    <span>Grand Total:</span>
                    <span className="font-mono text-base text-teal-700">{formatCurrency(grandTotal, symbol)}</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 rounded-lg text-xs font-semibold bg-teal-600 hover:bg-teal-700 text-white shadow-xs cursor-pointer"
                >
                  {submitting ? 'Saving...' : editingInvoice ? 'Save Invoice Changes' : 'Generate Invoice'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Quick Record Payment Modal */}
      {paymentModalInvoice && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl border border-slate-200 shadow-2xl w-full max-w-md overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <h3 className="text-sm font-bold text-slate-900">
                Record Payment — {paymentModalInvoice.invoice_number}
              </h3>
              <button onClick={() => setPaymentModalInvoice(null)} className="text-slate-400 hover:text-slate-600 cursor-pointer">
                ✕
              </button>
            </div>
            <form onSubmit={handleSaveQuickPayment} className="p-5 space-y-4 text-xs">
              <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 space-y-1">
                <div className="flex justify-between">
                  <span className="text-slate-500">Client:</span>
                  <span className="font-semibold text-slate-900">{paymentModalInvoice.client_name_snapshot}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Remaining Balance:</span>
                  <span className="font-mono font-bold text-amber-700">{formatCurrency(paymentModalInvoice.remaining_amount, symbol)}</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Payment Date *</label>
                  <input
                    type="date"
                    required
                    value={quickPaymentForm.payment_date}
                    onChange={(e) => setQuickPaymentForm({ ...quickPaymentForm, payment_date: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Amount Paid (PKR) *</label>
                  <input
                    type="number"
                    min="1"
                    step="any"
                    required
                    value={quickPaymentForm.amount}
                    onChange={(e) => setQuickPaymentForm({ ...quickPaymentForm, amount: Number(e.target.value) })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-mono font-bold text-emerald-700"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Payment Method</label>
                  <select
                    value={quickPaymentForm.payment_method}
                    onChange={(e) => setQuickPaymentForm({ ...quickPaymentForm, payment_method: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs bg-white"
                  >
                    <option value="Bank Transfer">Bank Transfer</option>
                    <option value="Cash">Cash</option>
                    <option value="Online Payment">Online Payment</option>
                    <option value="Card">Card</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Reference / TXN #</label>
                  <input
                    type="text"
                    value={quickPaymentForm.reference_number}
                    onChange={(e) => setQuickPaymentForm({ ...quickPaymentForm, reference_number: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs"
                  />
                </div>
              </div>

              <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-700 flex items-center gap-1.5">
                    <ImageIcon className="w-3.5 h-3.5 text-teal-600" />
                    Transaction Screenshot (Optional)
                  </span>
                  <div className="flex items-center gap-1.5">
                    <label className="inline-flex items-center gap-1 px-2.5 py-1 bg-teal-600 hover:bg-teal-700 text-white rounded text-[11px] font-semibold cursor-pointer">
                      <Upload className="w-3 h-3" />
                      {quickPaymentForm.transaction_screenshot ? 'Replace' : 'Attach Proof'}
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          const reader = new FileReader();
                          reader.onload = () => {
                            setQuickPaymentForm((prev) => ({
                              ...prev,
                              transaction_screenshot: reader.result as string,
                            }));
                          };
                          reader.readAsDataURL(file);
                          e.target.value = '';
                        }}
                        className="hidden"
                      />
                    </label>
                    {quickPaymentForm.transaction_screenshot && (
                      <button
                        type="button"
                        onClick={() => setQuickPaymentForm((prev) => ({ ...prev, transaction_screenshot: '' }))}
                        className="px-2 py-1 text-[11px] text-red-600 hover:bg-red-50 rounded cursor-pointer"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                </div>
                {quickPaymentForm.transaction_screenshot && (
                  <img
                    src={quickPaymentForm.transaction_screenshot}
                    alt="Transaction Screenshot"
                    className="max-h-28 w-auto mx-auto rounded border border-slate-200 bg-white p-1"
                  />
                )}
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setPaymentModalInvoice(null)}
                  className="px-4 py-2 rounded-lg text-slate-600 hover:bg-slate-100 font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white font-semibold cursor-pointer"
                >
                  Confirm Payment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
