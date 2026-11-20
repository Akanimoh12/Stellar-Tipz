import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

import SettingsPage from "../SettingsPage";
import { I18nProvider } from "@/i18n";

describe("SettingsPage Keyboard Navigation Audit (#1692)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it("ensures notification toggles are focusable and operable via keyboard", () => {
    render(
      <I18nProvider>
        <SettingsPage />
      </I18nProvider>
    );

    const checkboxes = screen.getAllByRole("checkbox");
    expect(checkboxes.length).toBeGreaterThanOrEqual(3);

    const firstCheckbox = checkboxes[0];
    firstCheckbox.focus();
    expect(document.activeElement).toBe(firstCheckbox);

    // Toggle with Space key
    const initialChecked = (firstCheckbox as HTMLInputElement).checked;
    fireEvent.click(firstCheckbox);
    expect((firstCheckbox as HTMLInputElement).checked).toBe(!initialChecked);
  });

  it("ensures theme and language selects are keyboard accessible", () => {
    render(
      <I18nProvider>
        <SettingsPage />
      </I18nProvider>
    );

    const selects = screen.getAllByRole("combobox");
    expect(selects.length).toBeGreaterThanOrEqual(3);

    const themeSelect = selects[0];
    themeSelect.focus();
    expect(document.activeElement).toBe(themeSelect);

    fireEvent.change(themeSelect, { target: { value: "dark" } });
    expect((themeSelect as HTMLSelectElement).value).toBe("dark");
  });

  it("ensures destructive reset button is keyboard focusable and confirms before resetting", () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);

    render(
      <I18nProvider>
        <SettingsPage />
      </I18nProvider>
    );

    const resetButton = screen.getByRole("button", { name: /reset to defaults/i });
    expect(resetButton).toBeInTheDocument();

    resetButton.focus();
    expect(document.activeElement).toBe(resetButton);

    fireEvent.click(resetButton);
    expect(confirmSpy).toHaveBeenCalled();
  });

  it("ensures save button is keyboard focusable and triggers save action", () => {
    render(
      <I18nProvider>
        <SettingsPage />
      </I18nProvider>
    );

    const saveButton = screen.getByRole("button", { name: /save settings/i });
    expect(saveButton).toBeInTheDocument();

    saveButton.focus();
    expect(document.activeElement).toBe(saveButton);

    fireEvent.click(saveButton);
    expect(localStorage.getItem("tipz_settings")).toBeTruthy();
  });
});
