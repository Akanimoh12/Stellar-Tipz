import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Tabs from "../Tabs";

describe("Tabs", () => {
  const sampleTabs = [
    { id: "account", label: "Account", content: <div>Account Content</div> },
    { id: "password", label: "Password", content: <div>Password Content</div> },
    { id: "settings", label: "Settings", content: <div>Settings Content</div> },
  ];

  it("renders all tab buttons and the default (first) tab content", () => {
    render(<Tabs tabs={sampleTabs} />);

    expect(screen.getByRole("tablist")).toBeInTheDocument();

    const tabs = screen.getAllByRole("tab");
    expect(tabs).toHaveLength(3);
    expect(tabs[0]).toHaveTextContent("Account");
    expect(tabs[1]).toHaveTextContent("Password");
    expect(tabs[2]).toHaveTextContent("Settings");

    expect(screen.getByRole("tabpanel")).toHaveTextContent("Account Content");
    expect(screen.queryByText("Password Content")).not.toBeInTheDocument();
    expect(screen.queryByText("Settings Content")).not.toBeInTheDocument();
  });

  it("renders the content of defaultTab when specified", () => {
    render(<Tabs tabs={sampleTabs} defaultTab="password" />);

    expect(screen.getByRole("tabpanel")).toHaveTextContent("Password Content");
    expect(screen.queryByText("Account Content")).not.toBeInTheDocument();

    const passwordTab = screen.getByRole("tab", { name: "Password" });
    expect(passwordTab).toHaveAttribute("aria-selected", "true");
    expect(passwordTab).toHaveAttribute("tabindex", "0");
  });

  it("handles empty tabs array without crashing", () => {
    const { container } = render(<Tabs tabs={[]} />);
    expect(screen.getByRole("tablist")).toBeInTheDocument();
    expect(screen.queryAllByRole("tab")).toHaveLength(0);
    expect(container).toBeInTheDocument();
  });

  describe("mouse interactions", () => {
    it("switches active tab and panel content on tab click", async () => {
      render(<Tabs tabs={sampleTabs} />);

      const passwordTab = screen.getByRole("tab", { name: "Password" });
      await userEvent.click(passwordTab);

      expect(screen.getByRole("tabpanel")).toHaveTextContent("Password Content");
      expect(screen.queryByText("Account Content")).not.toBeInTheDocument();
      expect(passwordTab).toHaveAttribute("aria-selected", "true");

      const settingsTab = screen.getByRole("tab", { name: "Settings" });
      await userEvent.click(settingsTab);

      expect(screen.getByRole("tabpanel")).toHaveTextContent("Settings Content");
      expect(screen.queryByText("Password Content")).not.toBeInTheDocument();
      expect(settingsTab).toHaveAttribute("aria-selected", "true");
    });
  });

  describe("keyboard navigation", () => {
    it("moves to next tab with ArrowRight", () => {
      render(<Tabs tabs={sampleTabs} />);

      const accountTab = screen.getByRole("tab", { name: "Account" });
      accountTab.focus();

      fireEvent.keyDown(accountTab, { key: "ArrowRight" });

      const passwordTab = screen.getByRole("tab", { name: "Password" });
      expect(passwordTab).toHaveFocus();
      expect(passwordTab).toHaveAttribute("aria-selected", "true");
      expect(screen.getByRole("tabpanel")).toHaveTextContent("Password Content");
    });

    it("wraps around to the first tab when pressing ArrowRight on the last tab", () => {
      render(<Tabs tabs={sampleTabs} defaultTab="settings" />);

      const settingsTab = screen.getByRole("tab", { name: "Settings" });
      settingsTab.focus();

      fireEvent.keyDown(settingsTab, { key: "ArrowRight" });

      const accountTab = screen.getByRole("tab", { name: "Account" });
      expect(accountTab).toHaveFocus();
      expect(accountTab).toHaveAttribute("aria-selected", "true");
      expect(screen.getByRole("tabpanel")).toHaveTextContent("Account Content");
    });

    it("moves to previous tab with ArrowLeft", () => {
      render(<Tabs tabs={sampleTabs} defaultTab="password" />);

      const passwordTab = screen.getByRole("tab", { name: "Password" });
      passwordTab.focus();

      fireEvent.keyDown(passwordTab, { key: "ArrowLeft" });

      const accountTab = screen.getByRole("tab", { name: "Account" });
      expect(accountTab).toHaveFocus();
      expect(accountTab).toHaveAttribute("aria-selected", "true");
      expect(screen.getByRole("tabpanel")).toHaveTextContent("Account Content");
    });

    it("wraps around to the last tab when pressing ArrowLeft on the first tab", () => {
      render(<Tabs tabs={sampleTabs} />);

      const accountTab = screen.getByRole("tab", { name: "Account" });
      accountTab.focus();

      fireEvent.keyDown(accountTab, { key: "ArrowLeft" });

      const settingsTab = screen.getByRole("tab", { name: "Settings" });
      expect(settingsTab).toHaveFocus();
      expect(settingsTab).toHaveAttribute("aria-selected", "true");
      expect(screen.getByRole("tabpanel")).toHaveTextContent("Settings Content");
    });

    it("ignores unrelated key events", () => {
      render(<Tabs tabs={sampleTabs} />);

      const accountTab = screen.getByRole("tab", { name: "Account" });
      accountTab.focus();

      fireEvent.keyDown(accountTab, { key: "Enter" });
      fireEvent.keyDown(accountTab, { key: "Tab" });

      expect(accountTab).toHaveAttribute("aria-selected", "true");
      expect(screen.getByRole("tabpanel")).toHaveTextContent("Account Content");
    });
  });

  describe("accessibility attributes (WAI-ARIA tabs pattern)", () => {
    it("sets correct ARIA attributes on tab buttons and tabpanel", () => {
      render(<Tabs tabs={sampleTabs} defaultTab="account" />);

      const accountTab = screen.getByRole("tab", { name: "Account" });
      const passwordTab = screen.getByRole("tab", { name: "Password" });
      const tabpanel = screen.getByRole("tabpanel");

      // Active tab attributes
      expect(accountTab).toHaveAttribute("id", "tab-account");
      expect(accountTab).toHaveAttribute("aria-controls", "tabpanel-account");
      expect(accountTab).toHaveAttribute("aria-selected", "true");
      expect(accountTab).toHaveAttribute("tabindex", "0");

      // Inactive tab attributes
      expect(passwordTab).toHaveAttribute("id", "tab-password");
      expect(passwordTab).toHaveAttribute("aria-controls", "tabpanel-password");
      expect(passwordTab).toHaveAttribute("aria-selected", "false");
      expect(passwordTab).toHaveAttribute("tabindex", "-1");

      // Tabpanel attributes
      expect(tabpanel).toHaveAttribute("id", "tabpanel-account");
      expect(tabpanel).toHaveAttribute("aria-labelledby", "tab-account");
    });
  });
});
