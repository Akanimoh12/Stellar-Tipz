import { describe, expect, it } from "vitest";
import { formatNumber, formatPlural } from "../locale";
describe("i18n formatters", () => {
  it("formats numbers with locale awareness", () => { expect(formatNumber(1234.56, "en")).toBe("1,234.56"); });
  it("formats plural rules correctly", () => {
    const one = formatPlural(1, { one: "{{count}} tip", other: "{{count}} tips" }, "en");
    const many = formatPlural(5, { one: "{{count}} tip", other: "{{count}} tips" }, "en");
    expect(one).toContain("1"); expect(many).toContain("5");
  });
});
