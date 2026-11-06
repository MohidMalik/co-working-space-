import React, { useState, useEffect, useCallback } from 'react';
import { useApp } from '../context/AppContext';
import { apiRequest } from '../services/api';
import { formatCurrency, formatDate, exportToExcel } from '../utils/format';
import { Plus, Search, Download, Printer, Edit2, Trash2, Wallet, CreditCard, ArrowUpRight, Image as ImageIcon, Upload, X, Eye } from 'lucide-react';
import { PAYMENT_METHODS } from '../shared/permissions';

export default function PaymentsPage() {
  const { hasPermission, showToast, confirmAction, openPrintPreview, appSettings, user } = useApp();
  const symbol = appSettings?.currency_symbol || 'Rs.';

  const [payments, setPayments] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [methodFilter, setMethodFilter] = useState('All');

  const [showFormModal, setShowFormModal] = useState(false);
  const [editingPayment, setEditingPayment] = useState<any | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [previewScreenshot, setPreviewScreenshot] = useState<{ title: string; src: string } | null>(null);

  const [formData, setFormData] = useState({
    invoice_id: '',
    amount: 0,
    payment_date: new Date().toISOString().split('T')[0],
    payment_method: 'Bank Transfer',
    reference_number: '',
    transaction_screenshot: '',
    received_by: user?.full_name || '',
    notes: '',
  });

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [payRes, invRes] = await Promise.all([
        apiRequest<{ payments: any[] }>('/payments'),
        apiRequest<{ invoices: any[] }>('/invoices'),
      ]);
      setPayments(payRes.payments || []);
      setInvoices(invRes.invoices || []);
    } catch (err: any) {
      showToast(err.message || 'Failed to load payments', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleOpenCreate = () => {
    const unpaidInvoices = invoices.filter(i => i.status !== 'Paid' && i.status !== 'Cancelled');
    const firstInv = unpaidInvoices[0] || invoices[0];

    setEditingPayment(null);
    setFormData({
      invoice_id: firstInv ? String(firstInv.id) : '',
      amount: firstInv ? Number(firstInv.remaining_amount || 0) : 0,
      payment_date: new Date().toISOString().split('T')[0],
      payment_method: 'Bank Transfer',
      reference_number: '',
      transaction_screenshot: '',
      received_by: user?.full_name || '',
      notes: '',
    });
    setShowFormModal(true);
  };

  const handleOpenEdit = (p: any) => {
    setEditingPayment(p);
    setFormData({
      invoice_id: String(p.invoice_id),
      amount: Number(p.amount || 0),
      payment_date: p.payment_date,
      payment_method: p.payment_method || 'Bank Transfer',
      reference_number: p.reference_number || '',
      transaction_screenshot: p.transaction_screenshot || '',
      received_by: p.received_by || '',
      notes: p.notes || '',
    });
    setShowFormModal(true);
  };

  const handleScreenshotUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setFormData((prev) => ({ ...prev, transaction_screenshot: String(reader.result || '') }));
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleInvoiceChange = (invoiceId: string) => {
    const inv = invoices.find(i => String(i.id) === invoiceId);
    if (inv) {
      setFormData(prev => ({
        ...prev,
        invoice_id: invoiceId,
        amount: Number(inv.remaining_amount || inv.total || 0),
      }));
    } else {
      setFormData(prev => ({ ...prev, invoice_id: invoiceId }));
    }
  };

  const selectedInvoice = invoices.find(i => String(i.id) === formData.invoice_id);
  const currentInvoiceRemaining = selectedInvoice
    ? Number(selectedInvoice.remaining_amount || 0) +
      (editingPayment && String(editingPayment.invoice_id) === formData.invoice_id ? Number(editingPayment.amount || 0) : 0)
    : 0;
  const newRemainingAfterPayment = Math.max(0, currentInvoiceRemaining - Number(formData.amount || 0));

  const handleSavePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.invoice_id || !formData.amount || formData.amount <= 0) {
      showToast('Please select an invoice and enter a valid payment amount', 'error');
      return;
    }
    try {
      setSubmitting(true);
      if (editingPayment) {
        await apiRequest(`/payments/${editingPayment.id}`, {
          method: 'PUT',
          body: JSON.stringify(formData),
        });
        showToast('Payment updated and invoice balance recalculated', 'success');
      } else {
        await apiRequest('/payments', {
          method: 'POST',
          body: JSON.stringify(formData),
        });
        showToast('Payment recorded and invoice balance updated', 'success');
      }
      setShowFormModal(false);
      loadData();
    } catch (err: any) {
      showToast(err.message || 'Failed to save payment', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeletePayment = (p: any) => {
    confirmAction({
      title: 'Move Payment to Trash',
      message: `Are you sure you want to move payment "${p.receipt_number}" (${formatCurrency(p.amount, symbol)}) to Trash? The linked invoice balance will be automatically recalculated.`,
      confirmLabel: 'Move to Trash',
      danger: true,
      onConfirm: async (reason) => {
        try {
          await apiRequest(`/payments/${p.id}`, {
            method: 'DELETE',
            body: JSON.stringify({ reason }),
          });
          showToast('Payment moved to Trash and invoice recalculated', 'info');
          loadData();
        } catch (err: any) {
          showToast(err.message || 'Failed to delete payment', 'error');
        }
      },
    });
  };

  const handlePrintReceipt = (p: any) => {
    openPrintPreview({
      type: 'receipt',
      title: `Payment Receipt ${p.receipt_number}`,
      data: p,
    });
  };

  const filteredPayments = payments.filter(p => {
    const matchesMethod = methodFilter === 'All' || p.payment_method === methodFilter;
    const q = search.toLowerCase();
    const matchesSearch =
      !q ||
      (p.receipt_number || '').toLowerCase().includes(q) ||
      (p.invoice_number || '').toLowerCase().includes(q) ||
      (p.client_name || '').toLowerCase().includes(q) ||
      (p.reference_number || '').toLowerCase().includes(q);
    return matchesMethod && matchesSearch;
  });

  const handleExport = () => {
    exportToExcel(
      filteredPayments.map(p => ({
        'Receipt #': p.receipt_number,
        'Payment Code': p.payment_code,
        'Invoice #': p.invoice_number || '',
        'Client Name': p.client_name,
        'Payment Date': p.payment_date,
        'Amount (PKR)': p.amount,
        'Payment Method': p.payment_method,
        'Reference #': p.reference_number,
        'Received By': p.received_by,
        'Notes': p.notes,
      })),
      'Payments_List'
    );
    showToast('Payments exported to Excel', 'success');
  };

  const totalCollected = filteredPayments.reduce((acc, p) => acc + Number(p.amount || 0), 0);

  return (
    <div className="space-y-5">
      {/* Summary Header */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-slate-200/80 p-4 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-xs font-medium text-slate-500">Total Collected (Filtered)</span>
            <p className="text-2xl font-bold text-emerald-700 font-mono tabular-nums mt-1">{formatCurrency(totalCollected, symbol)}</p>
          </div>
          <div className="w-10 h-10 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
            <Wallet className="w-5 h-5" />
          </div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200/80 p-4 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-xs font-medium text-slate-500">Total Transactions</span>
            <p className="text-2xl font-bold text-slate-900 font-mono tabular-nums mt-1">{filteredPayments.length}</p>
          </div>
          <div className="w-10 h-10 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
            <CreditCard className="w-5 h-5" />
          </div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200/80 p-4 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-xs font-medium text-slate-500">Open Unpaid / Partial Invoices</span>
            <p className="text-2xl font-bold text-amber-600 font-mono tabular-nums mt-1">
              {invoices.filter(i => i.status === 'Unpaid' || i.status === 'Partially Paid' || i.status === 'Overdue').length}
            </p>
          </div>
          <div className="w-10 h-10 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
            <ArrowUpRight className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3 flex-1 min-w-[260px]">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search receipt #, invoice #, client, reference..."
              className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-teal-600 focus:bg-white"
            />
          </div>

          <select
            value={methodFilter}
            onChange={(e) => setMethodFilter(e.target.value)}
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-700 font-medium"
          >
            <option value="All">All Methods</option>
            {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={handleExport}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-medium rounded-lg transition-colors cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            Export Excel
          </button>

          {hasPermission('payments.create') && (
            <button
              onClick={handleOpenCreate}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold rounded-lg shadow-xs transition-colors cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              Record Payment
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden">
        {loading ? (
          <div className="py-16 text-center text-sm text-slate-400">Loading payments...</div>
        ) : filteredPayments.length === 0 ? (
          <div className="py-16 text-center">
            <Wallet className="w-10 h-10 text-slate-300 mx-auto mb-2" />
            <h3 className="text-sm font-semibold text-slate-800">No payments found</h3>
            <p className="text-xs text-slate-500 mt-0.5">Record full or partial invoice payments here.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/80 text-[11px] font-semibold uppercase tracking-wider text-slate-500 border-b border-slate-200">
                  <th className="py-3 px-4">Receipt #</th>
                  <th className="py-3 px-4">Invoice #</th>
                  <th className="py-3 px-4">Client</th>
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4">Method & Ref</th>
                  <th className="py-3 px-4">Screenshot</th>
                  <th className="py-3 px-4 text-right">Amount</th>
                  <th className="py-3 px-4">Received By</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {filteredPayments.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3 px-4 font-mono font-bold text-teal-700">{p.receipt_number}</td>
                    <td className="py-3 px-4 font-mono font-medium text-slate-700">{p.invoice_number || '—'}</td>
                    <td className="py-3 px-4 font-semibold text-slate-900">{p.client_name}</td>
                    <td className="py-3 px-4 text-slate-600">{formatDate(p.payment_date)}</td>
                    <td className="py-3 px-4">
                      <span className="font-medium text-slate-800">{p.payment_method}</span>
                      {p.reference_number && <div className="text-[11px] text-slate-400 font-mono">Ref: {p.reference_number}</div>}
                    </td>
                    <td className="py-3 px-4">
                      {p.transaction_screenshot ? (
                        <button
                          type="button"
                          onClick={() =>
                            setPreviewScreenshot({
                              title: `Transaction Screenshot — ${p.receipt_number} (${p.client_name})`,
                              src: p.transaction_screenshot,
                            })
                          }
                          className="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-teal-50 text-teal-700 border border-teal-200 hover:bg-teal-100 text-[11px] font-medium cursor-pointer"
                        >
                          <img
                            src={p.transaction_screenshot}
                            alt="Proof"
                            className="w-5 h-5 object-cover rounded border border-teal-300"
                          />
                          <span>View Proof</span>
                        </button>
                      ) : (
                        <span className="text-slate-400 text-[11px]">No Screenshot</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-bold text-emerald-700 tabular-nums">
                      {formatCurrency(p.amount, symbol)}
                    </td>
                    <td className="py-3 px-4 text-slate-600">{p.received_by || '—'}</td>
                    <td className="py-3 px-4 text-right">
                      <div className="inline-flex items-center gap-1">
                        <button
                          onClick={() => handlePrintReceipt(p)}
                          className="p-1.5 text-slate-500 hover:text-teal-600 hover:bg-teal-50 rounded-md transition-colors cursor-pointer"
                          title="Print / Download Payment Receipt"
                        >
                          <Printer className="w-4 h-4" />
                        </button>
                        {hasPermission('payments.edit') && (
                          <button
                            onClick={() => handleOpenEdit(p)}
                            className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors cursor-pointer"
                            title="Edit Payment"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                        )}
                        {hasPermission('payments.delete') && (
                          <button
                            onClick={() => handleDeletePayment(p)}
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

      {/* Create / Edit Payment Modal */}
      {showFormModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-xl border border-slate-200 shadow-2xl w-full max-w-lg overflow-hidden my-8">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <h3 className="text-base font-bold text-slate-900">
                {editingPayment ? `Edit Payment (${editingPayment.receipt_number})` : 'Record Invoice Payment'}
              </h3>
              <button onClick={() => setShowFormModal(false)} className="text-slate-400 hover:text-slate-600 text-sm font-medium cursor-pointer">
                ✕
              </button>
            </div>

            <form onSubmit={handleSavePayment} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Select Invoice *</label>
                <select
                  required
                  disabled={!!editingPayment}
                  value={formData.invoice_id}
                  onChange={(e) => handleInvoiceChange(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
                >
                  <option value="">-- Select Invoice --</option>
                  {invoices.map(inv => (
                    <option key={inv.id} value={inv.id}>
                      {inv.invoice_number} — {inv.client_name_snapshot} (Bal: {formatCurrency(inv.remaining_amount, symbol)} / Total: {formatCurrency(inv.total, symbol)})
                    </option>
                  ))}
                </select>
              </div>

              {selectedInvoice && (
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs space-y-1">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Invoice Total:</span>
                    <span className="font-mono font-semibold text-slate-800">{formatCurrency(selectedInvoice.total, symbol)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Current Balance Due:</span>
                    <span className="font-mono font-semibold text-amber-700">{formatCurrency(currentInvoiceRemaining, symbol)}</span>
                  </div>
                  <div className="flex justify-between border-t border-slate-200 pt-1">
                    <span className="text-slate-700 font-semibold">Remaining After This Payment:</span>
                    <span className="font-mono font-bold text-teal-700">{formatCurrency(newRemainingAfterPayment, symbol)}</span>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Payment Date *</label>
                  <input
                    type="date"
                    required
                    value={formData.payment_date}
                    onChange={(e) => setFormData({ ...formData, payment_date: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Amount Paid (PKR) *</label>
                  <input
                    type="number"
                    min="1"
                    step="0.01"
                    required
                    value={formData.amount}
                    onChange={(e) => setFormData({ ...formData, amount: Number(e.target.value) })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono font-bold text-emerald-700"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Payment Method *</label>
                  <select
                    value={formData.payment_method}
                    onChange={(e) => setFormData({ ...formData, payment_method: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
                  >
                    {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Reference / Transaction #</label>
                  <input
                    type="text"
                    value={formData.reference_number}
                    onChange={(e) => setFormData({ ...formData, reference_number: e.target.value })}
                    placeholder="e.g. IBFT-984120"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Received By</label>
                <input
                  type="text"
                  value={formData.received_by}
                  onChange={(e) => setFormData({ ...formData, received_by: e.target.value })}
                  placeholder="Staff Name"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Notes</label>
                <textarea
                  rows={2}
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                />
              </div>

              {/* Transaction Screenshot Upload */}
              <div className="border border-slate-200 rounded-lg p-3.5 bg-slate-50/60">
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-xs font-semibold text-slate-800 flex items-center gap-1.5">
                    <ImageIcon className="w-4 h-4 text-teal-600" />
                    <span>Transaction Screenshot / Payment Proof (Optional)</span>
                  </label>
                  {formData.transaction_screenshot && (
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, transaction_screenshot: '' })}
                      className="text-xs text-red-600 hover:underline font-medium cursor-pointer"
                    >
                      Remove Screenshot
                    </button>
                  )}
                </div>

                {formData.transaction_screenshot ? (
                  <div className="space-y-2 text-center">
                    <img
                      src={formData.transaction_screenshot}
                      alt="Transaction Screenshot Preview"
                      className="max-h-44 mx-auto object-contain rounded border border-slate-300 bg-white p-1"
                    />
                    <label className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 text-white rounded-lg text-xs font-medium cursor-pointer hover:bg-slate-800">
                      <Upload className="w-3.5 h-3.5" />
                      <span>Replace Screenshot</span>
                      <input type="file" accept="image/*" onChange={handleScreenshotUpload} className="hidden" />
                    </label>
                  </div>
                ) : (
                  <label className="flex flex-col items-center justify-center border-2 border-dashed border-slate-300 hover:border-teal-500 rounded-lg py-4 px-3 bg-white cursor-pointer transition-colors">
                    <Upload className="w-5 h-5 text-slate-400 mb-1" />
                    <span className="text-xs font-medium text-slate-700">Click to attach bank transfer / JazzCash / EasyPaisa screenshot</span>
                    <span className="text-[11px] text-slate-400 mt-0.5">PNG, JPG, WEBP supported — prints automatically on receipt</span>
                    <input type="file" accept="image/*" onChange={handleScreenshotUpload} className="hidden" />
                  </label>
                )}
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowFormModal(false)}
                  className="px-4 py-2 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 rounded-lg text-xs font-semibold bg-teal-600 hover:bg-teal-700 text-white shadow-xs cursor-pointer"
                >
                  {submitting ? 'Saving...' : editingPayment ? 'Update Payment' : 'Record Payment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Screenshot Lightbox Modal */}
      {previewScreenshot && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setPreviewScreenshot(null)}
        >
          <div
            className="bg-white rounded-xl max-w-2xl w-full overflow-hidden shadow-2xl border border-slate-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900 truncate">{previewScreenshot.title}</h3>
              <button onClick={() => setPreviewScreenshot(null)} className="text-slate-400 hover:text-slate-700 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 bg-slate-900 flex justify-center">
              <img src={previewScreenshot.src} alt={previewScreenshot.title} className="max-h-[75vh] object-contain rounded" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
