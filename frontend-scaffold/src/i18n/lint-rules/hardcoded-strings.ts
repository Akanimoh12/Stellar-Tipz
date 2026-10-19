import type { Rule } from "eslint";
const RULE_ID = "i18n/hardcoded-strings";
const rule: Rule.RuleModule = {
  meta: { type: "suggestion", docs: { description: "Detects hardcoded user-facing strings that should be externalized via i18n", category: "Best Practices", recommended: "error" }, messages: { [RULE_ID]: "Hardcoded user-facing string found: '{{string}}'. Use i18n translation key instead." }, schema: [{ type: "object", properties: { ignorePatterns: { type: "array", items: { type: "string" } } }, additionalProperties: false }] },
  create(context) {
    const ignorePatterns = context.options[0]?.ignorePatterns || ["className", "id", "htmlFor", "name", "type", "role", "aria-label", "aria-describedby", "aria-labelledby", "aria-controls", "aria-selected", "aria-expanded", "aria-haspopup", "aria-live", "aria-invalid", "alt", "title", "placeholder", "src", "href", "target", "rel", "download", "action", "method", "data-testid", "value", "label", "kind", "variant", "size", "color", "bg", "text", "border", "shadow", "transition", "duration", "delay", "state", "status", "loading", "disabled", "error", "helperText", "message"];
    function isIgnored(value: string): boolean { return ignorePatterns.some((p) => value.includes(p)); }
    function isJsxText(node: Rule.Node): boolean { let current = node.parent; while (current) { if (current.type === "JSXText") return true; if (current.type === "JSXExpressionContainer") return false; current = current.parent; } return false; }
    return {
      Literal(node: Rule.Node) {
        const lit = node as Rule.Literal;
        if (typeof lit.value !== "string" || lit.value.trim().length < 2 || isJsxText(node)) return;
        const parent = node.parent;
        if (parent?.type === "Property") { const key = parent.key as Rule.Identifier; if (key && ignorePatterns.some((p) => key.name === p)) return; }
        if (isIgnored(lit.value.trim())) return;
        context.report({ node, messageId: RULE_ID, data: { string: lit.value.trim().substring(0, 50) } });
      },
      JSXText(node: Rule.Node) {
        const text = node as Rule.JSXText;
        const value = text.value.trim();
        if (value.length < 2 || isIgnored(value)) return;
        const jsxParent = text.parent?.parent;
        if (jsxParent?.type === "JSXElement") { const tagName = (jsxParent.openingElement.name as Rule.JSXIdentifier).name; if (["i18n", "I18n", "Translate", "T", "useI18n"].includes(tagName)) return; }
        context.report({ node, messageId: RULE_ID, data: { string: value.substring(0, 50) } });
      },
    };
  },
};
export default rule;
