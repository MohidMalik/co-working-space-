export function formatCurrency(amount: number | string | null | undefined, symbol = 'Rs.'): string {
  const num = Number(amount || 0);
  if (Number.isNaN(num)) return `${symbol} 0`;
  const formatted = num.toLocaleString('en-PK', {
    minimumFractionDigits: num % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  });
  return `${symbol} ${formatted}`;
}

export function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr.length === 10 ? `${dateStr}T00:00:00` : dateStr);
    if (Number.isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

export function formatDateTime(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) return dateStr;
    return d.toLocaleString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return dateStr;
  }
}

export function formatBytes(bytes: number): string {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

/**
 * Generates a formatted Excel (.xls HTML workbook) file download with company header,
 * title, period, and clean tabular formatting.
 */
export function exportToExcel(
  arg1: string | Array<Record<string, any>>,
  arg2: string,
  subtitle = 'Exported Report',
  headers?: string[],
  rows?: Array<Array<string | number>>,
  companyName = 'DaftarPro Coworking Management System'
) {
  let fileName: string;
  let title: string;
  let finalHeaders: string[];
  let finalRows: Array<Array<string | number>>;

  if (Array.isArray(arg1)) {
    fileName = arg2;
    title = arg2.replace(/_/g, ' ');
    finalHeaders = arg1.length > 0 ? Object.keys(arg1[0]) : ['No Data'];
    finalRows = arg1.map((obj) => finalHeaders.map((k) => (obj[k] ?? '') as string | number));
  } else {
    fileName = arg1;
    title = arg2;
    finalHeaders = headers || [];
    finalRows = rows || [];
  }

  const escapeHtml = (val: string | number) =>
    String(val ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

  const tableHtml = `
    <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
    <head>
      <meta charset="UTF-8" />
      <style>
        body { font-family: Calibri, Arial, sans-serif; font-size: 11pt; }
        .company { font-size: 15pt; font-weight: bold; color: #0f172a; }
        .title { font-size: 13pt; font-weight: bold; color: #1e293b; margin-top: 4px; }
        .subtitle { font-size: 10pt; color: #475569; margin-bottom: 12px; }
        table { border-collapse: collapse; width: 100%; margin-top: 10px; }
        th { background-color: #0f172a; color: #ffffff; font-weight: bold; padding: 8px 10px; border: 1px solid #cbd5e1; text-align: left; }
        td { padding: 7px 10px; border: 1px solid #cbd5e1; vertical-align: top; }
        tr:nth-child(even) td { background-color: #f8fafc; }
      </style>
    </head>
    <body>
      <div class="company">${escapeHtml(companyName)}</div>
      <div class="title">${escapeHtml(title)}</div>
      <div class="subtitle">${escapeHtml(subtitle)} | Generated: ${escapeHtml(formatDateTime(new Date().toISOString()))}</div>
      <table>
        <thead>
          <tr>${finalHeaders.map((h) => `<th>${escapeHtml(h)}</th>`).join('')}</tr>
        </thead>
        <tbody>
          ${finalRows
            .map(
              (r) =>
                `<tr>${r
                  .map((cell) => `<td>${escapeHtml(cell)}</td>`)
                  .join('')}</tr>`
            )
            .join('')}
        </tbody>
      </table>
    </body>
    </html>
  `;

  const blob = new Blob([tableHtml], { type: 'application/vnd.ms-excel;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName.endsWith('.xls') ? fileName : `${fileName}.xls`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Prints any HTML string inside a hidden iframe so it works seamlessly inside sandboxed environments
 * without triggering popup blockers or window.open restrictions.
 */
export function triggerIframePrint(htmlDocumentContent: string, docTitle = 'DaftarPro_Document') {
  const existingFrame = document.getElementById('daftarpro-print-frame') as HTMLIFrameElement | null;
  if (existingFrame) {
    existingFrame.remove();
  }

  const iframe = document.createElement('iframe');
  iframe.id = 'daftarpro-print-frame';
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  document.body.appendChild(iframe);

  const doc = iframe.contentWindow?.document;
  if (!doc) return;

  const originalTitle = document.title;
  document.title = docTitle;

  doc.open();
  doc.write(htmlDocumentContent);
  doc.close();

  const imgs = Array.from(doc.images || []);
  const waitPromises = imgs.map(
    (img) =>
      new Promise<void>((resolve) => {
        if (img.complete) {
          resolve();
        } else {
          img.onload = () => resolve();
          img.onerror = () => resolve();
        }
      })
  );

  Promise.race([
    Promise.all(waitPromises),
    new Promise<void>((resolve) => setTimeout(resolve, 600)),
  ]).then(() => {
    setTimeout(() => {
      try {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      } finally {
        setTimeout(() => {
          document.title = originalTitle;
        }, 1000);
      }
    }, 150);
  });
}
