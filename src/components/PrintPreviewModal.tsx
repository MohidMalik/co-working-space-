import React, { useRef } from 'react';
import { useApp } from '../context/AppContext';
import { formatCurrency, formatDate, formatDateTime, triggerIframePrint } from '../utils/format';
import { Printer, Download, X, Building2 } from 'lucide-react';

export default function PrintPreviewModal() {
  const { printPayload, closePrintPreview, company, appSettings, user } = useApp();
  const sheetRef = useRef<HTMLDivElement>(null);

  if (!printPayload) return null;

  const symbol = appSettings?.currency_symbol || 'Rs.';
  const comp = printPayload.data?.company || company || {};

  const handlePrintOrPdf = () => {
    if (!sheetRef.current) return;
    const headStyles = Array.from(document.querySelectorAll('style, link[rel="stylesheet"]'))
      .map((el) => el.outerHTML)
      .join('\n');
    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8" />
          <title>${printPayload.title}</title>
          ${headStyles}
          <style>
            @page { size: A4 portrait; margin: 12mm; }
            html, body {
              font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
              color: #0f172a !important;
              background: #ffffff !important;
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
              margin: 0;
              padding: 0;
              visibility: visible !important;
            }
            body * {
              visibility: visible !important;
            }
            .font-mono, .tabular-nums {
              font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
              font-variant-numeric: tabular-nums;
            }
          </style>
        </head>
        <body>
          ${sheetRef.current.innerHTML}
        </body>
      </html>
    `;
    triggerIframePrint(htmlContent, printPayload.title.replace(/\s+/g, '_'));
  };

  const renderCompanyHeader = (docTitle: string, docSubtitle?: string, badgeStatus?: string) => (
    <div className="flex items-start justify-between pb-6 border-b-2 border-slate-900">
      <div className="flex items-start gap-4">
        {comp.logo_data ? (
          <img
            src={comp.logo_data}
            alt={comp.company_name || 'Company Logo'}
            referrerPolicy="no-referrer"
            className="w-16 h-16 object-contain rounded border border-slate-200 bg-white p-1"
          />
        ) : (
          <div className="w-14 h-14 rounded-lg bg-slate-900 text-white flex items-center justify-center shrink-0">
            <Building2 className="w-7 h-7" />
          </div>
        )}
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">
            {comp.company_name || 'DaftarPro Coworking & Executive Suites'}
          </h1>
          <p className="text-xs text-slate-600 mt-1 max-w-md">{comp.address || 'Main Boulevard Gulberg III, Lahore, Pakistan'}</p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-slate-600 mt-1">
            {comp.phone && <span>Tel: {comp.phone}</span>}
            {comp.email && <span>· {comp.email}</span>}
            {comp.website && <span>· {comp.website}</span>}
            {comp.tax_number && <span>· {comp.tax_number}</span>}
          </div>
        </div>
      </div>

      <div className="text-right">
        <div className="text-2xl font-bold tracking-tight text-slate-900 uppercase">{docTitle}</div>
        {docSubtitle && <div className="text-sm font-mono font-semibold text-slate-700 mt-0.5">{docSubtitle}</div>}
        {badgeStatus && (
          <div className="mt-1.5 text-xs font-semibold uppercase tracking-wider text-slate-800">
            Status: {badgeStatus}
          </div>
        )}
      </div>
    </div>
  );

  const renderInvoiceA4 = () => {
    const inv = printPayload.data.invoice || printPayload.data;
    const items = inv.items || [];
    return (
      <div className="space-y-6 text-slate-900">
        {renderCompanyHeader('INVOICE', inv.invoice_number, inv.status)}

        {/* Client & Invoice Metadata Grid */}
        <div className="grid grid-cols-2 gap-6 pt-2">
          <div className="border border-slate-200 rounded-lg p-4 bg-slate-50/50">
            <div className="text-xs font-semibold text-slate-500 mb-1.5">Billed To</div>
            <div className="text-base font-bold text-slate-900">{inv.client_name_snapshot}</div>
            {inv.client_company_snapshot && (
              <div className="text-sm font-medium text-slate-700">{inv.client_company_snapshot}</div>
            )}
            <div className="text-xs text-slate-600 mt-2 space-y-0.5">
              {inv.client_phone_snapshot && <div>Phone: {inv.client_phone_snapshot}</div>}
              {inv.client_email_snapshot && <div>Email: {inv.client_email_snapshot}</div>}
              {inv.client_address_snapshot && <div>Address: {inv.client_address_snapshot}</div>}
            </div>
          </div>

          <div className="border border-slate-200 rounded-lg p-4 bg-slate-50/50 flex flex-col justify-between">
            <div className="grid grid-cols-2 gap-y-2 text-xs">
              <span className="text-slate-500">Invoice Number:</span>
              <span className="font-mono font-semibold text-right text-slate-900">{inv.invoice_number}</span>

              <span className="text-slate-500">Invoice Date:</span>
              <span className="font-mono text-right text-slate-900">{formatDate(inv.invoice_date)}</span>

              <span className="text-slate-500">Due Date:</span>
              <span className="font-mono font-semibold text-right text-slate-900">{formatDate(inv.due_date)}</span>

              <span className="text-slate-500">Billing Period:</span>
              <span className="font-medium text-right text-slate-900">{inv.billing_period}</span>

              {inv.workspace_snapshot && (
                <>
                  <span className="text-slate-500">Workspace / Office:</span>
                  <span className="font-medium text-right text-slate-900">{inv.workspace_snapshot}</span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Custom Invoice Paragraph */}
        {inv.custom_paragraph && (
          <div className="border-l-4 border-slate-900 bg-slate-50 px-4 py-3 text-xs leading-relaxed text-slate-800">
            {inv.custom_paragraph}
          </div>
        )}

        {/* Line Items Table */}
        <div>
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="bg-slate-900 text-white">
                <th className="py-2.5 px-3 text-left font-semibold w-10">#</th>
                <th className="py-2.5 px-3 text-left font-semibold">Description & Service Particulars</th>
                <th className="py-2.5 px-3 text-left font-semibold w-36">Category</th>
                <th className="py-2.5 px-3 text-right font-semibold w-20">Qty</th>
                <th className="py-2.5 px-3 text-right font-semibold w-32">Unit Price</th>
                <th className="py-2.5 px-3 text-right font-semibold w-32">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 border-b border-slate-300">
              {items.map((item: any, idx: number) => (
                <tr key={idx} className="hover:bg-slate-50/50">
                  <td className="py-3 px-3 font-mono text-slate-500">{idx + 1}</td>
                  <td className="py-3 px-3 font-medium text-slate-900">{item.description}</td>
                  <td className="py-3 px-3 text-slate-600">{item.category || 'Workspace Rental'}</td>
                  <td className="py-3 px-3 text-right font-mono tabular-nums">{item.quantity}</td>
                  <td className="py-3 px-3 text-right font-mono tabular-nums">{formatCurrency(item.unit_price, symbol)}</td>
                  <td className="py-3 px-3 text-right font-mono font-semibold tabular-nums">
                    {formatCurrency(item.amount, symbol)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Financial Summary & Bank Details */}
        <div className="grid grid-cols-12 gap-6 pt-2">
          <div className="col-span-7 space-y-3">
            {(comp.bank_name || comp.bank_account_number || comp.bank_iban) && (
              <div className="border border-slate-200 rounded-lg p-3.5 text-xs bg-slate-50/60">
                <div className="font-semibold text-slate-900 mb-1">Bank Transfer / Payment Details</div>
                <div className="space-y-0.5 text-slate-700">
                  {comp.bank_name && <div>Bank: <span className="font-medium">{comp.bank_name}</span></div>}
                  {comp.bank_account_title && <div>Account Title: <span className="font-medium">{comp.bank_account_title}</span></div>}
                  {comp.bank_account_number && <div>Account No: <span className="font-mono font-medium">{comp.bank_account_number}</span></div>}
                  {comp.bank_iban && <div>IBAN: <span className="font-mono font-medium">{comp.bank_iban}</span></div>}
                </div>
              </div>
            )}

            {inv.notes && (
              <div className="text-xs text-slate-700">
                <span className="font-semibold text-slate-900 block mb-0.5">Invoice Notes:</span>
                <p className="whitespace-pre-line leading-relaxed">{inv.notes}</p>
              </div>
            )}
          </div>

          <div className="col-span-5">
            <div className="border border-slate-300 rounded-lg p-4 space-y-2 text-xs bg-white">
              <div className="flex justify-between py-1">
                <span className="text-slate-600">Subtotal:</span>
                <span className="font-mono font-medium tabular-nums">{formatCurrency(inv.subtotal, symbol)}</span>
              </div>
              {Number(inv.discount) > 0 && (
                <div className="flex justify-between py-1 text-emerald-700">
                  <span>Less Discount:</span>
                  <span className="font-mono tabular-nums">- {formatCurrency(inv.discount, symbol)}</span>
                </div>
              )}
              {Number(inv.additional_charges) > 0 && (
                <div className="flex justify-between py-1">
                  <span className="text-slate-600">Additional Charges:</span>
                  <span className="font-mono tabular-nums">+ {formatCurrency(inv.additional_charges, symbol)}</span>
                </div>
              )}
              <div className="flex justify-between py-2 border-t border-slate-900 text-sm font-bold text-slate-900">
                <span>Grand Total:</span>
                <span className="font-mono tabular-nums">{formatCurrency(inv.total, symbol)}</span>
              </div>
              <div className="flex justify-between py-1 text-emerald-700 font-medium">
                <span>Amount Paid:</span>
                <span className="font-mono tabular-nums">{formatCurrency(inv.paid_amount, symbol)}</span>
              </div>
              <div className="flex justify-between py-2 border-t border-slate-200 text-sm font-bold text-slate-900 bg-slate-100 -mx-4 px-4 rounded-b">
                <span>Balance Due:</span>
                <span className="font-mono tabular-nums">{formatCurrency(inv.remaining_amount, symbol)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Terms & Conditions */}
        {inv.terms && (
          <div className="pt-4 border-t border-slate-200 text-[11px] text-slate-600">
            <div className="font-semibold text-slate-800 mb-1">Terms & Conditions</div>
            <p className="whitespace-pre-line leading-relaxed">{inv.terms}</p>
          </div>
        )}

        {/* Dynamic 3-Role Signatory Row with Official Signature & Stamp */}
        {(() => {
          const showSignature = inv.show_signature !== undefined ? Boolean(Number(inv.show_signature)) : (comp.show_signature !== undefined ? Boolean(Number(comp.show_signature)) : true);
          const showStamp = inv.show_stamp !== undefined ? Boolean(Number(inv.show_stamp)) : (comp.show_stamp !== undefined ? Boolean(Number(comp.show_stamp)) : true);
          const sigPos = inv.signature_position || comp.signature_position || 'right';
          const stampPos = inv.stamp_position || comp.stamp_position || 'beside-signature';

          const role1Title = inv.role1_title || comp.role1_title || 'Prepared By';
          const role1Name = inv.role1_name || comp.role1_name || '';
          const role1Sig = comp.role1_signature_data || '';

          const role2Title = inv.role2_title || comp.role2_title || 'Accountant';
          const role2Name = inv.role2_name || comp.role2_name || '';
          const role2Sig = comp.role2_signature_data || '';

          const role3Title = inv.role3_title || comp.role3_title || 'Authorized Signatory';
          const role3Name = inv.role3_name || comp.role3_name || comp.company_name || '';
          const role3Sig = comp.role3_signature_data || comp.signature_data || '';
          const stampImg = comp.stamp_data || '';

          return (
            <div className="pt-8 border-t border-slate-300">
              <div className="grid grid-cols-3 gap-8 items-end">
                {/* Signatory Column 1: Role 1 */}
                <div className="text-center flex flex-col items-center">
                  <div className="h-16 flex items-end justify-center mb-1">
                    {role1Sig ? (
                      <img src={role1Sig} alt={role1Title} className="max-h-14 max-w-[140px] object-contain" />
                    ) : (
                      <div className="h-10" />
                    )}
                  </div>
                  <div className="border-t border-slate-400 w-full pt-1.5">
                    <div className="text-xs font-bold text-slate-900">{role1Name || '—'}</div>
                    <div className="text-[11px] font-medium text-slate-600 uppercase tracking-wide">{role1Title}</div>
                  </div>
                </div>

                {/* Signatory Column 2: Role 2 */}
                <div className="text-center flex flex-col items-center">
                  <div className="h-16 flex items-end justify-center mb-1">
                    {role2Sig ? (
                      <img src={role2Sig} alt={role2Title} className="max-h-14 max-w-[140px] object-contain" />
                    ) : (
                      <div className="h-10" />
                    )}
                  </div>
                  <div className="border-t border-slate-400 w-full pt-1.5">
                    <div className="text-xs font-bold text-slate-900">{role2Name || '—'}</div>
                    <div className="text-[11px] font-medium text-slate-600 uppercase tracking-wide">{role2Title}</div>
                  </div>
                </div>

                {/* Signatory Column 3: Role 3 with Official Signature & Stamp */}
                <div className="text-center flex flex-col items-center relative">
                  <div className="h-16 relative w-full flex items-end justify-center mb-1">
                    {/* Official Signature */}
                    {showSignature && role3Sig && (
                      <img
                        src={role3Sig}
                        alt="Authorized Signature"
                        className={`max-h-14 max-w-[150px] object-contain relative z-10 ${
                          sigPos === 'left' ? 'mr-auto' : sigPos === 'center' ? 'mx-auto' : 'ml-auto'
                        }`}
                      />
                    )}

                    {/* Official Stamp */}
                    {showStamp && stampImg && (
                      <img
                        src={stampImg}
                        alt="Official Stamp"
                        className={`object-contain pointer-events-none ${
                          stampPos === 'overlap'
                            ? 'absolute top-0 right-2 max-h-16 max-w-[95px] opacity-85 z-20 rotate-[-6deg]'
                            : stampPos === 'left'
                            ? 'absolute bottom-0 left-0 max-h-14 max-w-[85px] opacity-90'
                            : stampPos === 'center'
                            ? 'absolute bottom-0 inset-x-0 mx-auto max-h-14 max-w-[85px] opacity-90'
                            : 'absolute bottom-0 right-0 max-h-14 max-w-[85px] opacity-90'
                        }`}
                      />
                    )}
                  </div>
                  <div className="border-t border-slate-400 w-full pt-1.5">
                    <div className="text-xs font-bold text-slate-900">{role3Name || 'Authorized Signatory'}</div>
                    <div className="text-[11px] font-medium text-slate-600 uppercase tracking-wide">{role3Title}</div>
                  </div>
                </div>
              </div>
            </div>
          );
        })()}
      </div>
    );
  };

  const renderReceiptA4 = () => {
    const p = printPayload.data;
    return (
      <div className="space-y-6 text-slate-900">
        {renderCompanyHeader('PAYMENT RECEIPT', p.receipt_number, 'CONFIRMED')}

        <div className="grid grid-cols-2 gap-6 pt-2 text-xs">
          <div className="border border-slate-200 rounded-lg p-4 bg-slate-50/50 space-y-1.5">
            <div className="text-slate-500 font-semibold">Received From</div>
            <div className="text-base font-bold text-slate-900">{p.client_name}</div>
            {p.company_name && <div className="text-sm font-medium text-slate-700">{p.company_name}</div>}
            {p.client_phone && <div className="text-slate-600">Phone: {p.client_phone}</div>}
          </div>

          <div className="border border-slate-200 rounded-lg p-4 bg-slate-50/50 space-y-1.5">
            <div className="flex justify-between">
              <span className="text-slate-500">Receipt Number:</span>
              <span className="font-mono font-semibold">{p.receipt_number}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Payment Date:</span>
              <span className="font-mono">{formatDate(p.payment_date)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Payment Method:</span>
              <span className="font-semibold">{p.payment_method}</span>
            </div>
            {p.reference_number && (
              <div className="flex justify-between">
                <span className="text-slate-500">Reference / TXN:</span>
                <span className="font-mono">{p.reference_number}</span>
              </div>
            )}
          </div>
        </div>

        <div className="border border-slate-900 rounded-lg overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-slate-900 text-white">
                <th className="py-2.5 px-4 text-left">Invoice Reference</th>
                <th className="py-2.5 px-4 text-left">Billing Period</th>
                <th className="py-2.5 px-4 text-right">Invoice Total</th>
                <th className="py-2.5 px-4 text-right">Amount Received</th>
                <th className="py-2.5 px-4 text-right">Remaining Balance</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-slate-200 font-medium">
                <td className="py-3.5 px-4 font-mono font-semibold">{p.invoice_number}</td>
                <td className="py-3.5 px-4">{p.billing_period || 'Monthly Rental'}</td>
                <td className="py-3.5 px-4 text-right font-mono tabular-nums">{formatCurrency(p.invoice_total, symbol)}</td>
                <td className="py-3.5 px-4 text-right font-mono font-bold text-emerald-700 tabular-nums">
                  {formatCurrency(p.amount, symbol)}
                </td>
                <td className="py-3.5 px-4 text-right font-mono tabular-nums">
                  {formatCurrency(p.invoice_remaining, symbol)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {p.notes && (
          <div className="text-xs text-slate-700 bg-slate-50 p-3 rounded border border-slate-200">
            <span className="font-semibold">Remarks: </span>
            {p.notes}
          </div>
        )}

        {p.transaction_screenshot && (
          <div className="border border-slate-200 rounded-lg p-3.5 bg-slate-50/50 space-y-2">
            <div className="text-xs font-semibold text-slate-800">Attached Transaction Screenshot / Payment Proof</div>
            <div className="flex justify-center bg-white border border-slate-200 rounded p-2">
              <img
                src={p.transaction_screenshot}
                alt="Transaction Screenshot"
                className="max-h-64 object-contain rounded"
              />
            </div>
          </div>
        )}

        <div className="pt-12 flex items-end justify-between text-xs text-slate-600">
          <div>
            <div>Received By: <span className="font-semibold text-slate-900">{p.received_by || user?.full_name}</span></div>
            <div className="mt-0.5">Printed: {formatDateTime(new Date().toISOString())}</div>
          </div>
          <div className="border-t border-slate-400 pt-2 w-48 text-center font-semibold text-slate-800">
            Authorized Cashier / Stamp
          </div>
        </div>
      </div>
    );
  };

  const renderExpenseSheetA4 = () => {
    const d = printPayload.data;
    return (
      <div className="space-y-6 text-slate-900">
        {renderCompanyHeader('MONTHLY EXPENSE SHEET', d.period?.label)}

        <div className="grid grid-cols-3 gap-4 text-xs">
          <div className="border border-slate-200 rounded-lg p-3.5 bg-slate-50">
            <div className="text-slate-500">Report Month</div>
            <div className="text-base font-bold text-slate-900 mt-0.5">{d.period?.label}</div>
          </div>
          <div className="border border-slate-200 rounded-lg p-3.5 bg-slate-50">
            <div className="text-slate-500">Expense Vouchers</div>
            <div className="text-base font-bold font-mono text-slate-900 mt-0.5">{d.expenses?.length || 0} Records</div>
          </div>
          <div className="border border-slate-900 rounded-lg p-3.5 bg-slate-900 text-white">
            <div className="text-slate-300">Total Monthly Expenses</div>
            <div className="text-base font-bold font-mono mt-0.5">{formatCurrency(d.summary?.totalExpenses, symbol)}</div>
          </div>
        </div>

        {/* Category & Payment Method Totals */}
        <div className="grid grid-cols-2 gap-6">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-2">Category Totals</h3>
            <table className="w-full text-xs border border-slate-200">
              <thead className="bg-slate-100">
                <tr>
                  <th className="py-2 px-3 text-left">Category</th>
                  <th className="py-2 px-3 text-right">Entries</th>
                  <th className="py-2 px-3 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {(d.expenseBreakdown || []).map((c: any, idx: number) => (
                  <tr key={idx}>
                    <td className="py-2 px-3 font-medium">{c.category}</td>
                    <td className="py-2 px-3 text-right font-mono">{c.count}</td>
                    <td className="py-2 px-3 text-right font-mono font-semibold">{formatCurrency(c.amount, symbol)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-2">By Payment Method</h3>
            <table className="w-full text-xs border border-slate-200">
              <thead className="bg-slate-100">
                <tr>
                  <th className="py-2 px-3 text-left">Payment Method</th>
                  <th className="py-2 px-3 text-right">Vouchers</th>
                  <th className="py-2 px-3 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {(d.expenseMethodBreakdown || []).map((m: any, idx: number) => (
                  <tr key={idx}>
                    <td className="py-2 px-3 font-medium">{m.method}</td>
                    <td className="py-2 px-3 text-right font-mono">{m.count}</td>
                    <td className="py-2 px-3 text-right font-mono font-semibold">{formatCurrency(m.amount, symbol)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Individual Expenses Table */}
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-2">Detailed Expense Ledger</h3>
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-slate-900 text-white">
                <th className="py-2 px-2.5 text-left">Voucher #</th>
                <th className="py-2 px-2.5 text-left">Date</th>
                <th className="py-2 px-2.5 text-left">Category</th>
                <th className="py-2 px-2.5 text-left">Description</th>
                <th className="py-2 px-2.5 text-left">Vendor</th>
                <th className="py-2 px-2.5 text-left">Method</th>
                <th className="py-2 px-2.5 text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 border-b border-slate-300">
              {(d.expenses || []).map((e: any) => (
                <tr key={e.id}>
                  <td className="py-2 px-2.5 font-mono">{e.expense_code}</td>
                  <td className="py-2 px-2.5 font-mono">{formatDate(e.expense_date)}</td>
                  <td className="py-2 px-2.5 font-medium">{e.category}</td>
                  <td className="py-2 px-2.5">{e.description}</td>
                  <td className="py-2 px-2.5 text-slate-600">{e.vendor || '—'}</td>
                  <td className="py-2 px-2.5">{e.payment_method}</td>
                  <td className="py-2 px-2.5 text-right font-mono font-semibold">{formatCurrency(e.amount, symbol)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-slate-100 font-bold">
                <td colSpan={6} className="py-2.5 px-2.5 text-right">Total Monthly Expenses:</td>
                <td className="py-2.5 px-2.5 text-right font-mono">{formatCurrency(d.summary?.totalExpenses, symbol)}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        <div className="pt-8 border-t border-slate-200 flex justify-between text-[11px] text-slate-500">
          <span>Generated by: {user?.full_name} ({user?.username})</span>
          <span>Generated on: {formatDateTime(new Date().toISOString())}</span>
        </div>
      </div>
    );
  };

  const renderBusinessReportA4 = () => {
    const d = printPayload.data;
    const s = d.summary || {};
    return (
      <div className="space-y-6 text-slate-900">
        {renderCompanyHeader('MONTHLY MANAGEMENT REPORT', d.period?.label)}

        {/* Executive Summary Grid */}
        <div className="grid grid-cols-4 gap-3 text-xs">
          <div className="border border-slate-200 rounded p-3">
            <div className="text-slate-500">Active / Total Clients</div>
            <div className="text-base font-bold font-mono mt-0.5">{s.activeClients} / {s.totalClients}</div>
          </div>
          <div className="border border-slate-200 rounded p-3">
            <div className="text-slate-500">Occupied / Available Spaces</div>
            <div className="text-base font-bold font-mono mt-0.5">{s.occupiedWorkspaces} / {s.availableWorkspaces}</div>
          </div>
          <div className="border border-slate-200 rounded p-3">
            <div className="text-slate-500">Invoices (Paid / Unpaid / Overdue)</div>
            <div className="text-base font-bold font-mono mt-0.5">{s.paidInvoices} / {s.unpaidInvoices} / {s.overdueInvoices}</div>
          </div>
          <div className="border border-slate-200 rounded p-3">
            <div className="text-slate-500">Total Billed ({d.period?.label})</div>
            <div className="text-base font-bold font-mono mt-0.5">{formatCurrency(s.totalBilled, symbol)}</div>
          </div>
        </div>

        {/* Financial Net Income Formula Box */}
        <div className="border-2 border-slate-900 rounded-lg p-4 bg-slate-50 grid grid-cols-4 gap-4 items-center text-xs">
          <div>
            <div className="text-slate-500">Total Collected (Revenue)</div>
            <div className="text-lg font-bold font-mono text-emerald-700 mt-0.5">{formatCurrency(s.totalCollected, symbol)}</div>
          </div>
          <div>
            <div className="text-slate-500">Less: Total Expenses</div>
            <div className="text-lg font-bold font-mono text-red-700 mt-0.5">- {formatCurrency(s.totalExpenses, symbol)}</div>
          </div>
          <div>
            <div className="text-slate-500">Outstanding Receivables</div>
            <div className="text-lg font-bold font-mono text-amber-700 mt-0.5">{formatCurrency(s.outstandingAmount, symbol)}</div>
          </div>
          <div className="bg-slate-900 text-white p-3 rounded-lg">
            <div className="text-slate-300 text-[11px]">Net Income (Collected - Expenses)</div>
            <div className="text-lg font-bold font-mono mt-0.5">{formatCurrency(s.netIncome, symbol)}</div>
          </div>
        </div>

        {/* Revenue & Expense Breakdown Side by Side */}
        <div className="grid grid-cols-2 gap-6">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-2">Revenue Collection Breakdown</h3>
            <table className="w-full text-xs border border-slate-200">
              <thead className="bg-slate-100">
                <tr>
                  <th className="py-2 px-3 text-left">Payment Channel</th>
                  <th className="py-2 px-3 text-right">Receipts</th>
                  <th className="py-2 px-3 text-right">Collected</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {(d.revenueBreakdown || []).map((r: any, idx: number) => (
                  <tr key={idx}>
                    <td className="py-2 px-3 font-medium">{r.method}</td>
                    <td className="py-2 px-3 text-right font-mono">{r.count}</td>
                    <td className="py-2 px-3 text-right font-mono font-semibold">{formatCurrency(r.amount, symbol)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-2">Expense Category Breakdown</h3>
            <table className="w-full text-xs border border-slate-200">
              <thead className="bg-slate-100">
                <tr>
                  <th className="py-2 px-3 text-left">Expense Category</th>
                  <th className="py-2 px-3 text-right">Vouchers</th>
                  <th className="py-2 px-3 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {(d.expenseBreakdown || []).map((e: any, idx: number) => (
                  <tr key={idx}>
                    <td className="py-2 px-3 font-medium">{e.category}</td>
                    <td className="py-2 px-3 text-right font-mono">{e.count}</td>
                    <td className="py-2 px-3 text-right font-mono font-semibold">{formatCurrency(e.amount, symbol)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Invoices Summary Table */}
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-2">Monthly Invoices Register</h3>
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-slate-900 text-white">
                <th className="py-2 px-2.5 text-left">Invoice #</th>
                <th className="py-2 px-2.5 text-left">Client</th>
                <th className="py-2 px-2.5 text-left">Date</th>
                <th className="py-2 px-2.5 text-left">Status</th>
                <th className="py-2 px-2.5 text-right">Total</th>
                <th className="py-2 px-2.5 text-right">Paid</th>
                <th className="py-2 px-2.5 text-right">Balance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 border-b border-slate-300">
              {(d.invoices || []).map((inv: any) => (
                <tr key={inv.id}>
                  <td className="py-2 px-2.5 font-mono font-semibold">{inv.invoice_number}</td>
                  <td className="py-2 px-2.5">{inv.client_name_snapshot}</td>
                  <td className="py-2 px-2.5 font-mono">{formatDate(inv.invoice_date)}</td>
                  <td className="py-2 px-2.5 font-medium">{inv.status}</td>
                  <td className="py-2 px-2.5 text-right font-mono">{formatCurrency(inv.total, symbol)}</td>
                  <td className="py-2 px-2.5 text-right font-mono">{formatCurrency(inv.paid_amount, symbol)}</td>
                  <td className="py-2 px-2.5 text-right font-mono font-semibold">{formatCurrency(inv.remaining_amount, symbol)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="pt-8 border-t border-slate-200 flex justify-between items-end text-[11px] text-slate-600">
          <div>
            <div>Prepared by: <span className="font-semibold text-slate-900">{user?.full_name}</span></div>
            <div>Generated Date: {formatDateTime(new Date().toISOString())}</div>
          </div>
          <div className="border-t border-slate-400 pt-1.5 w-48 text-center font-semibold text-slate-800">
            Management Approval Signature
          </div>
        </div>
      </div>
    );
  };

  const renderClientProfileA4 = () => {
    const d = printPayload.data || {};
    const cl = d.client || d;
    const bal = d.balance || {
      total_billed: cl.total_billed || 0,
      total_paid: cl.total_paid || 0,
      total_outstanding: cl.total_outstanding || 0,
    };
    const contracts = d.contracts || [];
    const invoices = d.invoices || [];
    const payments = d.payments || [];

    return (
      <div className="space-y-5 text-slate-900">
        {renderCompanyHeader('CLIENT PROFILE DOSSIER', cl.client_code, cl.status)}

        {/* Client Photo + Personal & Business Info */}
        <div className="grid grid-cols-12 gap-5 pt-2 items-start">
          <div className="col-span-3 flex flex-col items-center border border-slate-200 rounded-lg p-3 bg-slate-50/60">
            {cl.client_photo ? (
              <img
                src={cl.client_photo}
                alt={cl.client_name}
                className="w-28 h-28 object-cover rounded-lg border border-slate-300 bg-white"
              />
            ) : (
              <div className="w-28 h-28 rounded-lg bg-slate-200 text-slate-700 flex items-center justify-center text-2xl font-bold">
                {(cl.client_name || 'CL').slice(0, 2).toUpperCase()}
              </div>
            )}
            <div className="mt-2 text-center">
              <div className="text-xs font-bold text-slate-900">{cl.client_name}</div>
              <div className="text-[11px] font-mono text-slate-600">{cl.client_code}</div>
              <div className="mt-1 inline-block px-2 py-0.5 text-[10px] font-semibold uppercase rounded bg-slate-900 text-white">
                {cl.status}
              </div>
            </div>
          </div>

          <div className="col-span-9 border border-slate-200 rounded-lg p-4 bg-white">
            <div className="text-xs font-bold uppercase tracking-wider text-slate-700 pb-2 mb-3 border-b border-slate-200">
              Client & Corporate Particulars
            </div>
            <div className="grid grid-cols-3 gap-x-4 gap-y-2.5 text-xs">
              <div>
                <div className="text-slate-500">Full Name</div>
                <div className="font-semibold text-slate-900">{cl.client_name}</div>
              </div>
              <div>
                <div className="text-slate-500">Company / Organization</div>
                <div className="font-semibold text-slate-900">{cl.company_name || 'Individual Member'}</div>
              </div>
              <div>
                <div className="text-slate-500">Business Type</div>
                <div className="font-medium text-slate-900">{cl.business_type || '—'}</div>
              </div>
              <div>
                <div className="text-slate-500">Phone Number</div>
                <div className="font-mono font-semibold text-slate-900">{cl.phone || '—'}</div>
              </div>
              <div>
                <div className="text-slate-500">WhatsApp Number</div>
                <div className="font-mono text-slate-900">{cl.whatsapp || '—'}</div>
              </div>
              <div>
                <div className="text-slate-500">Email Address</div>
                <div className="text-slate-900 break-all">{cl.email || '—'}</div>
              </div>
              <div>
                <div className="text-slate-500">CNIC / National ID</div>
                <div className="font-mono font-semibold text-slate-900">{cl.cnic || '—'}</div>
              </div>
              <div>
                <div className="text-slate-500">Contact Person</div>
                <div className="text-slate-900">{cl.contact_person || '—'}</div>
              </div>
              <div>
                <div className="text-slate-500">Assigned Workspace</div>
                <div className="font-semibold text-slate-900">
                  {cl.workspace_number ? `${cl.workspace_number} — ${cl.workspace_name}` : 'Unassigned'}
                </div>
              </div>
              <div className="col-span-3">
                <div className="text-slate-500">Address & City</div>
                <div className="text-slate-900">
                  {cl.address || '—'} {cl.city ? `(${cl.city})` : ''}
                </div>
              </div>
              {cl.notes && (
                <div className="col-span-3 pt-1 border-t border-slate-100">
                  <span className="text-slate-500 font-semibold">Remarks / Notes: </span>
                  <span className="text-slate-800">{cl.notes}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Financial Summary Bar */}
        <div className="grid grid-cols-3 gap-4 text-xs">
          <div className="border border-slate-200 rounded-lg p-3 bg-slate-50">
            <div className="text-slate-500">Total Billed</div>
            <div className="text-base font-bold font-mono text-slate-900 mt-0.5">
              {formatCurrency(bal.total_billed, symbol)}
            </div>
          </div>
          <div className="border border-slate-200 rounded-lg p-3 bg-slate-50">
            <div className="text-slate-500">Total Paid</div>
            <div className="text-base font-bold font-mono text-emerald-700 mt-0.5">
              {formatCurrency(bal.total_paid, symbol)}
            </div>
          </div>
          <div className="border border-slate-900 rounded-lg p-3 bg-slate-900 text-white">
            <div className="text-slate-300">Outstanding Balance</div>
            <div className="text-base font-bold font-mono mt-0.5">
              {formatCurrency(bal.total_outstanding, symbol)}
            </div>
          </div>
        </div>

        {/* CNIC Front & Back Verification Pictures */}
        {(cl.cnic_front || cl.cnic_back) && (
          <div className="border border-slate-200 rounded-lg p-4 bg-slate-50/40">
            <div className="text-xs font-bold uppercase tracking-wider text-slate-800 mb-3">
              CNIC / Identity Document Verification (Front & Back)
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="border border-slate-200 rounded bg-white p-2 text-center">
                <div className="text-[11px] font-semibold text-slate-600 mb-1.5">CNIC — Front Side</div>
                {cl.cnic_front ? (
                  <img
                    src={cl.cnic_front}
                    alt="CNIC Front"
                    className="h-36 w-full object-contain rounded mx-auto"
                  />
                ) : (
                  <div className="h-36 flex items-center justify-center text-xs text-slate-400">Not Provided</div>
                )}
              </div>
              <div className="border border-slate-200 rounded bg-white p-2 text-center">
                <div className="text-[11px] font-semibold text-slate-600 mb-1.5">CNIC — Back Side</div>
                {cl.cnic_back ? (
                  <img
                    src={cl.cnic_back}
                    alt="CNIC Back"
                    className="h-36 w-full object-contain rounded mx-auto"
                  />
                ) : (
                  <div className="h-36 flex items-center justify-center text-xs text-slate-400">Not Provided</div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Contracts History */}
        {contracts.length > 0 && (
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-2">
              Rental Contracts & Facility Allocations
            </h3>
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-slate-900 text-white">
                  <th className="py-2 px-2.5 text-left">Contract #</th>
                  <th className="py-2 px-2.5 text-left">Workspace</th>
                  <th className="py-2 px-2.5 text-left">Term Period</th>
                  <th className="py-2 px-2.5 text-left">Chairs / Tables / AC / Items</th>
                  <th className="py-2 px-2.5 text-right">Monthly Rent</th>
                  <th className="py-2 px-2.5 text-left">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 border-b border-slate-300">
                {contracts.map((ct: any) => (
                  <tr key={ct.id}>
                    <td className="py-2 px-2.5 font-mono font-semibold">{ct.contract_number}</td>
                    <td className="py-2 px-2.5">{ct.workspace_number} ({ct.workspace_name})</td>
                    <td className="py-2 px-2.5 font-mono">{formatDate(ct.start_date)} → {formatDate(ct.end_date)}</td>
                    <td className="py-2 px-2.5">
                      <div>
                        {[
                          ct.chairs_count ? `${ct.chairs_count} Chairs` : '',
                          ct.tables_count ? `${ct.tables_count} Tables` : '',
                          ct.ac_units ? `${ct.ac_units} AC` : '',
                          ct.lockers_count ? `${ct.lockers_count} Lockers` : '',
                        ]
                          .filter(Boolean)
                          .join(', ') || 'Standard Setup'}
                      </div>
                      {ct.custom_requirements && (
                        <div className="text-[11px] text-slate-600">{ct.custom_requirements}</div>
                      )}
                    </td>
                    <td className="py-2 px-2.5 text-right font-mono">{formatCurrency(ct.monthly_rent, symbol)}</td>
                    <td className="py-2 px-2.5 font-semibold">{ct.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Invoices & Payments Summary */}
        <div className="grid grid-cols-2 gap-5">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-2">
              Invoices History ({invoices.length})
            </h3>
            {invoices.length === 0 ? (
              <div className="text-xs text-slate-500 border border-slate-200 rounded p-3">No invoices recorded.</div>
            ) : (
              <table className="w-full text-[11px] border border-slate-200">
                <thead className="bg-slate-100">
                  <tr>
                    <th className="py-1.5 px-2 text-left">Invoice #</th>
                    <th className="py-1.5 px-2 text-left">Period</th>
                    <th className="py-1.5 px-2 text-right">Total</th>
                    <th className="py-1.5 px-2 text-right">Balance</th>
                    <th className="py-1.5 px-2 text-left">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {invoices.slice(0, 12).map((inv: any) => (
                    <tr key={inv.id}>
                      <td className="py-1.5 px-2 font-mono font-semibold">{inv.invoice_number}</td>
                      <td className="py-1.5 px-2">{inv.billing_period}</td>
                      <td className="py-1.5 px-2 text-right font-mono">{formatCurrency(inv.total, symbol)}</td>
                      <td className="py-1.5 px-2 text-right font-mono font-semibold">{formatCurrency(inv.remaining_amount, symbol)}</td>
                      <td className="py-1.5 px-2">{inv.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-2">
              Payments Received ({payments.length})
            </h3>
            {payments.length === 0 ? (
              <div className="text-xs text-slate-500 border border-slate-200 rounded p-3">No payments recorded.</div>
            ) : (
              <table className="w-full text-[11px] border border-slate-200">
                <thead className="bg-slate-100">
                  <tr>
                    <th className="py-1.5 px-2 text-left">Receipt #</th>
                    <th className="py-1.5 px-2 text-left">Date</th>
                    <th className="py-1.5 px-2 text-left">Method</th>
                    <th className="py-1.5 px-2 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {payments.slice(0, 12).map((p: any) => (
                    <tr key={p.id}>
                      <td className="py-1.5 px-2 font-mono font-semibold">{p.receipt_number}</td>
                      <td className="py-1.5 px-2 font-mono">{formatDate(p.payment_date)}</td>
                      <td className="py-1.5 px-2">{p.payment_method}</td>
                      <td className="py-1.5 px-2 text-right font-mono font-semibold text-emerald-700">
                        {formatCurrency(p.amount, symbol)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Footer Signatures */}
        <div className="pt-8 border-t border-slate-200 flex justify-between items-end text-xs text-slate-600">
          <div>
            <div>Printed By: <span className="font-semibold text-slate-900">{user?.full_name}</span></div>
            <div>Date: {formatDateTime(new Date().toISOString())}</div>
          </div>
          <div className="flex gap-8">
            <div className="border-t border-slate-400 pt-1.5 w-40 text-center font-semibold text-slate-800">
              Client Signature
            </div>
            <div className="border-t border-slate-400 pt-1.5 w-44 text-center font-semibold text-slate-800">
              Authorized Management
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderContractA4 = () => {
    const ct = printPayload.data;
    return (
      <div className="space-y-6 text-slate-900">
        {renderCompanyHeader('WORKSPACE RENTAL AGREEMENT', ct.contract_number, ct.status)}

        <div className="grid grid-cols-2 gap-6 pt-2 text-xs">
          <div className="border border-slate-200 rounded-lg p-4 bg-slate-50/50 space-y-1.5">
            <div className="text-slate-500 font-semibold uppercase tracking-wider text-[11px]">Lessee / Client Details</div>
            <div className="text-base font-bold text-slate-900">{ct.client_name}</div>
            {ct.company_name && <div className="text-sm font-medium text-slate-700">{ct.company_name}</div>}
            {ct.client_phone && <div className="text-slate-600 font-mono">Phone: {ct.client_phone}</div>}
          </div>

          <div className="border border-slate-200 rounded-lg p-4 bg-slate-50/50 space-y-1.5">
            <div className="text-slate-500 font-semibold uppercase tracking-wider text-[11px]">Allocated Workspace & Term</div>
            <div className="text-base font-bold text-slate-900">
              {ct.workspace_number} — {ct.workspace_name}
            </div>
            <div className="text-slate-700">{ct.workspace_type} {ct.workspace_floor ? `· ${ct.workspace_floor}` : ''}</div>
            <div className="font-mono text-slate-800 pt-1">
              Period: <strong>{formatDate(ct.start_date)}</strong> to <strong>{formatDate(ct.end_date)}</strong>
            </div>
          </div>
        </div>

        {/* Financial Terms */}
        <div className="grid grid-cols-4 gap-3 text-xs">
          <div className="border border-slate-200 rounded-lg p-3 bg-white">
            <div className="text-slate-500">Monthly Rent</div>
            <div className="text-base font-bold font-mono text-slate-900 mt-0.5">{formatCurrency(ct.monthly_rent, symbol)}</div>
          </div>
          <div className="border border-slate-200 rounded-lg p-3 bg-white">
            <div className="text-slate-500">Security Deposit</div>
            <div className="text-base font-bold font-mono text-slate-900 mt-0.5">{formatCurrency(ct.security_deposit, symbol)}</div>
          </div>
          <div className="border border-slate-200 rounded-lg p-3 bg-white">
            <div className="text-slate-500">Recurring Add-On Charges</div>
            <div className="text-base font-bold font-mono text-slate-900 mt-0.5">{formatCurrency(ct.additional_charges, symbol)}</div>
          </div>
          <div className="border border-slate-200 rounded-lg p-3 bg-white">
            <div className="text-slate-500">Monthly Due Day</div>
            <div className="text-base font-bold font-mono text-slate-900 mt-0.5">Day {ct.payment_due_day || 5} of Month</div>
          </div>
        </div>

        {/* Furniture, Equipment & Custom Requirements Schedule */}
        <div className="border border-slate-900 rounded-lg overflow-hidden">
          <div className="bg-slate-900 text-white px-4 py-2 text-xs font-semibold uppercase tracking-wider">
            Allocated Furniture, AC, Equipment & Custom Client Requirements
          </div>
          <div className="p-4 space-y-3 text-xs bg-white">
            <div className="grid grid-cols-4 gap-3">
              <div className="border border-slate-200 rounded p-2.5 bg-slate-50">
                <div className="text-slate-500">Office Chairs</div>
                <div className="text-sm font-bold font-mono text-slate-900 mt-0.5">{Number(ct.chairs_count || 0)} Chairs</div>
              </div>
              <div className="border border-slate-200 rounded p-2.5 bg-slate-50">
                <div className="text-slate-500">Work Tables / Desks</div>
                <div className="text-sm font-bold font-mono text-slate-900 mt-0.5">{Number(ct.tables_count || 0)} Tables</div>
              </div>
              <div className="border border-slate-200 rounded p-2.5 bg-slate-50">
                <div className="text-slate-500">Air Conditioning (AC)</div>
                <div className="text-sm font-bold font-mono text-slate-900 mt-0.5">{Number(ct.ac_units || 0)} Units</div>
              </div>
              <div className="border border-slate-200 rounded p-2.5 bg-slate-50">
                <div className="text-slate-500">Lockers / Cabinets</div>
                <div className="text-sm font-bold font-mono text-slate-900 mt-0.5">{Number(ct.lockers_count || 0)} Units</div>
              </div>
            </div>

            {ct.custom_requirements && (
              <div className="border-t border-slate-200 pt-3">
                <div className="font-semibold text-slate-900 mb-1">Additional Items, Inventory & Custom Client Requirements:</div>
                <div className="whitespace-pre-line text-slate-800 bg-slate-50 p-3 rounded border border-slate-200 leading-relaxed">
                  {ct.custom_requirements}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Terms & Clauses */}
        {ct.contract_terms && (
          <div className="border border-slate-200 rounded-lg p-4 bg-white text-xs">
            <div className="font-bold uppercase tracking-wider text-slate-800 mb-2">Agreement Terms & Conditions</div>
            <div className="whitespace-pre-line leading-relaxed text-slate-700">{ct.contract_terms}</div>
          </div>
        )}

        {ct.notes && (
          <div className="text-xs text-slate-700 bg-slate-50 p-3 rounded border border-slate-200">
            <span className="font-semibold">Special Notes: </span>
            {ct.notes}
          </div>
        )}

        {/* Dual Signatures */}
        <div className="pt-12 grid grid-cols-2 gap-12 text-xs text-slate-700">
          <div className="border-t border-slate-400 pt-2">
            <div className="font-bold text-slate-900">For {comp.company_name || 'Management (Lessor)'}</div>
            <div className="text-slate-500 mt-0.5">Authorized Signature & Company Stamp</div>
          </div>
          <div className="border-t border-slate-400 pt-2">
            <div className="font-bold text-slate-900">For {ct.client_name} (Lessee / Client)</div>
            <div className="text-slate-500 mt-0.5">Client Signature & Date</div>
          </div>
        </div>
      </div>
    );
  };

  const renderGenericTableA4 = () => {
    const { subtitle, headers, rows } = printPayload.data;
    return (
      <div className="space-y-6 text-slate-900">
        {renderCompanyHeader(printPayload.title, subtitle)}
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="bg-slate-900 text-white">
              {(headers || []).map((h: string, i: number) => (
                <th key={i} className="py-2 px-2.5 text-left font-semibold">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 border-b border-slate-300">
            {(rows || []).map((r: any[], rIdx: number) => (
              <tr key={rIdx}>
                {r.map((cell, cIdx) => (
                  <td key={cIdx} className="py-2 px-2.5">{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        <div className="pt-6 border-t border-slate-200 flex justify-between text-[11px] text-slate-500">
          <span>Generated by: {user?.full_name}</span>
          <span>Date: {formatDateTime(new Date().toISOString())}</span>
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-xs flex flex-col overflow-hidden no-print">
      {/* Top Action Bar */}
      <div className="bg-slate-900 text-white px-4 sm:px-6 py-3.5 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold truncate">{printPayload.title} — A4 Print Preview</h2>
          <p className="text-xs text-slate-400 hidden sm:block">Formatted for standard A4 portrait paper (210mm × 297mm)</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handlePrintOrPdf}
            className="flex items-center gap-1.5 px-3 sm:px-4 py-2 text-xs font-medium bg-white text-slate-900 hover:bg-slate-100 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
          >
            <Printer className="w-4 h-4" />
            <span>Print</span>
          </button>
          <button
            onClick={handlePrintOrPdf}
            className="flex items-center gap-1.5 px-3 sm:px-4 py-2 text-xs font-medium bg-emerald-600 text-white hover:bg-emerald-500 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
          >
            <Download className="w-4 h-4" />
            <span>Save PDF</span>
          </button>
          <button
            onClick={closePrintPreview}
            className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
            title="Close Preview"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Scrollable A4 Sheet Canvas */}
      <div className="flex-1 overflow-y-auto p-3 sm:p-6 md:p-10 flex justify-center bg-slate-800/90">
        <div
          id="printable-document-area"
          ref={sheetRef}
          className="a4-print-sheet bg-white text-slate-900 w-full max-w-[210mm] min-h-[297mm] p-4 sm:p-8 md:p-12 shadow-2xl rounded-xs border border-slate-300 overflow-x-auto"
        >
          {printPayload.type === 'invoice' && renderInvoiceA4()}
          {printPayload.type === 'receipt' && renderReceiptA4()}
          {printPayload.type === 'expense-sheet' && renderExpenseSheetA4()}
          {printPayload.type === 'business-report' && renderBusinessReportA4()}
          {printPayload.type === 'client-profile' && renderClientProfileA4()}
          {printPayload.type === 'contract' && renderContractA4()}
          {printPayload.type === 'generic-table' && renderGenericTableA4()}
        </div>
      </div>
    </div>
  );
}
