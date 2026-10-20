import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Table from "../Table";

describe("Table", () => {
  const columns = [
    { key: "id", label: "ID" },
    { key: "name", label: "Name", align: "left" as const },
    { key: "amount", label: "Amount", align: "right" as const },
    { key: "status", label: "Status", align: "center" as const },
  ];

  const sampleData = [
    { id: "1", name: "Alice", amount: "50 XLM", status: "Active" },
    { id: "2", name: "Bob", amount: "120 XLM", status: "Pending" },
    { id: "3", name: "Charlie", amount: "200 XLM", status: "Completed" },
  ];

  it("renders table headers correctly", () => {
    render(<Table columns={columns} data={sampleData} />);

    const headers = screen.getAllByRole("columnheader");
    expect(headers).toHaveLength(4);
    expect(headers[0]).toHaveTextContent("ID");
    expect(headers[1]).toHaveTextContent("Name");
    expect(headers[2]).toHaveTextContent("Amount");
    expect(headers[3]).toHaveTextContent("Status");
  });

  it("renders rows and cell content correctly", () => {
    render(<Table columns={columns} data={sampleData} />);

    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.getByText("50 XLM")).toBeInTheDocument();
    expect(screen.getByText("Bob")).toBeInTheDocument();
    expect(screen.getByText("120 XLM")).toBeInTheDocument();
    expect(screen.getByText("Charlie")).toBeInTheDocument();
    expect(screen.getByText("200 XLM")).toBeInTheDocument();

    const rows = screen.getAllByRole("row");
    // 1 header row + 3 data rows = 4 rows
    expect(rows).toHaveLength(4);
  });

  it("renders empty table body without crashing when data is empty", () => {
    render(<Table columns={columns} data={[]} />);

    const headers = screen.getAllByRole("columnheader");
    expect(headers).toHaveLength(4);

    const rows = screen.getAllByRole("row");
    // Only 1 header row
    expect(rows).toHaveLength(1);
  });

  it("handles null or undefined row values gracefully", () => {
    const dataWithMissingValues = [
      { id: "1", name: "Alice", amount: null, status: undefined },
    ];

    render(<Table columns={columns} data={dataWithMissingValues} />);
    const cells = screen.getAllByRole("cell");
    expect(cells[0]).toHaveTextContent("1");
    expect(cells[1]).toHaveTextContent("Alice");
    expect(cells[2]).toHaveTextContent("");
    expect(cells[3]).toHaveTextContent("");
  });

  it("renders custom ReactNode cell content", () => {
    const customData = [
      {
        id: "1",
        name: "Alice",
        amount: "50 XLM",
        status: <span data-testid="custom-badge">Active Badge</span>,
      },
    ];

    render(<Table columns={columns} data={customData} />);
    expect(screen.getByTestId("custom-badge")).toBeInTheDocument();
    expect(screen.getByTestId("custom-badge")).toHaveTextContent("Active Badge");
  });

  describe("column alignments", () => {
    it("applies correct alignment classes to headers and cells", () => {
      render(<Table columns={columns} data={sampleData.slice(0, 1)} />);

      const headers = screen.getAllByRole("columnheader");
      // col 0 (default alignment): text-left
      expect(headers[0]).toHaveClass("text-left");
      // col 1 (explicit left): text-left
      expect(headers[1]).toHaveClass("text-left");
      // col 2 (explicit right): text-right
      expect(headers[2]).toHaveClass("text-right");
      // col 3 (explicit center): text-center
      expect(headers[3]).toHaveClass("text-center");

      const cells = screen.getAllByRole("cell");
      expect(cells[0]).toHaveClass("text-left");
      expect(cells[1]).toHaveClass("text-left");
      expect(cells[2]).toHaveClass("text-right");
      expect(cells[3]).toHaveClass("text-center");
    });
  });

  describe("alternating row background styling", () => {
    it("applies alternating background classes to rows", () => {
      render(<Table columns={columns} data={sampleData} />);

      const rows = screen.getAllByRole("row");
      // row[0] is header; row[1] is index 0 (even), row[2] is index 1 (odd), row[3] is index 2 (even)
      expect(rows[1]).toHaveClass("bg-white");
      expect(rows[2]).toHaveClass("bg-gray-50");
      expect(rows[3]).toHaveClass("bg-white");
    });
  });

  describe("interactions and row clicks", () => {
    it("does not apply cursor-pointer or hover styles when onRowClick is not provided", () => {
      render(<Table columns={columns} data={sampleData.slice(0, 1)} />);
      const dataRow = screen.getAllByRole("row")[1];
      expect(dataRow).not.toHaveClass("cursor-pointer");
    });

    it("applies cursor-pointer and calls onRowClick with row data when clicked", async () => {
      const onRowClick = vi.fn();
      render(
        <Table
          columns={columns}
          data={sampleData}
          onRowClick={onRowClick}
        />,
      );

      const rows = screen.getAllByRole("row");
      const firstDataRow = rows[1];
      expect(firstDataRow).toHaveClass("cursor-pointer");

      await userEvent.click(firstDataRow);
      expect(onRowClick).toHaveBeenCalledTimes(1);
      expect(onRowClick).toHaveBeenCalledWith(sampleData[0]);

      const secondDataRow = rows[2];
      await userEvent.click(secondDataRow);
      expect(onRowClick).toHaveBeenCalledTimes(2);
      expect(onRowClick).toHaveBeenCalledWith(sampleData[1]);
    });
  });

  describe("accessibility attributes", () => {
    it("uses semantic table structure (table, thead, tbody, row, columnheader, cell)", () => {
      render(<Table columns={columns} data={sampleData.slice(0, 1)} />);

      expect(screen.getByRole("table")).toBeInTheDocument();
      expect(screen.getAllByRole("columnheader")).toHaveLength(4);
      expect(screen.getAllByRole("row")).toHaveLength(2);
      expect(screen.getAllByRole("cell")).toHaveLength(4);
    });
  });
});
