import { describe, expect, it } from "vitest";
describe("i18n completeness", () => {
  it("all user-facing strings in en.json are non-empty", () => {
    const en = require("../en.json");
    const checkStrings = (obj: Record<string, unknown>): void => {
      for (const [key, value] of Object.entries(obj)) {
        if (typeof value === "string") expect(value.trim().length).toBeGreaterThan(0);
        else if (typeof value === "object" && value !== null) checkStrings(value as Record<string, unknown>);
      }
    };
    checkStrings(en);
  });
});
