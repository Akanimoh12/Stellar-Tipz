import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { exportTransactionsCsv } from "../exportCsv";
import type { Transaction } from "../../../hooks/useTransactionHistory";

// ---------------------------------------------------------------------------
// DOM / URL API stubs
// ---------------------------------------------------------------------------

const mockClick = vi.fn();
const mockAppendChild = vi.fn();
const mockRemoveChild = vi.fn();

const mockLink = {
  href: "",
  download: "",
  style: { display: "" },
  click: mockClick,
};

const mockCreateObjectURL = vi.fn(() => "blob:mock-url");
const mockRevokeObjectURL = vi.fn();

beforeEach(() => {
  mockClick.mockClear();
  mockAppendChild.mockClear();
  mockRemoveChild.mockClear();
  mockCreateObjectURL.mockClear();
  mockRevokeObjectURL.mockClear();

  vi.spyOn(document, "createElement").mockReturnValue(
    mockLink as unknown as HTMLAnchorElement,
  );
  vi.spyOn(document.body, "appendChild").mockImplementation(mockAppendChild);
  vi.spyOn(document.body, "removeChild").mockImplementation(mockRemoveChild);

  global.URL.createObjectURL = mockCreateObjectURL;
  global.URL.revokeObjectURL = mockRevokeObjectURL;
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTransaction(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: "tx-1",
    type: "received",
    amount: "10000000", // 1 XLM in stroops
    counterparty: "GABC1234DEFG5678HIJK9012LMNO3456PQRS7890TUVW1234XYZA5678BCDE",
    date: 1_700_000_000,
    message: "",
    ...overrides,
  };
}

// Extract the CSV text from the Blob constructor call.
function capturedCsvText(): string {
  const blobCall = (global.Blob as unknown as ReturnType<typeof vi.fn>).mock
    .calls[0];
  if (!blobCall) throw new Error("Blob was not constructed");
  return (blobCall[0] as string[]).join("");
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("exportTransactionsCsv", () => {
  it("produces only the header row for an empty transaction list", () => {
    const BlobSpy = vi.spyOn(global, "Blob");

    exportTransactionsCsv([]);

    const csv = capturedCsvText();
    const lines = csv.split("\n");
    expect(lines).toHaveLength(1);
    expect(lines[0]).toBe(
      "ID,Type,Amount (XLM),Fee (XLM),Net (XLM),Counterparty,Date,Message,TX Hash",
    );

    BlobSpy.mockRestore();
  });

  it("escapes double-quotes in the message field", () => {
    const BlobSpy = vi.spyOn(global, "Blob");

    const tx = makeTransaction({
      message: 'He said "hello" and left',
    });

    exportTransactionsCsv([tx]);

    const csv = capturedCsvText();
    const dataRow = csv.split("\n")[1];
    // Double-quotes should be doubled inside the quoted field.
    expect(dataRow).toContain('"He said ""hello"" and left"');

    BlobSpy.mockRestore();
  });

  it("produces 101 lines (header + 100 rows) for a large set", () => {
    const BlobSpy = vi.spyOn(global, "Blob");

    const transactions = Array.from({ length: 100 }, (_, i) =>
      makeTransaction({ id: `tx-${i + 1}`, date: 1_700_000_000 + i }),
    );

    exportTransactionsCsv(transactions);

    const csv = capturedCsvText();
    const lines = csv.split("\n");
    expect(lines).toHaveLength(101);

    BlobSpy.mockRestore();
  });

  it("uses tipz-transactions.csv as the default filename", () => {
    exportTransactionsCsv([]);

    expect(mockLink.download).toBe("tipz-transactions.csv");
  });

  it("respects a custom filename parameter", () => {
    exportTransactionsCsv([], "my-export.csv");

    expect(mockLink.download).toBe("my-export.csv");
  });

  it("triggers a download by appending the link, clicking it, and cleaning up", () => {
    exportTransactionsCsv([makeTransaction()]);

    expect(mockAppendChild).toHaveBeenCalledOnce();
    expect(mockClick).toHaveBeenCalledOnce();
    expect(mockRemoveChild).toHaveBeenCalledOnce();
    expect(mockRevokeObjectURL).toHaveBeenCalledWith("blob:mock-url");
  });

  it("omits the fee and net columns when they are absent", () => {
    const BlobSpy = vi.spyOn(global, "Blob");

    exportTransactionsCsv([makeTransaction()]);

    const csv = capturedCsvText();
    const dataRow = csv.split("\n")[1];
    // fee and net are empty — the row still has 9 comma-separated fields
    const fields = dataRow.split(",");
    expect(fields).toHaveLength(9);
    // fee (index 3) and net (index 4) should be empty strings
    expect(fields[3]).toBe("");
    expect(fields[4]).toBe("");

    BlobSpy.mockRestore();
  });

  it("includes fee and net columns when present", () => {
    const BlobSpy = vi.spyOn(global, "Blob");

    const tx = makeTransaction({
      type: "withdrawal",
      fee: "200000",
      net: "9800000",
    });

    exportTransactionsCsv([tx]);

    const csv = capturedCsvText();
    const dataRow = csv.split("\n")[1];
    const fields = dataRow.split(",");
    // fee (index 3) and net (index 4) should be non-empty
    expect(fields[3]).not.toBe("");
    expect(fields[4]).not.toBe("");

    BlobSpy.mockRestore();
  });
});
