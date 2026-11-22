import i18n from "./config";
export function formatNumber(value: number, language?: string): string {
  const lng = language ?? i18n.language;
  return new Intl.NumberFormat(lng, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
}
export function formatCurrency(amount: number, currency = "XLM", language?: string): string {
  const lng = language ?? i18n.language;
  return new Intl.NumberFormat(lng, { style: "currency", currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount);
}
export function formatDate(date: Date | string, language?: string, options?: Intl.DateTimeFormatOptions): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const lng = language ?? i18n.language;
  return new Intl.DateTimeFormat(lng, { year: "numeric", month: "long", day: "numeric", ...options }).format(d);
}
export function formatRelativeTime(value: number, unit: Intl.RelativeTimeFormatUnit, language?: string): string {
  const lng = language ?? i18n.language;
  return new Intl.RelativeTimeFormat(lng, { numeric: "auto" }).format(value, unit);
}
export function formatPlural(count: number, translations: Record<string, string>, language?: string): string {
  const lng = language ?? i18n.language;
  const rule = new Intl.PluralRules(lng).select(count);
  return translations[rule] ?? translations.other ?? translations.one ?? "";
}
