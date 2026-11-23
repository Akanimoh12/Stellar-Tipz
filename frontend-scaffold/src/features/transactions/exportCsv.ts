import { Transaction } from "../../hooks/useTransactionHistory";
import { stroopToXlmBigNumber } from "../../helpers/format";

/**
 * Converts a list of transactions to a CSV string and triggers a browser download.
 */
export function exportTransactionsCsv(
  transactions: Transaction[],
  filename = "tipz-transactions.csv",
): void {
  const headers = [
    "ID",
    "Type",
    "Amount (XLM)",
    "Fee (XLM)",
    "Net (XLM)",
    "Counterparty",
    "Date",
    "Message",
    "TX Hash",
  ];

  const rows = transactions.map((tx) => {
    const date = new Date(tx.date * 1000).toISOString();
    const amount = stroopToXlmBigNumber(tx.amount).toFixed(7);
    const fee = tx.fee ? stroopToXlmBigNumber(tx.fee).toFixed(7) : "";
    const net = tx.net ? stroopToXlmBigNumber(tx.net).toFixed(7) : "";
    // Escape double-quotes in message
    const message = tx.message ? `"${tx.message.replace(/"/g, '""')}"` : "";

    return [
      tx.id,
      tx.type,
      amount,
      fee,
      net,
      tx.counterparty,
      date,
      message,
      tx.txHash ?? "",
    ].join(",");
  });

  const csv = [headers.join(","), ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
