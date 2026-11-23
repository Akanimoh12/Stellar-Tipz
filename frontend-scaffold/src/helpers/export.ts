import { stroopToXlm } from './format';
import { logger } from '../services/logger';

let html2canvasPromise: Promise<typeof import('html2canvas').default> | null = null;

/**
 * Lazily loads html2canvas, caching the promise so the library is only
 * fetched once (and only when a PDF/image is actually generated).
 */
function loadHtml2Canvas(): Promise<typeof import('html2canvas').default> {
  if (!html2canvasPromise) {
    html2canvasPromise = import('html2canvas').then((m) => m.default);
  }
  return html2canvasPromise;
}

export interface TipHistoryItem {
  date: string | number; // Unix timestamp in seconds or date string (YYYY-MM-DD)
  from: string; // tipper address
  to: string; // creator address
  amount: string; // amount in stroops as string
  message: string;
  txHash?: string; // transaction hash (optional)
}

/**
 * Filters tip history by date range.
 * @param tipHistory Array of tip history items
 * @param options Object with from and to dates (inclusive, in YYYY-MM-DD format)
 * @returns Filtered tip history array
 */
export function filterTipHistoryByDate(
  tipHistory: TipHistoryItem[],
  options?: { from: string; to: string }
): TipHistoryItem[] {
  if (!options?.from && !options?.to) {
    return tipHistory;
  }

  const startDate = options.from ? new Date(options.from) : null;
  const endDate = options.to ? new Date(options.to) : null;

  // If endDate is set, we want to include the entire day, so set to end of day
  if (endDate) {
    endDate.setHours(23, 59, 59, 999);
  }

  return tipHistory.filter((item) => {
    const itemDate = typeof item.date === 'string'
      ? new Date(item.date)
      : new Date(item.date * 1000); // convert seconds to milliseconds

    if (startDate && itemDate < startDate) {
      return false;
    }
    if (endDate && itemDate > endDate) {
      return false;
    }
    return true;
  });
}

/**
 * Generates a CSV string from tip history.
 * @param tipHistory Array of tip history items
 * @param options Optional date range filtering
 * @returns Promise that resolves to the CSV string
 */
export async function generateCSV(
  tipHistory: TipHistoryItem[],
  options?: { from: string; to: string }
): Promise<string> {
  const filtered = filterTipHistoryByDate(tipHistory, options);

  const headers = [
    'Date',
    'From',
    'To',
    'Amount (XLM)',
    'Message',
    'Transaction Hash'
  ];

  const rows = await Promise.all(
    filtered.map(async (item) => {
      // Format date: if timestamp in seconds, convert to milliseconds then to ISO string
      const date = typeof item.date === 'string'
        ? new Date(item.date).toISOString().split('T')[0] // YYYY-MM-DD
        : new Date(item.date * 1000).toISOString().split('T')[0];

      // Convert amount from stroops to XLM for display
      const amount = stroopToXlm(item.amount);

      // Escape double-quotes in message
      const message = item.message ? `"${item.message.replace(/"/g, '""')}"` : '';

      return [
        date,
        item.from,
        item.to,
        amount,
        message,
        item.txHash ?? ''
      ].join(',');
    })
  );

  const csv = [headers.join(','), ...rows].join('\n');
  return csv;
}

/**
 * Converts tip history to CSV string and triggers a browser download.
 * @param tipHistory Array of tip history items
 * @param options Optional date range filtering
 * @param filename Optional filename for the download
 */
export function exportTipHistoryCSV(
  tipHistory: TipHistoryItem[],
  options?: { from: string; to: string },
  filename = 'tip-history.csv'
): void {
  generateCSV(tipHistory, options)
    .then((csv) => {
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);

      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    })
    .catch((err) => {
      logger.error('helpers/export', 'Export CSV failed', undefined, err instanceof Error ? err : new Error(String(err)));
      alert('Failed to export CSV');
    });
}

/**
 * Generates a PDF blob from tip history.
 * Uses html2canvas and jsPDF to generate a PDF from an HTML table.
 * @param tipHistory Array of tip history items
 * @param options Optional date range filtering
 * @returns Promise that resolves to a Blob representing the PDF
 */
export async function generatePDF(
  tipHistory: TipHistoryItem[],
  options?: { from: string; to: string }
): Promise<Blob> {
  // Dynamically import jsPDF; html2canvas is loaded lazily right before rendering
  const jsPDFModule = await import('jspdf');
  const jsPDF = jsPDFModule.default;

  const filtered = filterTipHistoryByDate(tipHistory, options);

  // Create a temporary table element
  const table = document.createElement('table');
  table.style.borderCollapse = 'collapse';
  table.style.width = '100%';
  table.style.border = '1px solid #ddd';

  // Create table header
  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');
  const headers = ['Date', 'From', 'To', 'Amount (XLM)', 'Message', 'Transaction Hash'];
  headers.forEach((headerText) => {
    const th = document.createElement('th');
    th.style.border = '1px solid #ddd';
    th.style.padding = '8px';
    th.style.backgroundColor = '#f2f2f2';
    th.textContent = headerText;
    headerRow.appendChild(th);
  });
  thead.appendChild(headerRow);
  table.appendChild(thead);

  // Create table body
  const tbody = document.createElement('tbody');
  filtered.forEach((item) => {
    const row = document.createElement('tr');

    const date = typeof item.date === 'string'
      ? new Date(item.date).toISOString().split('T')[0]
      : new Date(item.date * 1000).toISOString().split('T')[0];
    const amount = stroopToXlm(item.amount);
    const message = item.message || '';

    const fields = [
      date,
      item.from,
      item.to,
      amount,
      message,
      item.txHash ?? ''
    ];

    fields.forEach((field) => {
      const td = document.createElement('td');
      td.style.border = '1px solid #ddd';
      td.style.padding = '8px';
      td.textContent = field;
      row.appendChild(td);
    });

    tbody.appendChild(row);
  });
  table.appendChild(tbody);

  // Append table to body (off-screen) to render
  table.style.position = 'fixed';
  table.style.left = '-9999px';
  document.body.appendChild(table);

  // Lazily load html2canvas and convert the table to a canvas
  const html2canvas = await loadHtml2Canvas();
  const canvas = await html2canvas(table);
  // Clean up the temporary table
  document.body.removeChild(table);

  const pdf = new jsPDF();

  // Get the canvas image data
  const imgData = canvas.toDataURL('image/png');
  const imgProps = pdf.getImageProperties(imgData);
  const pdfWidth = pdf.internal.pageSize.getWidth();
  const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;

  pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);

  // Return the PDF as a blob
  return new Blob([pdf.output('arraybuffer')], { type: 'application/pdf' });
}

/**
 * Converts tip history to PDF and triggers a browser download.
 * @param tipHistory Array of tip history items
 * @param options Optional date range filtering
 * @param filename Optional filename for the download
 */
export function exportTipHistoryPDF(
  tipHistory: TipHistoryItem[],
  options?: { from: string; to: string },
  filename = 'tip-history.pdf'
): void {
  generatePDF(tipHistory, options)
    .then((blob) => {
      const url = URL.createObjectURL(blob);

      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    })
    .catch((err) => {
      logger.error('helpers/export', 'Export PDF failed', undefined, err instanceof Error ? err : new Error(String(err)));
      alert('Failed to export PDF');
    });
}