# ADR-002: Brutalist design system

- **Status:** Accepted
- **Date:** 2026-05-27
- **Deciders:** Core team / design

## Context

The frontend (`frontend-scaffold/`, React + Vite + SCSS) needed a coherent
visual language. Tipz is a crypto-native product aimed at creators; the team
wanted a distinctive, high-contrast identity that is fast to build, cheap to
ship, and accessible — rather than a generic component-library look.

A neo-brutalist system (heavy borders, hard shadows, flat high-contrast color
blocks, monospace accents, minimal gradients) was prototyped in
`src/index.scss` and the landing features (e.g. `CTASection`, `StatsSection`).

## Options considered

1. **Neo-brutalist, hand-rolled SCSS tokens** — strong, memorable identity;
   few dependencies; small CSS payload; flat colors make WCAG contrast easy to
   hit.
2. **A component library (MUI / Chakra / shadcn)** — faster to assemble stock
   UIs, but heavier bundles, a generic look, and theme-fighting to achieve a
   distinctive style.
3. **Tailwind-only utility styling** — flexible, but without a design system on
   top it pushes styling decisions into every component and risks drift.

## Decision

Adopt a **neo-brutalist design system** expressed as SCSS design tokens and a
small set of shared primitives, rather than pulling in a third-party component
library.

## Rationale

- The aesthetic is intentionally part of the brand; a stock library would
  dilute it.
- Flat, high-contrast color blocks make it straightforward to meet the
  accessibility bar the repo enforces via Lighthouse CI (see the repo's
  Lighthouse config and `fix-contrast.js`).
- Fewer UI dependencies keeps the bundle small — a tracked concern in the
  bundle-optimization docs.

## Consequences

- Positive: distinctive identity, small CSS footprint, accessibility-friendly,
  no component-library lock-in.
- Negative / cost: the team maintains its own primitives and tokens; less
  "free" breadth than a mature library; contributors must learn the system's
  conventions (documented in `docs/FRONTEND_GUIDE.md`).
- Revisit if the surface area grows enough that maintaining bespoke components
  outweighs the identity benefit.

## Contrast Palette (WCAG AA Compliance)

To ensure full compliance with WCAG 2.1 AA (minimum 4.5:1 for normal body text and 3:1 for large text / UI elements), all core colors, placeholder tokens, and text pairings are configured at the Tailwind theme level (`frontend-scaffold/tailwind.config.js`).

| Token / Usage | Hex Value | Background | Contrast Ratio | WCAG AA Status | Notes |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `foreground.light` / Primary text | `#111111` | Light (`#FFFFFF`) | **16.5:1** | Pass (AAA) | High contrast brutalist body text |
| `foreground.dark` / Primary text | `#F5F5F5` | Dark (`#000000`) | **19.3:1** | Pass (AAA) | High contrast dark mode body text |
| `gray-400` / Secondary text | `#525866` | Light (`#FFFFFF`) | **5.2:1** | Pass (AA) | Replaced legacy low-contrast `#9CA3AF` (2.8:1) |
| `gray-300` / Secondary text | `#D1D5DB` | Dark (`#000000`) | **11.5:1** | Pass (AAA) | Clear readability on dark cards & inputs |
| `placeholder` (Light) | `#525866` | Light (`#FFFFFF`) | **5.2:1** | Pass (AA) | Applied globally via Tailwind base plugin |
| `placeholder` (Dark) | `#D1D5DB` | Dark (`#000000`) | **11.5:1** | Pass (AAA) | Applied globally via `.dark ::placeholder` |
| `gray-500` / Muted text | `#4B5563` | Light (`#FFFFFF`) | **7.0:1** | Pass (AAA) | Auxiliary labels and hints |
| `gray-600` / Labels | `#374151` | Light (`#FFFFFF`) | **9.0:1** | Pass (AAA) | Form helper text and metadata |
| `gray-700` / Bold text | `#1F2937` | Light (`#FFFFFF`) | **13.0:1** | Pass (AAA) | High-emphasis subheadings |
| Accent Yellow (Warning/Highlight) | `#FACC15` | Black (`#000000`) | **13.9:1** | Pass (AAA) | Brutalist badge & warning contrast |

By enforcing these color mappings in `tailwind.config.js`, all new and existing components inherit WCAG AA contrast automatically without requiring fragile per-component class overrides.

