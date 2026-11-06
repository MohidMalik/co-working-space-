import React, { useState, useEffect, useCallback } from 'react';
import { useApp } from '../context/AppContext';
import { apiRequest } from '../services/api';
import { formatCurrency, formatDate, exportToExcel } from '../utils/format';
import {
  Printer,
  Download,
  Search,
  Calendar,
  FileSpreadsheet,
  TrendingUp,
  TrendingDown,
  DollarSign,
  AlertTriangle,
  Paperclip,
  ArrowUpRight,
  ArrowDownRight,
  Filter,
} from 'lucide-react';

type FinancialTab =
  | 'expense-report'
  | 'income-report'
  | 'pl-report'
  | 'outstanding-report'
  | 'monthly-summary';

export default function ReportsPage() {
  const { hasPermission, showToast, openPrintPreview, appSettings } = useApp();
  const symbol = appSettings?.currency_symbol || 'Rs.';

  const [activeTab, setActiveTab] = useState<FinancialTab>('pl-report');
  const [dateRange, setDateRange] = useState<'month' | 'quarter' | 'year' | 'all' | 'custom'>('month');
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7)); // YYYY-MM
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);

  const loadFinancialData = useCallback(async () => {
    try {
      setLoading(true);
      let url = `/reports/financial?dateRange=${dateRange}`;
      if (dateRange === 'month' && month) {
        const [y, m] = month.split('-');
        url += `&year=${y}&month=${Number(m)}`;
      } else if (dateRange === 'year' && year) {
        url += `&year=${year}`;
      } else if (dateRange === 'custom' && startDate && endDate) {
        url += `&startDate=${startDate}&endDate=${endDate}`;
      }
      const res = await apiRequest<any>(url);
      setData(res);
    } catch (err: any) {
      showToast(err.message || 'Failed to load financial reports', 'error');
    } finally {
      setLoading(false);
    }
  }, [dateRange, month, year, startDate, endDate, showToast]);

  useEffect(() => {
    loadFinancialData();
  }, [loadFinancialData]);

  if (loading && !data) {
    return (
      <div className="py-24 text-center text-xs text-slate-400">
        Generating financial statements and spreadsheets from SQLite database...
      </div>
    );
  }

  const {
    period = {},
    expenseReport = { expenses: [], totalExpensesIncurred: 0, totalExpensesPaid: 0, totalExpensesUnpaid: 0 },
    incomeReport = { invoices: [], payments: [], totalInvoicedIncome: 0, totalInvoicedCollected: 0, totalInvoicedOutstanding: 0, totalMoneyActuallyReceived: 0 },
    profitLossReport = {
      totalInvoicedIncome: 0,
      totalMoneyActuallyReceived: 0,
      totalOutstandingCustomerPayments: 0,
      totalExpensesIncurred: 0,
      totalExpensesPaid: 0,
      totalExpensesUnpaid: 0,
      netProfitCash: 0,
      netProfitAccrual: 0,
      comparison: {},
    },
    customerOutstandingReport = { invoices: [], totalOutstanding: 0, overdueCount: 0 },
    monthlySummaryReport = [],
  } = data || {};

  // Print Handlers
  const handlePrintCurrentReport = () => {
    const periodLabel = period?.label || 'All Time';
    if (activeTab === 'expense-report') {
      openPrintPreview({
        type: 'expense-sheet',
        title: `Expense Report — ${periodLabel}`,
        data: {
          period,
          expenses: expenseReport.expenses,
          summary: { totalExpenses: expenseReport.totalExpensesIncurred },
        },
      });
    } else if (activeTab === 'income-report') {
      openPrintPreview({
        type: 'generic-table',
        title: `Coworking Space Income Report — ${periodLabel}`,
        data: {
          subtitle: `Total Billed: ${formatCurrency(incomeReport.totalInvoicedIncome, symbol)} · Received: ${formatCurrency(incomeReport.totalMoneyActuallyReceived, symbol)} · Balance: ${formatCurrency(incomeReport.totalInvoicedOutstanding, symbol)}`,
          headers: ['Invoice #', 'Client Name', 'Date', 'Due Date', 'Total Billed', 'Amount Received', 'Balance Due', 'Status'],
          rows: incomeReport.invoices.map((i: any) => [
            i.invoice_number,
            i.client_name_snapshot,
            formatDate(i.invoice_date),
            formatDate(i.due_date),
            formatCurrency(i.total, symbol),
            formatCurrency(i.paid_amount, symbol),
            formatCurrency(i.remaining_amount, symbol),
            i.status,
          ]),
        },
      });
    } else if (activeTab === 'pl-report') {
      openPrintPreview({
        type: 'business-report',
        title: `Profit & Loss Statement — ${periodLabel}`,
        data: {
          period,
          summary: {
            totalBilled: profitLossReport.totalInvoicedIncome,
            totalCollected: profitLossReport.totalMoneyActuallyReceived,
            totalExpenses: profitLossReport.totalExpensesIncurred,
            outstandingAmount: profitLossReport.totalOutstandingCustomerPayments,
            netIncome: profitLossReport.netProfitCash,
          },
          invoices: incomeReport.invoices,
          expenses: expenseReport.expenses,
        },
      });
    } else if (activeTab === 'outstanding-report') {
      openPrintPreview({
        type: 'generic-table',
        title: `Customer Outstanding Payments Report — ${periodLabel}`,
        data: {
          subtitle: `Total Outstanding Receivables: ${formatCurrency(customerOutstandingReport.totalOutstanding, symbol)} across ${customerOutstandingReport.invoices.length} invoices`,
          headers: ['Invoice #', 'Client Name', 'Issue Date', 'Due Date', 'Invoice Total', 'Amount Paid', 'Outstanding Balance', 'Overdue Days'],
          rows: customerOutstandingReport.invoices.map((i: any) => [
            i.invoice_number,
            i.client_name_snapshot,
            formatDate(i.invoice_date),
            formatDate(i.due_date),
            formatCurrency(i.total, symbol),
            formatCurrency(i.paid_amount, symbol),
            formatCurrency(i.remaining_amount, symbol),
            i.overdue_days > 0 ? `${i.overdue_days} Days Overdue` : `Due in ${i.days_remaining} Days`,
          ]),
        },
      });
    } else if (activeTab === 'monthly-summary') {
      openPrintPreview({
        type: 'generic-table',
        title: `Monthly Financial Summary (12 Months Trend)`,
        data: {
          subtitle: `Generated from SQLite records on ${new Date().toLocaleDateString()}`,
          headers: ['Month', 'Invoiced Income', 'Money Collected', 'Total Expenses', 'Unpaid Expenses', 'Net Cash Profit', 'Collection Rate'],
          rows: monthlySummaryReport.map((m: any) => [
            m.label,
            formatCurrency(m.invoicedIncome, symbol),
            formatCurrency(m.collectedRevenue, symbol),
            formatCurrency(m.totalExpenses, symbol),
            formatCurrency(m.unpaidExpenses, symbol),
            formatCurrency(m.netCashProfit, symbol),
            `${m.collectionRate}%`,
          ]),
        },
      });
    }
  };

  // Excel Export Handlers
  const handleExportCurrentReport = () => {
    if (!hasPermission('reports.export')) {
      showToast('You do not have permission to export financial reports', 'error');
      return;
    }
    const label = (period?.label || 'Report').replace(/[^a-zA-Z0-9]/g, '_');

    if (activeTab === 'expense-report') {
      exportToExcel(
        expenseReport.expenses.map((e: any) => ({
          'Voucher #': e.expense_code,
          'Date': e.expense_date,
          'Category': e.category,
          'Description': e.description,
          'Paid By (Payer)': e.payer || 'Company',
          'Received By (Payee)': e.payee || e.vendor || '—',
          'Payment Method': e.payment_method,
          'Payment Status': e.payment_status || 'Paid',
          'Amount (PKR)': e.amount,
          'Has Attachment': e.attachment_data ? 'Yes' : 'No',
        })),
        `Expense_Report_${label}`
      );
    } else if (activeTab === 'income-report') {
      exportToExcel(
        incomeReport.invoices.map((i: any) => ({
          'Invoice #': i.invoice_number,
          'Client Name': i.client_name_snapshot,
          'Company': i.client_company_snapshot || '—',
          'Invoice Date': i.invoice_date,
          'Due Date': i.due_date,
          'Billing Period': i.billing_period,
          'Invoice Amount (PKR)': i.total,
          'Amount Received (PKR)': i.paid_amount,
          'Outstanding Balance (PKR)': i.remaining_amount,
          'Status': i.status,
        })),
        `Income_Report_${label}`
      );
    } else if (activeTab === 'pl-report') {
      exportToExcel(
        [
          { Metric: 'Total Invoiced Income (Billed)', 'Amount (PKR)': profitLossReport.totalInvoicedIncome },
          { Metric: 'Total Money Actually Received (Cash)', 'Amount (PKR)': profitLossReport.totalMoneyActuallyReceived },
          { Metric: 'Total Outstanding Customer Payments', 'Amount (PKR)': profitLossReport.totalOutstandingCustomerPayments },
          { Metric: 'Total Expenses Incurred (Vouchers)', 'Amount (PKR)': profitLossReport.totalExpensesIncurred },
          { Metric: 'Total Expenses Paid Out', 'Amount (PKR)': profitLossReport.totalExpensesPaid },
          { Metric: 'Total Expenses Unpaid (Pending Bills)', 'Amount (PKR)': profitLossReport.totalExpensesUnpaid },
          { Metric: 'Net Profit (Cash Basis: Received - Paid Expenses)', 'Amount (PKR)': profitLossReport.netProfitCash },
          { Metric: 'Net Profit (Accrual Basis: Invoiced - Incurred Expenses)', 'Amount (PKR)': profitLossReport.netProfitAccrual },
        ],
        `Profit_and_Loss_${label}`
      );
    } else if (activeTab === 'outstanding-report') {
      exportToExcel(
        customerOutstandingReport.invoices.map((i: any) => ({
          'Invoice #': i.invoice_number,
          'Client Name': i.client_name_snapshot,
          'Company': i.client_company_snapshot || '—',
          'Phone': i.client_phone_snapshot || '—',
          'Invoice Date': i.invoice_date,
          'Due Date': i.due_date,
          'Total Amount (PKR)': i.total,
          'Paid Amount (PKR)': i.paid_amount,
          'Outstanding Balance (PKR)': i.remaining_amount,
          'Overdue Days': i.overdue_days || 0,
          'Status': i.overdue_days > 0 ? 'Overdue' : 'Due Soon',
        })),
        `Customer_Outstanding_${label}`
      );
    } else if (activeTab === 'monthly-summary') {
      exportToExcel(
        monthlySummaryReport.map((m: any) => ({
          'Month': m.label,
          'Invoiced Income (PKR)': m.invoicedIncome,
          'Collected Revenue (PKR)': m.collectedRevenue,
          'Total Expenses (PKR)': m.totalExpenses,
          'Unpaid Expenses (PKR)': m.unpaidExpenses,
          'Net Cash Profit (PKR)': m.netCashProfit,
          'Net Accrual Profit (PKR)': m.netAccrualProfit,
          'Collection Rate (%)': `${m.collectionRate}%`,
        })),
        `Monthly_Financial_Summary`
      );
    }
  };

  // Filter items by search text
  const q = search.toLowerCase();

  const filteredExpenses = expenseReport.expenses.filter((e: any) => {
    if (!q) return true;
    return (
      (e.expense_code || '').toLowerCase().includes(q) ||
      (e.description || '').toLowerCase().includes(q) ||
      (e.category || '').toLowerCase().includes(q) ||
      (e.payer || '').toLowerCase().includes(q) ||
      (e.payee || '').toLowerCase().includes(q)
    );
  });

  const filteredIncomeInvoices = incomeReport.invoices.filter((i: any) => {
    if (!q) return true;
    return (
      (i.invoice_number || '').toLowerCase().includes(q) ||
      (i.client_name_snapshot || '').toLowerCase().includes(q) ||
      (i.billing_period || '').toLowerCase().includes(q)
    );
  });

  const filteredOutstanding = customerOutstandingReport.invoices.filter((i: any) => {
    if (!q) return true;
    return (
      (i.invoice_number || '').toLowerCase().includes(q) ||
      (i.client_name_snapshot || '').toLowerCase().includes(q) ||
      (i.client_phone_snapshot || '').toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-5">
      {/* Tab Navigation */}
      <div className="bg-white p-2.5 rounded-xl border border-slate-200/80 shadow-xs flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            onClick={() => setActiveTab('pl-report')}
            className={`px-3.5 py-2 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${
              activeTab === 'pl-report'
                ? 'bg-slate-900 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            Profit & Loss Report (P&L)
          </button>
          <button
            onClick={() => setActiveTab('expense-report')}
            className={`px-3.5 py-2 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${
              activeTab === 'expense-report'
                ? 'bg-slate-900 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            Expense Report
          </button>
          <button
            onClick={() => setActiveTab('income-report')}
            className={`px-3.5 py-2 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${
              activeTab === 'income-report'
                ? 'bg-slate-900 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            Coworking Space Income Report
          </button>
          <button
            onClick={() => setActiveTab('outstanding-report')}
            className={`px-3.5 py-2 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${
              activeTab === 'outstanding-report'
                ? 'bg-slate-900 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            Customer Outstanding Payments
          </button>
          <button
            onClick={() => setActiveTab('monthly-summary')}
            className={`px-3.5 py-2 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${
              activeTab === 'monthly-summary'
                ? 'bg-slate-900 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            Monthly Financial Summary
          </button>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={handlePrintCurrentReport}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer"
          >
            <Printer className="w-3.5 h-3.5" />
            Print Report
          </button>
          <button
            onClick={handleExportCurrentReport}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-medium rounded-lg transition-colors cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            Export to Excel
          </button>
        </div>
      </div>

      {/* Date Range & Search Filter Bar */}
      <div className="bg-white p-3.5 rounded-xl border border-slate-200/80 shadow-xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
            <Filter className="w-3.5 h-3.5 text-slate-500" />
            Period:
          </div>

          <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5">
            <button
              onClick={() => setDateRange('month')}
              className={`px-2.5 py-1 rounded text-xs font-medium cursor-pointer ${
                dateRange === 'month' ? 'bg-white text-slate-900 font-bold shadow-xs' : 'text-slate-600'
              }`}
            >
              Monthly
            </button>
            <button
              onClick={() => setDateRange('quarter')}
              className={`px-2.5 py-1 rounded text-xs font-medium cursor-pointer ${
                dateRange === 'quarter' ? 'bg-white text-slate-900 font-bold shadow-xs' : 'text-slate-600'
              }`}
            >
              Quarterly
            </button>
            <button
              onClick={() => setDateRange('year')}
              className={`px-2.5 py-1 rounded text-xs font-medium cursor-pointer ${
                dateRange === 'year' ? 'bg-white text-slate-900 font-bold shadow-xs' : 'text-slate-600'
              }`}
            >
              Yearly
            </button>
            <button
              onClick={() => setDateRange('all')}
              className={`px-2.5 py-1 rounded text-xs font-medium cursor-pointer ${
                dateRange === 'all' ? 'bg-white text-slate-900 font-bold shadow-xs' : 'text-slate-600'
              }`}
            >
              All Time
            </button>
            <button
              onClick={() => setDateRange('custom')}
              className={`px-2.5 py-1 rounded text-xs font-medium cursor-pointer ${
                dateRange === 'custom' ? 'bg-white text-slate-900 font-bold shadow-xs' : 'text-slate-600'
              }`}
            >
              Custom Range
            </button>
          </div>

          {dateRange === 'month' && (
            <input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="px-2.5 py-1 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-700"
            />
          )}

          {dateRange === 'year' && (
            <input
              type="number"
              min="2020"
              max="2035"
              value={year}
              onChange={(e) => setYear(e.target.value)}
              className="w-24 px-2.5 py-1 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono font-bold text-slate-700"
            />
          )}

          {dateRange === 'custom' && (
            <div className="flex items-center gap-1.5">
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="px-2.5 py-1 bg-slate-50 border border-slate-200 rounded-lg text-xs"
              />
              <span className="text-xs text-slate-400">to</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="px-2.5 py-1 bg-slate-50 border border-slate-200 rounded-lg text-xs"
              />
            </div>
          )}
        </div>

        {/* Search */}
        <div className="relative min-w-[200px]">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search within report..."
            className="w-full pl-8 pr-3 py-1 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:bg-white"
          />
        </div>
      </div>

      {/* --------------------------------------------------------------------- */}
      {/* TAB A: EXPENSE REPORT */}
      {/* --------------------------------------------------------------------- */}
      {activeTab === 'expense-report' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white border border-slate-200/80 rounded-xl p-4 shadow-xs">
              <div className="text-xs font-medium text-slate-500">Total Expenses Incurred</div>
              <div className="text-lg font-bold font-mono text-slate-900 mt-1 tabular-nums">
                {formatCurrency(expenseReport.totalExpensesIncurred, symbol)}
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">{expenseReport.expenses.length} expense vouchers</div>
            </div>

            <div className="bg-white border border-slate-200/80 rounded-xl p-4 shadow-xs">
              <div className="text-xs font-medium text-slate-500">Expenses Actually Paid</div>
              <div className="text-lg font-bold font-mono text-emerald-700 mt-1 tabular-nums">
                {formatCurrency(expenseReport.totalExpensesPaid, symbol)}
              </div>
              <div className="text-[11px] text-emerald-600 mt-0.5">Cleared cash / bank payments</div>
            </div>

            <div className="bg-white border border-slate-200/80 rounded-xl p-4 shadow-xs">
              <div className="text-xs font-medium text-slate-500">Unpaid Operational Bills</div>
              <div className="text-lg font-bold font-mono text-rose-600 mt-1 tabular-nums">
                {formatCurrency(expenseReport.totalExpensesUnpaid, symbol)}
              </div>
              <div className="text-[11px] text-rose-500 mt-0.5">Pending vendor liabilities</div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 text-[11px] font-semibold uppercase tracking-wider text-slate-500 border-b border-slate-200">
                    <th className="py-2.5 px-3.5">Voucher #</th>
                    <th className="py-2.5 px-3">Date</th>
                    <th className="py-2.5 px-3">Category</th>
                    <th className="py-2.5 px-3">Description</th>
                    <th className="py-2.5 px-3">Paid By (Payer)</th>
                    <th className="py-2.5 px-3">Received By (Payee)</th>
                    <th className="py-2.5 px-3">Status</th>
                    <th className="py-2.5 px-3">Proof</th>
                    <th className="py-2.5 px-3.5 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredExpenses.map((e: any) => (
                    <tr key={e.id} className="hover:bg-slate-50/80">
                      <td className="py-2.5 px-3.5 font-mono font-bold text-slate-800">{e.expense_code}</td>
                      <td className="py-2.5 px-3 font-mono text-slate-600">{formatDate(e.expense_date)}</td>
                      <td className="py-2.5 px-3">
                        <span className="inline-flex px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-700">
                          {e.category}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 font-medium text-slate-900">{e.description}</td>
                      <td className="py-2.5 px-3 text-slate-600">{e.payer || 'Company'}</td>
                      <td className="py-2.5 px-3 text-slate-600">{e.payee || e.vendor || '—'}</td>
                      <td className="py-2.5 px-3">
                        <span
                          className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                            e.payment_status === 'Paid'
                              ? 'bg-emerald-50 text-emerald-700'
                              : 'bg-rose-50 text-rose-700'
                          }`}
                        >
                          {e.payment_status || 'Paid'}
                        </span>
                      </td>
                      <td className="py-2.5 px-3">
                        {e.attachment_data ? (
                          <span className="inline-flex items-center gap-1 text-[11px] text-teal-700 font-medium">
                            <Paperclip className="w-3 h-3" /> Attached
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3.5 text-right font-mono font-bold text-rose-600 tabular-nums">
                        {formatCurrency(e.amount, symbol)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-50 font-bold border-t border-slate-200">
                    <td colSpan={8} className="py-3 px-3.5 text-right uppercase text-slate-600">Total Filtered Expenses</td>
                    <td className="py-3 px-3.5 text-right font-mono text-sm text-rose-700 tabular-nums">
                      {formatCurrency(
                        filteredExpenses.reduce((sum: number, e: any) => sum + Number(e.amount || 0), 0),
                        symbol
                      )}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* --------------------------------------------------------------------- */}
      {/* TAB B: COWORKING SPACE INCOME REPORT */}
      {/* --------------------------------------------------------------------- */}
      {activeTab === 'income-report' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white border border-slate-200/80 rounded-xl p-4 shadow-xs">
              <div className="text-xs font-medium text-slate-500">Total Invoiced Income (Billed)</div>
              <div className="text-lg font-bold font-mono text-slate-900 mt-1 tabular-nums">
                {formatCurrency(incomeReport.totalInvoicedIncome, symbol)}
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">{incomeReport.invoices.length} invoices issued</div>
            </div>

            <div className="bg-white border border-slate-200/80 rounded-xl p-4 shadow-xs">
              <div className="text-xs font-medium text-slate-500">Total Money Actually Received</div>
              <div className="text-lg font-bold font-mono text-emerald-700 mt-1 tabular-nums">
                {formatCurrency(incomeReport.totalMoneyActuallyReceived, symbol)}
              </div>
              <div className="text-[11px] text-emerald-600 mt-0.5">Cleared customer payments</div>
            </div>

            <div className="bg-white border border-slate-200/80 rounded-xl p-4 shadow-xs">
              <div className="text-xs font-medium text-slate-500">Outstanding Customer Balance</div>
              <div className="text-lg font-bold font-mono text-amber-700 mt-1 tabular-nums">
                {formatCurrency(incomeReport.totalInvoicedOutstanding, symbol)}
              </div>
              <div className="text-[11px] text-amber-600 mt-0.5">Unpaid invoice balances</div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 text-[11px] font-semibold uppercase tracking-wider text-slate-500 border-b border-slate-200">
                    <th className="py-2.5 px-3.5">Invoice #</th>
                    <th className="py-2.5 px-3">Customer / Client</th>
                    <th className="py-2.5 px-3">Service / Period</th>
                    <th className="py-2.5 px-3">Invoice Date</th>
                    <th className="py-2.5 px-3">Due Date</th>
                    <th className="py-2.5 px-3 text-right">Invoice Total</th>
                    <th className="py-2.5 px-3 text-right">Amount Received</th>
                    <th className="py-2.5 px-3 text-right">Balance Due</th>
                    <th className="py-2.5 px-3.5">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredIncomeInvoices.map((inv: any) => (
                    <tr key={inv.id} className="hover:bg-slate-50/80">
                      <td className="py-2.5 px-3.5 font-mono font-bold text-slate-800">{inv.invoice_number}</td>
                      <td className="py-2.5 px-3">
                        <div className="font-semibold text-slate-900">{inv.client_name_snapshot}</div>
                        {inv.client_company_snapshot && (
                          <div className="text-[10px] text-slate-500">{inv.client_company_snapshot}</div>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-slate-600">{inv.billing_period}</td>
                      <td className="py-2.5 px-3 font-mono text-slate-600">{formatDate(inv.invoice_date)}</td>
                      <td className="py-2.5 px-3 font-mono text-slate-600">{formatDate(inv.due_date)}</td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-900">
                        {formatCurrency(inv.total, symbol)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums text-emerald-700 font-semibold">
                        {formatCurrency(inv.paid_amount, symbol)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums text-rose-600 font-bold">
                        {formatCurrency(inv.remaining_amount, symbol)}
                      </td>
                      <td className="py-2.5 px-3.5">
                        <span
                          className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                            inv.status === 'Paid'
                              ? 'bg-emerald-50 text-emerald-700'
                              : inv.status === 'Overdue'
                              ? 'bg-red-50 text-red-700'
                              : 'bg-amber-50 text-amber-700'
                          }`}
                        >
                          {inv.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-50 font-bold border-t border-slate-200">
                    <td colSpan={5} className="py-3 px-3.5 text-right uppercase text-slate-600">Total Filtered Income</td>
                    <td className="py-3 px-3 text-right font-mono tabular-nums text-slate-900">
                      {formatCurrency(
                        filteredIncomeInvoices.reduce((sum: number, i: any) => sum + Number(i.total || 0), 0),
                        symbol
                      )}
                    </td>
                    <td className="py-3 px-3 text-right font-mono tabular-nums text-emerald-700">
                      {formatCurrency(
                        filteredIncomeInvoices.reduce((sum: number, i: any) => sum + Number(i.paid_amount || 0), 0),
                        symbol
                      )}
                    </td>
                    <td className="py-3 px-3 text-right font-mono tabular-nums text-rose-700">
                      {formatCurrency(
                        filteredIncomeInvoices.reduce((sum: number, i: any) => sum + Number(i.remaining_amount || 0), 0),
                        symbol
                      )}
                    </td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* --------------------------------------------------------------------- */}
      {/* TAB C: PROFIT AND LOSS REPORT */}
      {/* --------------------------------------------------------------------- */}
      {activeTab === 'pl-report' && (
        <div className="space-y-6">
          {/* Executive Net Income Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Cash Basis Card */}
            <div className="bg-slate-900 text-white rounded-xl p-5 shadow-xs border border-slate-800">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-teal-400">Cash Accounting Basis</span>
                <span className="text-[11px] text-slate-400">Actual Money Received - Paid Expenses</span>
              </div>
              <div className="text-3xl font-bold font-mono mt-3 tabular-nums text-emerald-400">
                {formatCurrency(profitLossReport.netProfitCash, symbol)}
              </div>
              <div className="mt-3 text-xs text-slate-300 space-y-1">
                <div className="flex justify-between">
                  <span>Money Actually Received (Cash In):</span>
                  <strong className="font-mono text-white">{formatCurrency(profitLossReport.totalMoneyActuallyReceived, symbol)}</strong>
                </div>
                <div className="flex justify-between">
                  <span>Total Expenses Paid (Cash Out):</span>
                  <strong className="font-mono text-rose-300">- {formatCurrency(profitLossReport.totalExpensesPaid, symbol)}</strong>
                </div>
              </div>
            </div>

            {/* Accrual Basis Card */}
            <div className="bg-white border border-slate-200/80 rounded-xl p-5 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Accrual Accounting Basis</span>
                <span className="text-[11px] text-slate-400">Total Invoiced Income - Incurred Expenses</span>
              </div>
              <div className="text-3xl font-bold font-mono mt-3 tabular-nums text-slate-900">
                {formatCurrency(profitLossReport.netProfitAccrual, symbol)}
              </div>
              <div className="mt-3 text-xs text-slate-600 space-y-1">
                <div className="flex justify-between">
                  <span>Total Invoiced Income (Billed):</span>
                  <strong className="font-mono text-slate-900">{formatCurrency(profitLossReport.totalInvoicedIncome, symbol)}</strong>
                </div>
                <div className="flex justify-between">
                  <span>Total Expenses Incurred:</span>
                  <strong className="font-mono text-rose-600">- {formatCurrency(profitLossReport.totalExpensesIncurred, symbol)}</strong>
                </div>
              </div>
            </div>
          </div>

          {/* Detailed Statement Table */}
          <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200 bg-slate-50">
              <h3 className="text-sm font-bold text-slate-900">
                Profit and Loss Statement Breakdown ({period?.label || 'Selected Period'})
              </h3>
            </div>
            <table className="w-full text-left border-collapse text-xs">
              <tbody className="divide-y divide-slate-100">
                {/* Income Section */}
                <tr className="bg-slate-50/50 font-bold text-slate-800">
                  <td colSpan={2} className="py-2.5 px-4 uppercase text-[11px] tracking-wider text-teal-800">
                    1. Revenue & Income Streams
                  </td>
                </tr>
                <tr>
                  <td className="py-2.5 px-4 text-slate-700">Total Invoiced Coworking Income (Billed)</td>
                  <td className="py-2.5 px-4 text-right font-mono font-semibold tabular-nums text-slate-900">
                    {formatCurrency(profitLossReport.totalInvoicedIncome, symbol)}
                  </td>
                </tr>
                <tr>
                  <td className="py-2.5 px-4 text-slate-700">Total Money Actually Collected (Cleared Cash Receipts)</td>
                  <td className="py-2.5 px-4 text-right font-mono font-semibold tabular-nums text-emerald-700">
                    {formatCurrency(profitLossReport.totalMoneyActuallyReceived, symbol)}
                  </td>
                </tr>
                <tr>
                  <td className="py-2.5 px-4 text-slate-500 pl-8">Less: Outstanding Unpaid Customer Invoices</td>
                  <td className="py-2.5 px-4 text-right font-mono tabular-nums text-amber-700">
                    {formatCurrency(profitLossReport.totalOutstandingCustomerPayments, symbol)}
                  </td>
                </tr>

                {/* Expenses Section */}
                <tr className="bg-slate-50/50 font-bold text-slate-800">
                  <td colSpan={2} className="py-2.5 px-4 uppercase text-[11px] tracking-wider text-rose-800">
                    2. Operating Expenses & Costs
                  </td>
                </tr>
                <tr>
                  <td className="py-2.5 px-4 text-slate-700">Total Operational Expenses Incurred</td>
                  <td className="py-2.5 px-4 text-right font-mono font-semibold tabular-nums text-slate-900">
                    {formatCurrency(profitLossReport.totalExpensesIncurred, symbol)}
                  </td>
                </tr>
                <tr>
                  <td className="py-2.5 px-4 text-slate-700">Expenses Actually Paid Out</td>
                  <td className="py-2.5 px-4 text-right font-mono font-semibold tabular-nums text-rose-600">
                    {formatCurrency(profitLossReport.totalExpensesPaid, symbol)}
                  </td>
                </tr>
                <tr>
                  <td className="py-2.5 px-4 text-slate-500 pl-8">Unpaid Vendor Liabilities & Pending Bills</td>
                  <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-600">
                    {formatCurrency(profitLossReport.totalExpensesUnpaid, symbol)}
                  </td>
                </tr>

                {/* Final Net Line */}
                <tr className="bg-slate-100 font-bold text-sm border-t-2 border-slate-300">
                  <td className="py-3 px-4 text-slate-900 uppercase">Net Profit (Cash Realized)</td>
                  <td className="py-3 px-4 text-right font-mono text-base font-bold text-emerald-700 tabular-nums">
                    {formatCurrency(profitLossReport.netProfitCash, symbol)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Previous Month vs Current Month Comparison */}
          {profitLossReport.comparison && (
            <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs p-5 space-y-3">
              <h3 className="text-sm font-bold text-slate-900">
                Period-over-Period Comparison ({profitLossReport.comparison.currentMonth} vs {profitLossReport.comparison.prevMonth})
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-1">
                <div className="p-3.5 border border-slate-200 rounded-lg bg-slate-50">
                  <div className="text-xs text-slate-500 font-medium">Income Collected Comparison</div>
                  <div className="text-base font-bold font-mono text-slate-900 mt-1">
                    {formatCurrency(profitLossReport.comparison.currentIncome, symbol)}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    Previous: {formatCurrency(profitLossReport.comparison.prevIncome, symbol)}
                  </div>
                </div>

                <div className="p-3.5 border border-slate-200 rounded-lg bg-slate-50">
                  <div className="text-xs text-slate-500 font-medium">Expenses Comparison</div>
                  <div className="text-base font-bold font-mono text-slate-900 mt-1">
                    {formatCurrency(profitLossReport.comparison.currentExpenses, symbol)}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    Previous: {formatCurrency(profitLossReport.comparison.prevExpenses, symbol)}
                  </div>
                </div>

                <div className="p-3.5 border border-slate-200 rounded-lg bg-slate-50">
                  <div className="text-xs text-slate-500 font-medium">Net Profit Change</div>
                  <div className="text-base font-bold font-mono text-emerald-700 mt-1">
                    {formatCurrency(profitLossReport.comparison.currentProfit, symbol)}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    Previous: {formatCurrency(profitLossReport.comparison.prevProfit, symbol)}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* --------------------------------------------------------------------- */}
      {/* TAB D: CUSTOMER OUTSTANDING PAYMENTS REPORT */}
      {/* --------------------------------------------------------------------- */}
      {activeTab === 'outstanding-report' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="bg-white border border-slate-200/80 rounded-xl p-4 shadow-xs">
              <div className="text-xs font-medium text-slate-500">Total Customer Receivables</div>
              <div className="text-xl font-bold font-mono text-amber-700 mt-1 tabular-nums">
                {formatCurrency(customerOutstandingReport.totalOutstanding, symbol)}
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                Across {customerOutstandingReport.invoices.length} unsettled invoices
              </div>
            </div>

            <div className="bg-white border border-slate-200/80 rounded-xl p-4 shadow-xs">
              <div className="text-xs font-medium text-slate-500">Critical Overdue Invoices</div>
              <div className="text-xl font-bold font-mono text-rose-700 mt-1 tabular-nums">
                {customerOutstandingReport.overdueCount} Invoices
              </div>
              <div className="text-[11px] text-rose-600 mt-0.5">Past contractual due date</div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 text-[11px] font-semibold uppercase tracking-wider text-slate-500 border-b border-slate-200">
                    <th className="py-2.5 px-3.5">Invoice #</th>
                    <th className="py-2.5 px-3">Customer Name</th>
                    <th className="py-2.5 px-3">Company / Phone</th>
                    <th className="py-2.5 px-3">Invoice Date</th>
                    <th className="py-2.5 px-3">Due Date</th>
                    <th className="py-2.5 px-3 text-right">Invoice Amount</th>
                    <th className="py-2.5 px-3 text-right">Amount Paid</th>
                    <th className="py-2.5 px-3 text-right">Outstanding Due</th>
                    <th className="py-2.5 px-3.5">Overdue Days</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredOutstanding.map((inv: any) => (
                    <tr key={inv.id} className="hover:bg-slate-50/80">
                      <td className="py-2.5 px-3.5 font-mono font-bold text-slate-800">{inv.invoice_number}</td>
                      <td className="py-2.5 px-3 font-semibold text-slate-900">{inv.client_name_snapshot}</td>
                      <td className="py-2.5 px-3 text-slate-600">
                        <div>{inv.client_company_snapshot || '—'}</div>
                        {inv.client_phone_snapshot && <div className="text-[10px] text-slate-400 font-mono">{inv.client_phone_snapshot}</div>}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-slate-600">{formatDate(inv.invoice_date)}</td>
                      <td className="py-2.5 px-3 font-mono text-slate-800">{formatDate(inv.due_date)}</td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-700">
                        {formatCurrency(inv.total, symbol)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums text-emerald-700">
                        {formatCurrency(inv.paid_amount, symbol)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-rose-600 tabular-nums">
                        {formatCurrency(inv.remaining_amount, symbol)}
                      </td>
                      <td className="py-2.5 px-3.5">
                        {inv.is_overdue ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                            <AlertTriangle className="w-3 h-3" />
                            {inv.overdue_days} Days Overdue
                          </span>
                        ) : (
                          <span className="inline-flex px-2 py-0.5 rounded text-[11px] font-medium bg-amber-50 text-amber-700">
                            Due in {inv.days_remaining} Days
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-50 font-bold border-t border-slate-200">
                    <td colSpan={7} className="py-3 px-3.5 text-right uppercase text-slate-600">Total Filtered Receivables</td>
                    <td className="py-3 px-3 text-right font-mono text-sm text-rose-700 tabular-nums">
                      {formatCurrency(
                        filteredOutstanding.reduce((sum: number, i: any) => sum + Number(i.remaining_amount || 0), 0),
                        symbol
                      )}
                    </td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* --------------------------------------------------------------------- */}
      {/* TAB E: MONTHLY FINANCIAL SUMMARY */}
      {/* --------------------------------------------------------------------- */}
      {activeTab === 'monthly-summary' && (
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Month-by-Month Financial Summary</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Past 12 months financial performance with billed income, actual cash collections, expenses, and net profit.
              </p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 text-[11px] font-semibold uppercase tracking-wider text-slate-500 border-b border-slate-200">
                  <th className="py-2.5 px-3.5">Month</th>
                  <th className="py-2.5 px-3 text-right">Invoiced Income</th>
                  <th className="py-2.5 px-3 text-right">Money Collected</th>
                  <th className="py-2.5 px-3 text-right">Total Expenses</th>
                  <th className="py-2.5 px-3 text-right">Unpaid Expenses</th>
                  <th className="py-2.5 px-3 text-right">Net Cash Profit</th>
                  <th className="py-2.5 px-3 text-right">Net Accrual Profit</th>
                  <th className="py-2.5 px-3.5 text-right">Collection Rate</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {monthlySummaryReport.map((m: any, idx: number) => (
                  <tr key={idx} className="hover:bg-slate-50/80">
                    <td className="py-2.5 px-3.5 font-bold text-slate-900 font-mono">{m.label}</td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-800">
                      {formatCurrency(m.invoicedIncome, symbol)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums text-emerald-700 font-semibold">
                      {formatCurrency(m.collectedRevenue, symbol)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-800">
                      {formatCurrency(m.totalExpenses, symbol)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums text-rose-600">
                      {formatCurrency(m.unpaidExpenses, symbol)}
                    </td>
                    <td
                      className={`py-2.5 px-3 text-right font-mono font-bold tabular-nums ${
                        Number(m.netCashProfit) >= 0 ? 'text-emerald-700' : 'text-rose-600'
                      }`}
                    >
                      {formatCurrency(m.netCashProfit, symbol)}
                    </td>
                    <td
                      className={`py-2.5 px-3 text-right font-mono tabular-nums ${
                        Number(m.netAccrualProfit) >= 0 ? 'text-slate-800' : 'text-rose-600'
                      }`}
                    >
                      {formatCurrency(m.netAccrualProfit, symbol)}
                    </td>
                    <td className="py-2.5 px-3.5 text-right font-mono font-semibold text-slate-700">
                      {m.collectionRate}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
