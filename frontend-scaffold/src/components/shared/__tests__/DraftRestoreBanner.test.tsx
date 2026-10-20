import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import DraftRestoreBanner from "../DraftRestoreBanner";

describe("DraftRestoreBanner", () => {
  it("renders age and ttl copy", () => {
    render(
      <DraftRestoreBanner
        savedAt={Date.now() - 5 * 60_000}
        onRestore={vi.fn()}
        onDiscard={vi.fn()}
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent(/saved draft/i);
    expect(screen.getByRole("status")).toHaveTextContent(/5 minutes ago/);
    expect(screen.getByRole("status")).toHaveTextContent(/1 day/);
  });

  it("calls onRestore when the restore button is clicked", () => {
    const onRestore = vi.fn();
    const onDiscard = vi.fn();
    render(
      <DraftRestoreBanner
        savedAt={Date.now()}
        onRestore={onRestore}
        onDiscard={onDiscard}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /restore draft/i }));
    expect(onRestore).toHaveBeenCalledTimes(1);
    expect(onDiscard).not.toHaveBeenCalled();
  });

  it("calls onDiscard when the discard button is clicked", () => {
    const onRestore = vi.fn();
    const onDiscard = vi.fn();
    render(
      <DraftRestoreBanner
        savedAt={Date.now()}
        onRestore={onRestore}
        onDiscard={onDiscard}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /discard/i }));
    expect(onDiscard).toHaveBeenCalledTimes(1);
    expect(onRestore).not.toHaveBeenCalled();
  });
});
