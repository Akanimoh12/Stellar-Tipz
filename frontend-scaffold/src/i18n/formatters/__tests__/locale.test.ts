import { describe, expect, it } from "vitest";
import { formatNumber, formatCurrency, formatDate, formatRelativeTime, formatPlural } from "../locale";

describe("i18n formatters", () => {
  it("formats numbers with locale awareness", () => {
    const result = formatNumber(1234.56, "en");
    expect(result).toBe("1,234.56");
  });
  it("formats currency with locale awareness", () => {
    const result = formatCurrency(1234.56, "XLM", "en");
    expect(result).toContain("1,234.56");
  });
  it("formats dates with locale awareness", () => {
    const result = formatDate(new Date("2024-01-15"), "en");
    expect(result).toContain("January");
  });
  it("formats plural rules correctly", () => {
    const one = formatPlural(1, { one: "{{count}} tip", other: "{{count}} tips" }, "en");
    const many = formatPlural(5, { one: "{{count}} tip", other: "{{count}} tips" }, "en");
    expect(one).toContain("1"); expect(many).toContain("5");
  });
  
  describe("plural forms for all locales", () => {
    const locales = ["en", "es", "fr", "pt", "zh"];
    
    locales.forEach(locale => {
      it(`renders plural forms correctly for ${locale}`, () => {
        const singular = formatPlural(1, { one: "{{count}} item", other: "{{count}} items" }, locale);
        const plural = formatPlural(10, { one: "{{count}} item", other: "{{count}} items" }, locale);
        
        expect(singular).toContain("1");
        expect(plural).toContain("10");
        expect(singular).not.toBe(plural);
      });
    });
  });
});
