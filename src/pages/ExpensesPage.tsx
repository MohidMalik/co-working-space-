import React, { useState, useEffect, useCallback } from 'react';
import { useApp } from '../context/AppContext';
import { apiRequest } from '../services/api';
import { formatCurrency, formatDate, exportToExcel } from '../utils/format';
import {
  Plus,
  Search,
  Download,
  Printer,
  Edit2,
  Trash2,
  FileText,
  Paperclip,
  Eye,
  X,
  Tags,
  CheckCircle,
  Clock,
  AlertCircle,
  ExternalLink,
} from 'lucide-react';
import { DEFAULT_EXPENSE_CATEGORIES, PAYMENT_METHODS } from '../shared/permissions';

const PAYMENT_STATUSES = ['Paid', 'Partially Paid', 'Unpaid'] as const;

export default function ExpensesPage() {
  const { hasPermission, showToast, confirmAction, openPrintPreview, appSettings } = useApp();
  const symbol = appSettings?.currency_symbol || 'Rs.';

  const [expenses, setExpenses] = useState<any[]>([]);
  const [categories, setCategories] = useState<string[]>(DEFAULT_EXPENSE_CATEGORIES);
  const [loading, setLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [methodFilter, setMethodFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');
  const [monthFilter, setMonthFilter] = useState(new Date().toISOString().slice(0, 7)); // YYYY-MM
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Modals
  const [showFormModal, setShowFormModal] = useState(false);
  const [editingExpense, setEditingExpense] = useState<any | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Category Manager Modal
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [editingCategoryObj, setEditingCategoryObj] = useState<any | null>(null);
  const [editCategoryName, setEditCategoryName] = useState('');
  const [categoryListRaw, setCategoryListRaw] = useState<any[]>([]);

  // Bill Attachment Viewer Modal
  const [previewAttachment, setPreviewAttachment] = useState<{
    fileName: string;
    mimeType: string;
    data: string;
    expenseCode: string;
  } | null>(null);

  const [formData, setFormData] = useState({
    expense_date: new Date().toISOString().split('T')[0],
    category: 'Electricity',
    description: '',
    vendor: '',
    payer: '',
    payee: '',
    payment_method: 'Cash',
    payment_status: 'Paid',
    reference_number: '',
    amount: 0,
    notes: '',
    attachment_file_name: '',
    attachment_mime_type: '',
    attachment_data: '',
  });

  const loadExpenses = useCallback(async () => {
    try {
      setLoading(true);
      const res = await apiRequest<{ expenses: any[]; categories: any[] }>('/expenses');
      setExpenses(res.expenses || []);
      if (Array.isArray(res.categories) && res.categories.length > 0) {
        setCategoryListRaw(res.categories);
        setCategories(res.categories.map((c: any) => c.name));
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to load expenses', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    loadExpenses();
  }, [loadExpenses]);

  const handleOpenCreate = () => {
    setEditingExpense(null);
    setFormData({
      expense_date: new Date().toISOString().split('T')[0],
      category: categories[0] || 'Electricity',
      description: '',
      vendor: '',
      payer: '',
      payee: '',
      payment_method: 'Cash',
      payment_status: 'Paid',
      reference_number: '',
      amount: 0,
      notes: '',
      attachment_file_name: '',
      attachment_mime_type: '',
      attachment_data: '',
    });
    setShowFormModal(true);
  };

  const handleOpenEdit = (exp: any) => {
    setEditingExpense(exp);
    setFormData({
      expense_date: exp.expense_date,
      category: exp.category,
      description: exp.description || '',
      vendor: exp.vendor || exp.payee || '',
      payer: exp.payer || '',
      payee: exp.payee || exp.vendor || '',
      payment_method: exp.payment_method || 'Cash',
      payment_status: exp.payment_status || 'Paid',
      reference_number: exp.reference_number || '',
      amount: Number(exp.amount || 0),
      notes: exp.notes || '',
      attachment_file_name: exp.attachment_file_name || '',
      attachment_mime_type: exp.attachment_mime_type || '',
      attachment_data: exp.attachment_data || '',
    });
    setShowFormModal(true);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 8 * 1024 * 1024) {
      showToast('File size must be under 8MB', 'error');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setFormData(prev => ({
        ...prev,
        attachment_file_name: file.name,
        attachment_mime_type: file.type || 'application/octet-stream',
        attachment_data: reader.result as string,
      }));
    };
    reader.readAsDataURL(file);
  };

  const handleSaveExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.category || !formData.description.trim() || !formData.amount || formData.amount <= 0) {
      showToast('Category, description, and a valid amount are required', 'error');
      return;
    }

    try {
      setSubmitting(true);
      const payload = {
        ...formData,
        vendor: formData.payee || formData.vendor,
        amount: Number(formData.amount),
      };

      if (editingExpense) {
        await apiRequest(`/expenses/${editingExpense.id}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
        showToast('Expense updated successfully', 'success');
      } else {
        await apiRequest('/expenses', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        showToast('Expense recorded successfully', 'success');
      }
      setShowFormModal(false);
      loadExpenses();
    } catch (err: any) {
      showToast(err.message || 'Failed to save expense', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteExpense = (exp: any) => {
    confirmAction({
      title: 'Move Expense to Trash',
      message: `Are you sure you want to move expense "${exp.expense_code} - ${exp.description}" (${formatCurrency(exp.amount, symbol)}) to Trash?`,
      confirmLabel: 'Move to Trash',
      danger: true,
      onConfirm: async (reason) => {
        try {
          await apiRequest(`/expenses/${exp.id}`, {
            method: 'DELETE',
            body: JSON.stringify({ reason }),
          });
          showToast('Expense moved to Trash', 'info');
          loadExpenses();
        } catch (err: any) {
          showToast(err.message || 'Failed to delete expense', 'error');
        }
      },
    });
  };

  // Category CRUD Handlers
  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = newCategoryName.trim();
    if (!name) return;
    try {
      await apiRequest('/expense-categories', {
        method: 'POST',
        body: JSON.stringify({ name }),
      });
      showToast(`Category "${name}" created and saved`, 'success');
      setNewCategoryName('');
      loadExpenses();
    } catch (err: any) {
      showToast(err.message || 'Failed to create category', 'error');
    }
  };

  const handleUpdateCategory = async (catId: number) => {
    const name = editCategoryName.trim();
    if (!name) return;
    try {
      await apiRequest(`/expense-categories/${catId}`, {
        method: 'PUT',
        body: JSON.stringify({ name }),
      });
      showToast(`Category renamed to "${name}"`, 'success');
      setEditingCategoryObj(null);
      setEditCategoryName('');
      loadExpenses();
    } catch (err: any) {
      showToast(err.message || 'Failed to update category', 'error');
    }
  };

  const handleDeleteCategory = (cat: any) => {
    confirmAction({
      title: 'Delete Expense Category',
      message: `Remove category "${cat.name}"? Existing expenses with this category will be preserved.`,
      confirmLabel: 'Delete Category',
      danger: true,
      onConfirm: async () => {
        try {
          await apiRequest(`/expense-categories/${cat.id}`, { method: 'DELETE' });
          showToast(`Category "${cat.name}" deleted`, 'info');
          loadExpenses();
        } catch (err: any) {
          showToast(err.message || 'Failed to delete category', 'error');
        }
      },
    });
  };

  // Filter logic
  const filteredExpenses = expenses.filter(e => {
    let matchesDate = true;
    if (startDate && endDate) {
      matchesDate = (e.expense_date || '') >= startDate && (e.expense_date || '') <= endDate;
    } else if (monthFilter) {
      matchesDate = (e.expense_date || '').startsWith(monthFilter);
    }

    const matchesCat = categoryFilter === 'All' || e.category === categoryFilter;
    const matchesMethod = methodFilter === 'All' || e.payment_method === methodFilter;
    const matchesStatus = statusFilter === 'All' || (e.payment_status || 'Paid') === statusFilter;

    const q = search.toLowerCase();
    const matchesSearch =
      !q ||
      (e.expense_code || '').toLowerCase().includes(q) ||
      (e.description || '').toLowerCase().includes(q) ||
      (e.vendor || '').toLowerCase().includes(q) ||
      (e.payer || '').toLowerCase().includes(q) ||
      (e.payee || '').toLowerCase().includes(q) ||
      (e.category || '').toLowerCase().includes(q) ||
      (e.reference_number || '').toLowerCase().includes(q);

    return matchesDate && matchesCat && matchesMethod && matchesStatus && matchesSearch;
  });

  const totalAmount = filteredExpenses.reduce((sum, e) => sum + Number(e.amount || 0), 0);
  const totalPaid = filteredExpenses
    .filter(e => (e.payment_status || 'Paid') === 'Paid')
    .reduce((sum, e) => sum + Number(e.amount || 0), 0);
  const totalUnpaid = totalAmount - totalPaid;

  const handlePrintMonthlyExpenseSheet = () => {
    openPrintPreview({
      type: 'expense-sheet',
      title: `Expense Sheet — ${monthFilter || 'Custom Filter'}`,
      data: {
        period: { label: monthFilter || 'Custom Period' },
        expenses: filteredExpenses,
        summary: { totalExpenses: totalAmount },
        expenseBreakdown: [],
        expenseMethodBreakdown: [],
      },
    });
  };

  const handleExportExcel = () => {
    if (!hasPermission('reports.export')) {
      showToast('You do not have permission to export expenses', 'error');
      return;
    }
    exportToExcel(
      filteredExpenses.map(e => ({
        'Voucher #': e.expense_code,
        'Date': e.expense_date,
        'Category': e.category,
        'Description': e.description,
        'Paid By (Payer)': e.payer || 'Company',
        'Received By (Payee)': e.payee || e.vendor || '—',
        'Payment Method': e.payment_method,
        'Payment Status': e.payment_status || 'Paid',
        'Reference / TXN #': e.reference_number || '—',
        'Amount (PKR)': e.amount,
        'Has Attachment': e.attachment_data ? 'Yes' : 'No',
        'Notes': e.notes || '',
      })),
      `Expenses_${monthFilter || 'Export'}`
    );
  };

  const downloadAttachmentFile = (att: { fileName: string; data: string }) => {
    const a = document.createElement('a');
    a.href = att.data;
    a.download = att.fileName || 'expense_receipt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div className="space-y-5">
      {/* KPI Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white border border-slate-200/80 rounded-xl p-4 shadow-xs">
          <div className="text-xs font-medium text-slate-500">Total Filtered Expenses</div>
          <div className="text-xl font-bold font-mono text-slate-900 mt-1 tabular-nums">
            {formatCurrency(totalAmount, symbol)}
          </div>
          <div className="text-xs text-slate-500 mt-0.5">{filteredExpenses.length} vouchers recorded</div>
        </div>

        <div className="bg-white border border-slate-200/80 rounded-xl p-4 shadow-xs">
          <div className="text-xs font-medium text-slate-500">Paid Out</div>
          <div className="text-xl font-bold font-mono text-emerald-700 mt-1 tabular-nums">
            {formatCurrency(totalPaid, symbol)}
          </div>
          <div className="text-xs text-emerald-600 mt-0.5">Cleared cash / bank payments</div>
        </div>

        <div className="bg-white border border-slate-200/80 rounded-xl p-4 shadow-xs">
          <div className="text-xs font-medium text-slate-500">Unpaid / Pending Bills</div>
          <div className="text-xl font-bold font-mono text-amber-700 mt-1 tabular-nums">
            {formatCurrency(totalUnpaid, symbol)}
          </div>
          <div className="text-xs text-amber-600 mt-0.5">Due operational invoices</div>
        </div>
      </div>

      {/* Filter & Action Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2.5 flex-1 min-w-[280px]">
            {/* Search */}
            <div className="relative flex-1 min-w-[200px] max-w-xs">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search voucher, description, payer, payee..."
                className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:outline-none focus:border-teal-600 focus:bg-white"
              />
            </div>

            {/* Month Filter */}
            <input
              type="month"
              value={monthFilter}
              onChange={(e) => {
                setMonthFilter(e.target.value);
                setStartDate('');
                setEndDate('');
              }}
              className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-700 font-medium"
              title="Filter by Month"
            />
            {monthFilter && (
              <button
                onClick={() => setMonthFilter('')}
                className="text-xs text-slate-500 hover:text-slate-800 underline cursor-pointer"
              >
                All Months
              </button>
            )}

            {/* Category Filter */}
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-700 font-medium"
            >
              <option value="All">All Categories</option>
              {categories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>

            {/* Status Filter */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-700 font-medium"
            >
              <option value="All">All Payment Statuses</option>
              {PAYMENT_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>

            {/* Method Filter */}
            <select
              value={methodFilter}
              onChange={(e) => setMethodFilter(e.target.value)}
              className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-700 font-medium"
            >
              <option value="All">All Methods</option>
              {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setShowCategoryModal(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-lg transition-colors cursor-pointer"
              title="Manage Expense Categories"
            >
              <Tags className="w-3.5 h-3.5 text-teal-600" />
              Manage Categories
            </button>

            <button
              onClick={handlePrintMonthlyExpenseSheet}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              Print Sheet
            </button>

            <button
              onClick={handleExportExcel}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-medium rounded-lg transition-colors cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              Export Excel
            </button>

            {hasPermission('expenses.create') && (
              <button
                onClick={handleOpenCreate}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold rounded-lg shadow-xs transition-colors cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                Add Expense
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Expenses Table */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden">
        {loading ? (
          <div className="py-16 text-center text-xs text-slate-400">Loading expenses...</div>
        ) : filteredExpenses.length === 0 ? (
          <div className="py-16 text-center">
            <FileText className="w-10 h-10 text-slate-300 mx-auto mb-2" />
            <h3 className="text-sm font-semibold text-slate-800">No expenses found for this filter</h3>
            <p className="text-xs text-slate-500 mt-0.5">Click "Add Expense" to log operational expenses.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50/80 text-[11px] font-semibold uppercase tracking-wider text-slate-500 border-b border-slate-200">
                  <th className="py-3 px-3.5">Voucher #</th>
                  <th className="py-3 px-3">Date</th>
                  <th className="py-3 px-3">Category</th>
                  <th className="py-3 px-3">Title / Description</th>
                  <th className="py-3 px-3">Paid By (Payer)</th>
                  <th className="py-3 px-3">Received By (Payee)</th>
                  <th className="py-3 px-3">Method & Status</th>
                  <th className="py-3 px-3">Bill / Proof</th>
                  <th className="py-3 px-3.5 text-right">Amount</th>
                  <th className="py-3 px-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredExpenses.map((exp) => (
                  <tr key={exp.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-2.5 px-3.5 font-mono font-bold text-slate-700">{exp.expense_code}</td>
                    <td className="py-2.5 px-3 text-slate-600 font-mono">{formatDate(exp.expense_date)}</td>
                    <td className="py-2.5 px-3">
                      <span className="inline-flex px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-700">
                        {exp.category}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 font-semibold text-slate-900 max-w-[200px] truncate" title={exp.description}>
                      {exp.description}
                    </td>
                    <td className="py-2.5 px-3 text-slate-700">{exp.payer || 'Company'}</td>
                    <td className="py-2.5 px-3 text-slate-700">{exp.payee || exp.vendor || '—'}</td>
                    <td className="py-2.5 px-3">
                      <div className="flex items-center gap-1.5">
                        <span className="text-slate-800">{exp.payment_method}</span>
                        <span
                          className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                            exp.payment_status === 'Paid'
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : exp.payment_status === 'Partially Paid'
                              ? 'bg-amber-50 text-amber-700 border border-amber-200'
                              : 'bg-red-50 text-red-700 border border-red-200'
                          }`}
                        >
                          {exp.payment_status || 'Paid'}
                        </span>
                      </div>
                      {exp.reference_number && (
                        <div className="text-[10px] text-slate-400 font-mono">Ref: {exp.reference_number}</div>
                      )}
                    </td>
                    <td className="py-2.5 px-3">
                      {exp.attachment_data ? (
                        <button
                          onClick={() =>
                            setPreviewAttachment({
                              fileName: exp.attachment_file_name || 'Bill_Receipt',
                              mimeType: exp.attachment_mime_type || 'image/jpeg',
                              data: exp.attachment_data,
                              expenseCode: exp.expense_code,
                            })
                          }
                          className="inline-flex items-center gap-1 px-2 py-1 bg-teal-50 hover:bg-teal-100 text-teal-700 border border-teal-200 rounded text-[11px] font-medium transition-colors cursor-pointer"
                        >
                          <Paperclip className="w-3 h-3" />
                          View Bill
                        </button>
                      ) : (
                        <span className="text-slate-400 text-[11px]">—</span>
                      )}
                    </td>
                    <td className="py-2.5 px-3.5 text-right font-mono font-bold text-rose-600 tabular-nums">
                      {formatCurrency(exp.amount, symbol)}
                    </td>
                    <td className="py-2.5 px-3.5 text-right">
                      <div className="inline-flex items-center gap-1">
                        {hasPermission('expenses.edit') && (
                          <button
                            onClick={() => handleOpenEdit(exp)}
                            className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors cursor-pointer"
                            title="Edit Expense"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {hasPermission('expenses.delete') && (
                          <button
                            onClick={() => handleDeleteExpense(exp)}
                            className="p-1.5 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors cursor-pointer"
                            title="Move to Trash"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-slate-50 font-bold text-xs border-t-2 border-slate-200">
                  <td colSpan={8} className="py-3 px-3.5 text-right uppercase text-slate-600">Total Filtered Expenses</td>
                  <td className="py-3 px-3.5 text-right text-rose-700 font-mono text-sm tabular-nums">
                    {formatCurrency(totalAmount, symbol)}
                  </td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* Add / Edit Expense Modal */}
      {showFormModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-xl border border-slate-200 shadow-2xl w-full max-w-2xl overflow-hidden my-8">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  {editingExpense ? `Edit Expense Voucher (${editingExpense.expense_code})` : 'Record New Operational Expense'}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Enter expense particulars, payment details, and attach bill or receipt proof.
                </p>
              </div>
              <button
                onClick={() => setShowFormModal(false)}
                className="text-slate-400 hover:text-slate-600 text-sm font-medium cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveExpense} className="p-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Expense Date *</label>
                  <input
                    type="date"
                    required
                    value={formData.expense_date}
                    onChange={(e) => setFormData({ ...formData, expense_date: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Expense Category *</label>
                  <select
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs bg-white font-medium"
                  >
                    {categories.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Amount (PKR) *</label>
                  <input
                    type="number"
                    min="1"
                    step="0.01"
                    required
                    value={formData.amount}
                    onChange={(e) => setFormData({ ...formData, amount: Number(e.target.value) })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-mono font-bold text-rose-600"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Expense Title / Description *</label>
                <input
                  type="text"
                  required
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="e.g. LESCO Electricity Bill for Main Hub Floor 2"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-medium"
                />
              </div>

              {/* Payment Details: Payer, Payee, Method, Status */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Paid By (Payer Person / Company)
                  </label>
                  <input
                    type="text"
                    value={formData.payer}
                    onChange={(e) => setFormData({ ...formData, payer: e.target.value })}
                    placeholder="e.g. DaftarPro Management / Operations Lead"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Received By (Payee Person / Vendor)
                  </label>
                  <input
                    type="text"
                    value={formData.payee}
                    onChange={(e) => setFormData({ ...formData, payee: e.target.value, vendor: e.target.value })}
                    placeholder="e.g. LESCO / PTCL / Vendor Name"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Payment Method</label>
                  <select
                    value={formData.payment_method}
                    onChange={(e) => setFormData({ ...formData, payment_method: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs bg-white"
                  >
                    {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Payment Status</label>
                  <select
                    value={formData.payment_status}
                    onChange={(e) => setFormData({ ...formData, payment_status: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs bg-white font-semibold"
                  >
                    {PAYMENT_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Reference / TXN #</label>
                  <input
                    type="text"
                    value={formData.reference_number}
                    onChange={(e) => setFormData({ ...formData, reference_number: e.target.value })}
                    placeholder="Bill / Cheque / TXN #"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-mono"
                  />
                </div>
              </div>

              {/* Bill & Receipt Attachment */}
              <div className="border border-slate-200 rounded-lg p-3.5 bg-slate-50/60 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-800">
                    Bill / Receipt / Payment Proof Attachment (PDF, JPG, PNG)
                  </span>
                  {formData.attachment_data && (
                    <button
                      type="button"
                      onClick={() =>
                        setFormData({
                          ...formData,
                          attachment_file_name: '',
                          attachment_mime_type: '',
                          attachment_data: '',
                        })
                      }
                      className="text-xs text-red-600 hover:underline cursor-pointer"
                    >
                      Remove Attachment
                    </button>
                  )}
                </div>

                {formData.attachment_data ? (
                  <div className="flex items-center justify-between p-2.5 bg-white border border-slate-200 rounded-lg">
                    <div className="flex items-center gap-2">
                      <Paperclip className="w-4 h-4 text-teal-600" />
                      <span className="text-xs font-medium text-slate-800 truncate max-w-[280px]">
                        {formData.attachment_file_name || 'Attached Bill Proof'}
                      </span>
                    </div>
                    {formData.attachment_mime_type?.startsWith('image/') && (
                      <img
                        src={formData.attachment_data}
                        alt="Bill Thumbnail"
                        className="w-10 h-10 object-contain rounded border border-slate-200"
                      />
                    )}
                  </div>
                ) : (
                  <div>
                    <label className="flex flex-col items-center justify-center p-4 border-2 border-dashed border-slate-300 rounded-lg bg-white hover:bg-slate-50 cursor-pointer transition-colors">
                      <Paperclip className="w-5 h-5 text-slate-400 mb-1" />
                      <span className="text-xs font-medium text-slate-700">Click to upload bill or receipt</span>
                      <span className="text-[10px] text-slate-400 mt-0.5">Supports PDF, PNG, JPG (up to 8MB)</span>
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp,application/pdf"
                        onChange={handleFileUpload}
                        className="hidden"
                      />
                    </label>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Notes & Additional Details</label>
                <textarea
                  rows={2}
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="Additional context or remarks..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs"
                />
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
                  {submitting ? 'Saving...' : editingExpense ? 'Update Expense' : 'Save Expense'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Category Manager Modal */}
      {showCategoryModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-xl border border-slate-200 shadow-2xl w-full max-w-lg overflow-hidden my-8">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2">
                <Tags className="w-5 h-5 text-teal-600" />
                <h3 className="text-base font-bold text-slate-900">Custom Expense Categories</h3>
              </div>
              <button
                onClick={() => setShowCategoryModal(false)}
                className="text-slate-400 hover:text-slate-600 text-sm font-medium cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="p-6 space-y-4">
              {/* Add New Category Form */}
              <form onSubmit={handleAddCategory} className="flex gap-2">
                <input
                  type="text"
                  required
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  placeholder="New category name (e.g. Advertising, Furniture)..."
                  className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-xs font-medium"
                />
                <button
                  type="submit"
                  className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold rounded-lg shrink-0 cursor-pointer"
                >
                  Add Category
                </button>
              </form>

              {/* Categories List */}
              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <div className="px-3.5 py-2 bg-slate-100 text-xs font-bold text-slate-700">
                  Active Categories ({categories.length})
                </div>
                <div className="divide-y divide-slate-100 max-h-72 overflow-y-auto">
                  {categoryListRaw.map((cat) => (
                    <div key={cat.id} className="p-2.5 flex items-center justify-between gap-2 hover:bg-slate-50">
                      {editingCategoryObj?.id === cat.id ? (
                        <div className="flex items-center gap-2 flex-1">
                          <input
                            type="text"
                            value={editCategoryName}
                            onChange={(e) => setEditCategoryName(e.target.value)}
                            className="flex-1 px-2 py-1 border border-slate-300 rounded text-xs"
                          />
                          <button
                            onClick={() => handleUpdateCategory(cat.id)}
                            className="px-2 py-1 bg-teal-600 text-white rounded text-xs font-semibold"
                          >
                            Save
                          </button>
                          <button
                            onClick={() => setEditingCategoryObj(null)}
                            className="px-2 py-1 text-slate-500 text-xs"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <>
                          <span className="text-xs font-medium text-slate-800">{cat.name}</span>
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => {
                                setEditingCategoryObj(cat);
                                setEditCategoryName(cat.name);
                              }}
                              className="p-1 text-slate-400 hover:text-slate-700 rounded cursor-pointer"
                              title="Rename"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleDeleteCategory(cat)}
                              className="p-1 text-slate-400 hover:text-red-600 rounded cursor-pointer"
                              title="Delete"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="px-6 py-3 bg-slate-50 border-t border-slate-200 flex justify-end">
              <button
                onClick={() => setShowCategoryModal(false)}
                className="px-4 py-1.5 text-xs font-semibold bg-slate-900 text-white rounded-lg cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bill Attachment Preview Modal */}
      {previewAttachment && (
        <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl border border-slate-200 shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-900 text-white shrink-0">
              <div className="flex items-center gap-2">
                <Paperclip className="w-4 h-4 text-teal-400" />
                <span className="text-sm font-bold truncate max-w-md">
                  {previewAttachment.fileName} ({previewAttachment.expenseCode})
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => downloadAttachmentFile(previewAttachment)}
                  className="inline-flex items-center gap-1 px-3 py-1 bg-teal-600 hover:bg-teal-500 text-white rounded text-xs font-semibold cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  Download
                </button>
                <button
                  onClick={() => setPreviewAttachment(null)}
                  className="p-1 text-slate-400 hover:text-white rounded cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-auto p-4 flex items-center justify-center bg-slate-100 min-h-[300px]">
              {previewAttachment.mimeType === 'application/pdf' ? (
                <iframe
                  src={previewAttachment.data}
                  title="PDF Attachment"
                  className="w-full h-[65vh] border border-slate-300 rounded bg-white"
                />
              ) : (
                <img
                  src={previewAttachment.data}
                  alt={previewAttachment.fileName}
                  className="max-h-[70vh] max-w-full object-contain rounded shadow-xs"
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
