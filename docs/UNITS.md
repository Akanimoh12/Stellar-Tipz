# Monetary Units Convention (Stroops)

> Established for issue #088 — mixing stroop/XML units between layers is a
> classic financial bug, and JavaScript `number`s lose precision above
> `2**53`, which a large XLM balance in stroops exceeds.

## Rule

**Stroops are the canonical unit. They are always `bigint` (or `string` on the
wire) at every API and database boundary. They are never `number`/`float`.**

- **API responses**: serialise stroop amounts as **strings** (e.g.
  `"amountStroops": "1000000"`). This preserves precision through JSON, which
  has no integer type.
- **Database**: stored as the Prisma/Postgres `BigInt` type.
- **Internal computation**: `bigint` arithmetic only. No `Number()` coercion,
  no division that yields a float, no `parseFloat`.
- **Variable names carry units**: prefer `amountStroops`, `feeStroops`,
  `totalVolumeStroops` over bare `amount`. The suffix makes the unit
  unambiguous at every call site.
- **Conversion**: `1 XLM = 10_000_000 stroops` (`STROOPS_PER_XLM` in
  `src/common/validation/stroops.ts`). Convert explicitly and document it.

## Validation

All inbound stroop amounts must pass through `parseStroops` (or the
`stroopAmountSchema` zod schema) in `src/common/validation/stroops.ts`. It
rejects:

- non-integers (floats, decimal strings),
- negative values,
- zero where a positive amount is required (`allowZero` opts in),
- values above `MAX_STROOP_AMOUNT` (`2**63 - 1`, the int64 ceiling).

The same `MAX_STROOP_AMOUNT` bound is applied to the `WITHDRAWAL_MIN_AMOUNT_STROOPS`
and `PAYOUT_MIN_AMOUNT_STROOPS` environment variables, which are parsed as
`bigint`.

## Rationale

`Number.MAX_SAFE_INTEGER` is `2**53 - 1`. A creator holding even a few XLM in
stroops (`amount * 10_000_000`) can exceed this, and the fractional part of a
`number` would then be rounded — a silent 10⁷-class error. `bigint` has no such
limit and no decimal component, so it is the only safe representation.
