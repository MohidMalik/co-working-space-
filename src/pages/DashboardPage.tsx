import React, { useEffect, useState, useCallback } from 'react';
import { useApp } from '../context/AppContext';
import { apiRequest } from '../services/api';
import { formatCurrency, formatDate } from '../utils/format';
import {
  Plus,
  AlertTriangle,
  ArrowRight,
  KeyRound,
  Settings,
  Database,
  RefreshCw,
  Calendar,
  Clock,
  CheckCircle2,
  AlertCircle,
  FileText,
  DollarSign,
  TrendingUp,
  TrendingDown,
  Layers,
  ChevronRight,
  CreditCard,
  Building2,
  Users,
} from 'lucide-react';

export default function DashboardPage() {
  const { user, appSettings, setActiveTab, showToast, openPrintPreview } = useApp();
  const symbol = appSettings?.currency_symbol || 'Rs.';

  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);

  // Date Range Filter State
  const [dateRange, setDateRange] = useState<'month' | 'quarter' | 'year' | 'all' | 'custom'>('month');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');

  // Quick Payment Modal
  const [quickPayInvoice, setQuickPayInvoice] = useState<any | null>(null);
  const [quickPayForm, setQuickPayForm] = useState({
    payment_date: new Date().toISOString().slice(0, 10),
    amount: 0,
    payment_method: 'Bank Transfer',
    reference_number: '',
    notes: '',
  });
  const [savingPayment, setSavingPayment] = useState(false);

  const fetchDashboard = useCallback(async () => {
    setLoading(true);
    try {
      let url = `/dashboard?dateRange=${dateRange}`;
      if (dateRange === 'custom' && customStart && customEnd) {
        url += `&startDate=${customStart}&endDate=${customEnd}`;
      }
      const res = await apiRequest(url);
      setData(res);
    } catch (err: any) {
      showToast(err.message || 'Failed to load dashboard', 'error');
    } finally {
      setLoading(false);
    }
  }, [dateRange, customStart, customEnd, showToast]);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  const handleSeedSampleData = async () => {
    setSeeding(true);
    try {
      const res = await apiRequest('/seed-sample-data', { method: 'POST' });
      showToast(res.message, 'success');
      fetchDashboard();
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setSeeding(false);
    }
  };

  const handleOpenQuickPay = (inv: any) => {
    setQuickPayInvoice(inv);
    setQuickPayForm({
      payment_date: new Date().toISOString().slice(0, 10),
      amount: Number(inv.remaining_amount || 0),
      payment_method: 'Bank Transfer',
      reference_number: '',
      notes: `Payment for ${inv.invoice_number} recorded from Dashboard`,
    });
  };

  const handleSubmitQuickPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickPayInvoice) return;
    if (quickPayForm.amount <= 0) {
      showToast('Payment amount must be greater than zero', 'error');
      return;
    }

    try {
      setSavingPayment(true);
      await apiRequest('/payments', {
        method: 'POST',
        body: JSON.stringify({
          client_id: quickPayInvoice.client_id,
          invoice_id: quickPayInvoice.id,
          payment_date: quickPayForm.payment_date,
          amount: Number(quickPayForm.amount),
          payment_method: quickPayForm.payment_method,
          reference_number: quickPayForm.reference_number,
          notes: quickPayForm.notes,
        }),
      });
      showToast(`Payment of Rs. ${Number(quickPayForm.amount).toLocaleString()} recorded successfully`, 'success');
      setQuickPayInvoice(null);
      fetchDashboard();
    } catch (err: any) {
      showToast(err.message || 'Failed to record payment', 'error');
    } finally {
      setSavingPayment(false);
    }
  };

  if (loading && !data) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="h-24 bg-white border border-slate-200 rounded-lg p-4 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  const s = data?.stats || {};
  const upcomingPayments = data?.upcomingPaymentsAndOverdue || [];
  const chartData = data?.monthlyChart || [];
  const aging = data?.agingSummary || {};
  const maxChartVal = Math.max(
    10000,
    ...chartData.map((m: any) => Math.max(Number(m.revenue || 0), Number(m.expenses || 0)))
  );

  return (
    <div className="space-y-6">
      {/* First-Run Setup / Security Prompt Banner */}
      {(user?.must_change_password === 1 || appSettings?.first_run_completed === 0) && (
        <div className="bg-slate-900 text-white border border-slate-800 rounded-lg p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h3 className="text-sm font-semibold">First-Run System Configuration</h3>
            <p className="text-xs text-slate-300 mt-0.5">
              Welcome to DaftarPro. For security, please update your default Administrator password and review your Company Settings (Logo, Signature, Stamp, Invoice Roles, Bank IBAN).
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              onClick={() => setActiveTab('settings')}
              className="px-3.5 py-2 text-xs font-medium bg-white text-slate-900 hover:bg-slate-100 rounded-lg flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
            >
              <Settings className="w-3.5 h-3.5" />
              <span>Open Company Settings</span>
            </button>
            <button
              onClick={() => setActiveTab('users')}
              className="px-3.5 py-2 text-xs font-medium bg-slate-800 text-white hover:bg-slate-700 border border-slate-700 rounded-lg flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
            >
              <KeyRound className="w-3.5 h-3.5" />
              <span>Change Default Password</span>
            </button>
          </div>
        </div>
      )}

      {/* Helpful Empty State if 0 clients & 0 workspaces */}
      {s.totalClients === 0 && s.totalWorkspaces === 0 && (
        <div className="bg-white border border-slate-200 rounded-lg p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <h3 className="text-base font-semibold text-slate-900">Your SQLite Database is Ready</h3>
            <p className="text-xs text-slate-600 mt-1">
              No workspaces or clients have been added yet. You can start adding records manually or load a realistic Pakistani coworking space dataset with 1 click to explore all modules.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <button
              onClick={() => setActiveTab('workspaces')}
              className="px-3.5 py-2 text-xs font-medium bg-slate-900 text-white hover:bg-slate-800 rounded-lg flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Workspace</span>
            </button>
            <button
              onClick={() => setActiveTab('clients')}
              className="px-3.5 py-2 text-xs font-medium bg-slate-100 text-slate-900 hover:bg-slate-200 rounded-lg flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Client</span>
            </button>
            <button
              onClick={handleSeedSampleData}
              disabled={seeding}
              className="px-3.5 py-2 text-xs font-medium bg-emerald-600 text-white hover:bg-emerald-500 rounded-lg flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
            >
              <Database className="w-3.5 h-3.5" />
              <span>{seeding ? 'Loading Sample Data...' : 'Load Sample Coworking Data'}</span>
            </button>
          </div>
        </div>
      )}

      {/* Date Range Selector Toolbar */}
      <div className="bg-white p-3.5 rounded-xl border border-slate-200/80 shadow-xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-slate-500" />
          <span className="text-xs font-bold text-slate-900">Financial Overview Range:</span>
          <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5">
            <button
              onClick={() => setDateRange('month')}
              className={`px-3 py-1 rounded-md text-xs font-medium cursor-pointer transition-colors ${
                dateRange === 'month' ? 'bg-white text-slate-900 shadow-xs font-bold' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              This Month
            </button>
            <button
              onClick={() => setDateRange('quarter')}
              className={`px-3 py-1 rounded-md text-xs font-medium cursor-pointer transition-colors ${
                dateRange === 'quarter' ? 'bg-white text-slate-900 shadow-xs font-bold' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              This Quarter
            </button>
            <button
              onClick={() => setDateRange('year')}
              className={`px-3 py-1 rounded-md text-xs font-medium cursor-pointer transition-colors ${
                dateRange === 'year' ? 'bg-white text-slate-900 shadow-xs font-bold' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              This Year
            </button>
            <button
              onClick={() => setDateRange('all')}
              className={`px-3 py-1 rounded-md text-xs font-medium cursor-pointer transition-colors ${
                dateRange === 'all' ? 'bg-white text-slate-900 shadow-xs font-bold' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              All Time
            </button>
            <button
              onClick={() => setDateRange('custom')}
              className={`px-3 py-1 rounded-md text-xs font-medium cursor-pointer transition-colors ${
                dateRange === 'custom' ? 'bg-white text-slate-900 shadow-xs font-bold' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Custom
            </button>
          </div>
        </div>

        {dateRange === 'custom' && (
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={customStart}
              onChange={(e) => setCustomStart(e.target.value)}
              className="px-2.5 py-1 bg-slate-50 border border-slate-200 rounded-lg text-xs"
            />
            <span className="text-xs text-slate-400">to</span>
            <input
              type="date"
              value={customEnd}
              onChange={(e) => setCustomEnd(e.target.value)}
              className="px-2.5 py-1 bg-slate-50 border border-slate-200 rounded-lg text-xs"
            />
            <button
              onClick={fetchDashboard}
              className="px-3 py-1 bg-slate-900 text-white rounded-lg text-xs font-semibold cursor-pointer"
            >
              Apply
            </button>
          </div>
        )}

        <div className="flex items-center gap-2">
          <span className="text-[11px] text-slate-500 font-mono">
            {data?.period?.label || 'Current Period'}
          </span>
          <button
            onClick={fetchDashboard}
            className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
            title="Refresh Metrics"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* 11 Summary Cards Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3.5">
        {/* 1. Invoiced Income */}
        <div className="bg-white border border-slate-200/80 rounded-xl p-4 shadow-xs">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Invoiced Income</div>
          <div className="text-lg font-bold font-mono text-slate-900 mt-1 tabular-nums">
            {formatCurrency(s.totalInvoiced, symbol)}
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">Total billed across period</div>
        </div>

        {/* 2. Money Received */}
        <div className="bg-white border border-slate-200/80 rounded-xl p-4 shadow-xs">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Money Received</div>
          <div className="text-lg font-bold font-mono text-emerald-700 mt-1 tabular-nums">
            {formatCurrency(s.totalCollected, symbol)}
          </div>
          <div className="text-[11px] text-emerald-600 mt-0.5">Actual cleared collections</div>
        </div>

        {/* 3. Outstanding Receivables */}
        <div className="bg-white border border-slate-200/80 rounded-xl p-4 shadow-xs">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Outstanding Receivables</div>
          <div className="text-lg font-bold font-mono text-amber-700 mt-1 tabular-nums">
            {formatCurrency(s.outstandingReceivables, symbol)}
          </div>
          <div className="text-[11px] text-amber-600 mt-0.5">Unpaid customer invoices</div>
        </div>

        {/* 4. Total Expenses */}
        <div className="bg-white border border-slate-200/80 rounded-xl p-4 shadow-xs">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Total Expenses</div>
          <div className="text-lg font-bold font-mono text-slate-900 mt-1 tabular-nums">
            {formatCurrency(s.totalExpenses, symbol)}
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">Operational cost vouchers</div>
        </div>

        {/* 5. Unpaid Expenses */}
        <div className="bg-white border border-slate-200/80 rounded-xl p-4 shadow-xs">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Unpaid Expenses</div>
          <div className="text-lg font-bold font-mono text-rose-600 mt-1 tabular-nums">
            {formatCurrency(s.unpaidExpenses, symbol)}
          </div>
          <div className="text-[11px] text-rose-500 mt-0.5">Pending vendor bills</div>
        </div>

        {/* 6. Net Profit */}
        <div className="bg-slate-900 text-white rounded-xl p-4 shadow-xs">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-300">Net Profit (Cash)</div>
          <div
            className={`text-lg font-bold font-mono mt-1 tabular-nums ${
              Number(s.netCashProfit) >= 0 ? 'text-emerald-400' : 'text-rose-400'
            }`}
          >
            {formatCurrency(s.netCashProfit, symbol)}
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">Collections minus paid expenses</div>
        </div>

        {/* 7. Payments Due Today */}
        <div className="bg-white border border-slate-200/80 rounded-xl p-4 shadow-xs">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Payments Due Today</div>
          <div className="text-lg font-bold font-mono text-rose-600 mt-1 tabular-nums">
            {formatCurrency(s.paymentsDueTodayAmount, symbol)}
          </div>
          <div className="text-[11px] font-semibold text-rose-600 mt-0.5">
            {s.paymentsDueTodayCount || 0} invoices due today
          </div>
        </div>

        {/* 8. Overdue Payments */}
        <div className="bg-white border border-slate-200/80 rounded-xl p-4 shadow-xs">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Overdue Payments</div>
          <div className="text-lg font-bold font-mono text-rose-700 mt-1 tabular-nums">
            {formatCurrency(s.overduePaymentsAmount, symbol)}
          </div>
          <div className="text-[11px] font-semibold text-rose-700 mt-0.5">
            {s.overduePaymentsCount || 0} overdue invoices
          </div>
        </div>

        {/* 9. This Month's Income */}
        <div className="bg-white border border-slate-200/80 rounded-xl p-4 shadow-xs">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">This Month's Income</div>
          <div className="text-lg font-bold font-mono text-emerald-700 mt-1 tabular-nums">
            {formatCurrency(s.thisMonthIncome, symbol)}
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">Calendar month receipts</div>
        </div>

        {/* 10. This Month's Expenses */}
        <div className="bg-white border border-slate-200/80 rounded-xl p-4 shadow-xs">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">This Month's Expenses</div>
          <div className="text-lg font-bold font-mono text-slate-900 mt-1 tabular-nums">
            {formatCurrency(s.thisMonthExpenses, symbol)}
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">Calendar month vouchers</div>
        </div>

        {/* 11. This Month's Profit */}
        <div className="bg-white border border-slate-200/80 rounded-xl p-4 shadow-xs col-span-2 sm:col-span-1">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">This Month's Profit</div>
          <div
            className={`text-lg font-bold font-mono mt-1 tabular-nums ${
              Number(s.thisMonthProfit) >= 0 ? 'text-emerald-700' : 'text-rose-600'
            }`}
          >
            {formatCurrency(s.thisMonthProfit, symbol)}
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">Monthly income minus expense</div>
        </div>

        {/* 12. Active Clients & Workspaces */}
        <div className="bg-white border border-slate-200/80 rounded-xl p-4 shadow-xs col-span-2 sm:col-span-1">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Occupancy & Clients</div>
          <div className="text-lg font-bold font-mono text-slate-900 mt-1 tabular-nums">
            {s.occupiedWorkspaces || 0} / {s.totalWorkspaces || 0}
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">{s.activeClients || 0} active clients</div>
        </div>
      </div>

      {/* DEDICATED SECTION 4: Upcoming Payments & Overdue Invoices */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-rose-600" />
              <h3 className="text-sm font-bold text-slate-900">
                Upcoming Payments & Overdue Invoices
              </h3>
              <span className="px-2 py-0.5 bg-rose-50 text-rose-700 font-mono text-[11px] font-bold rounded-full border border-rose-200">
                {upcomingPayments.length} Active Dues
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Ranked by urgency: Overdue invoices on top, followed by dues within 3 days, 7 days, and future dates.
            </p>
          </div>

          <button
            onClick={() => setActiveTab('invoices')}
            className="inline-flex items-center gap-1 text-xs font-semibold text-teal-700 hover:text-teal-800 cursor-pointer"
          >
            <span>View All Invoices</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {upcomingPayments.length === 0 ? (
          <div className="py-12 text-center text-xs text-slate-400">
            <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-1.5 opacity-80" />
            <div className="font-semibold text-slate-800">All customer accounts are settled</div>
            <div className="text-[11px] text-slate-500 mt-0.5">No upcoming dues or overdue invoices found.</div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 text-[11px] font-semibold uppercase tracking-wider text-slate-500 border-b border-slate-200">
                  <th className="py-2.5 px-3.5">Urgency & Status</th>
                  <th className="py-2.5 px-3">Invoice #</th>
                  <th className="py-2.5 px-3">Client Name</th>
                  <th className="py-2.5 px-3">Issue Date</th>
                  <th className="py-2.5 px-3">Due Date</th>
                  <th className="py-2.5 px-3">Expected Date</th>
                  <th className="py-2.5 px-3 text-right">Invoice Total</th>
                  <th className="py-2.5 px-3 text-right">Paid</th>
                  <th className="py-2.5 px-3 text-right">Balance Due</th>
                  <th className="py-2.5 px-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {upcomingPayments.map((inv: any) => {
                  const badgeColor =
                    inv.urgency_rank === 1
                      ? 'bg-red-50 text-red-700 border-red-200'
                      : inv.urgency_rank === 2
                      ? 'bg-rose-50 text-rose-700 border-rose-200'
                      : inv.urgency_rank === 3
                      ? 'bg-orange-50 text-orange-700 border-orange-200'
                      : inv.urgency_rank === 4
                      ? 'bg-amber-50 text-amber-700 border-amber-200'
                      : inv.urgency_rank === 9
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      : 'bg-slate-100 text-slate-700 border-slate-200';

                  return (
                    <tr key={inv.id} className="hover:bg-slate-50/80 transition-colors">
                      {/* Urgency Badge */}
                      <td className="py-2.5 px-3.5">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold border ${badgeColor}`}>
                          {inv.urgency_rank <= 2 && <AlertTriangle className="w-3 h-3 shrink-0" />}
                          {inv.urgency_label}
                        </span>
                      </td>

                      {/* Invoice # */}
                      <td className="py-2.5 px-3 font-mono font-bold text-slate-800">
                        {inv.invoice_number}
                      </td>

                      {/* Client */}
                      <td className="py-2.5 px-3">
                        <div className="font-semibold text-slate-900">{inv.client_name_snapshot}</div>
                        {inv.client_company_snapshot && (
                          <div className="text-[10px] text-slate-500">{inv.client_company_snapshot}</div>
                        )}
                      </td>

                      {/* Issue Date */}
                      <td className="py-2.5 px-3 font-mono text-slate-600">
                        {formatDate(inv.invoice_date)}
                      </td>

                      {/* Due Date */}
                      <td className="py-2.5 px-3 font-mono font-medium text-slate-800">
                        {inv.due_date ? formatDate(inv.due_date) : <span className="text-amber-600">Not set</span>}
                      </td>

                      {/* Expected Date */}
                      <td className="py-2.5 px-3 font-mono text-slate-600">
                        {inv.expected_payment_date ? formatDate(inv.expected_payment_date) : '—'}
                      </td>

                      {/* Total */}
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-700">
                        {formatCurrency(inv.total, symbol)}
                      </td>

                      {/* Paid */}
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums text-emerald-700">
                        {formatCurrency(inv.paid_amount, symbol)}
                      </td>

                      {/* Remaining Balance */}
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-rose-600 tabular-nums">
                        {formatCurrency(inv.remaining_amount, symbol)}
                      </td>

                      {/* Action Buttons */}
                      <td className="py-2.5 px-3.5 text-right">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            onClick={() =>
                              openPrintPreview({
                                type: 'invoice',
                                title: `Invoice ${inv.invoice_number}`,
                                data: inv,
                              })
                            }
                            className="px-2 py-1 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded text-[11px] font-medium cursor-pointer"
                            title="Open A4 Invoice Preview"
                          >
                            Open Invoice
                          </button>
                          <button
                            onClick={() => handleOpenQuickPay(inv)}
                            className="px-2.5 py-1 bg-teal-600 hover:bg-teal-700 text-white rounded text-[11px] font-semibold cursor-pointer whitespace-nowrap"
                            title="Record Customer Payment"
                          >
                            Record Payment
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Analytics Charts & Receivables Aging */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Monthly Income vs Expenses Bar Chart */}
        <div className="bg-white border border-slate-200/80 rounded-xl p-5 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Monthly Revenue vs Expenses</h3>
              <p className="text-xs text-slate-500">Comparing actual receipts vs operational expenses</p>
            </div>
            <div className="flex items-center gap-3 text-xs">
              <div className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-xs bg-emerald-600" />
                <span className="text-slate-600 font-medium">Income</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-xs bg-slate-900" />
                <span className="text-slate-600 font-medium">Expenses</span>
              </div>
            </div>
          </div>

          <div className="space-y-3 pt-2">
            {chartData.map((m: any, idx: number) => {
              const revPercent = Math.min(100, Math.round((Number(m.revenue || 0) / maxChartVal) * 100));
              const expPercent = Math.min(100, Math.round((Number(m.expenses || 0) / maxChartVal) * 100));
              return (
                <div key={idx} className="space-y-1">
                  <div className="flex justify-between text-xs font-mono">
                    <span className="font-semibold text-slate-800">{m.label}</span>
                    <span className="text-slate-500">
                      In: <strong className="text-emerald-700">{formatCurrency(m.revenue, symbol)}</strong> · Out: <strong className="text-slate-900">{formatCurrency(m.expenses, symbol)}</strong>
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="h-3.5 bg-slate-100 rounded overflow-hidden">
                      <div className="h-full bg-emerald-600 rounded" style={{ width: `${revPercent}%` }} />
                    </div>
                    <div className="h-3.5 bg-slate-100 rounded overflow-hidden">
                      <div className="h-full bg-slate-900 rounded" style={{ width: `${expPercent}%` }} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Receivables Aging Timeline */}
        <div className="bg-white border border-slate-200/80 rounded-xl p-5 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Receivables Aging Analysis</h3>
                <p className="text-xs text-slate-500">Customer payments categorized by aging days</p>
              </div>
              <span className="text-xs font-mono font-bold text-rose-600">
                Total Due: {formatCurrency(s.outstandingReceivables, symbol)}
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
              <div className="p-3 border border-slate-200 rounded-lg bg-slate-50 text-center">
                <div className="text-[10px] font-bold uppercase text-slate-500">Current (0–30 Days)</div>
                <div className="text-sm font-bold font-mono text-emerald-700 mt-1 tabular-nums">
                  {formatCurrency(aging.current_0_30, symbol)}
                </div>
              </div>
              <div className="p-3 border border-slate-200 rounded-lg bg-slate-50 text-center">
                <div className="text-[10px] font-bold uppercase text-slate-500">31–60 Days</div>
                <div className="text-sm font-bold font-mono text-amber-700 mt-1 tabular-nums">
                  {formatCurrency(aging.days_31_60, symbol)}
                </div>
              </div>
              <div className="p-3 border border-slate-200 rounded-lg bg-slate-50 text-center">
                <div className="text-[10px] font-bold uppercase text-slate-500">61–90 Days</div>
                <div className="text-sm font-bold font-mono text-orange-700 mt-1 tabular-nums">
                  {formatCurrency(aging.days_61_90, symbol)}
                </div>
              </div>
              <div className="p-3 border border-slate-200 rounded-lg bg-slate-50 text-center">
                <div className="text-[10px] font-bold uppercase text-slate-500">90+ Days (Overdue)</div>
                <div className="text-sm font-bold font-mono text-rose-700 mt-1 tabular-nums">
                  {formatCurrency(aging.over_90, symbol)}
                </div>
              </div>
            </div>
          </div>

          <div className="pt-6 border-t border-slate-200 mt-6 flex flex-wrap items-center justify-between gap-3">
            <span className="text-xs text-slate-500">
              Need detailed breakdown of each client's aging balance?
            </span>
            <button
              onClick={() => setActiveTab('reports')}
              className="px-3.5 py-1.5 bg-slate-900 text-white rounded-lg text-xs font-semibold hover:bg-slate-800 transition-colors cursor-pointer"
            >
              Open Financial Reports
            </button>
          </div>
        </div>
      </div>

      {/* Quick Record Payment Modal */}
      {quickPayInvoice && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl border border-slate-200 shadow-2xl w-full max-w-md overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Record Customer Payment ({quickPayInvoice.invoice_number})
                </h3>
                <p className="text-xs text-slate-500">{quickPayInvoice.client_name_snapshot}</p>
              </div>
              <button
                onClick={() => setQuickPayInvoice(null)}
                className="text-slate-400 hover:text-slate-600 text-sm font-medium cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmitQuickPayment} className="p-5 space-y-3.5">
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs flex justify-between">
                <span className="text-slate-600">Invoice Total: <strong className="text-slate-900 font-mono">{formatCurrency(quickPayInvoice.total, symbol)}</strong></span>
                <span className="text-slate-600">Remaining Due: <strong className="text-rose-600 font-mono">{formatCurrency(quickPayInvoice.remaining_amount, symbol)}</strong></span>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Payment Date *</label>
                <input
                  type="date"
                  required
                  value={quickPayForm.payment_date}
                  onChange={(e) => setQuickPayForm({ ...quickPayForm, payment_date: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Amount to Receive (PKR) *</label>
                <input
                  type="number"
                  min="1"
                  step="0.01"
                  required
                  value={quickPayForm.amount}
                  onChange={(e) => setQuickPayForm({ ...quickPayForm, amount: Number(e.target.value) })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono font-bold text-emerald-700"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Payment Method</label>
                  <select
                    value={quickPayForm.payment_method}
                    onChange={(e) => setQuickPayForm({ ...quickPayForm, payment_method: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs bg-white"
                  >
                    <option value="Bank Transfer">Bank Transfer</option>
                    <option value="Cash">Cash</option>
                    <option value="Easypaisa">Easypaisa</option>
                    <option value="JazzCash">JazzCash</option>
                    <option value="Cheque">Cheque</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Reference / TXN #</label>
                  <input
                    type="text"
                    value={quickPayForm.reference_number}
                    onChange={(e) => setQuickPayForm({ ...quickPayForm, reference_number: e.target.value })}
                    placeholder="TXN ID"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Notes / Remarks</label>
                <input
                  type="text"
                  value={quickPayForm.notes}
                  onChange={(e) => setQuickPayForm({ ...quickPayForm, notes: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setQuickPayInvoice(null)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingPayment}
                  className="px-4 py-2 text-xs font-semibold bg-teal-600 hover:bg-teal-700 text-white rounded-lg shadow-xs cursor-pointer"
                >
                  {savingPayment ? 'Saving...' : 'Confirm Payment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
