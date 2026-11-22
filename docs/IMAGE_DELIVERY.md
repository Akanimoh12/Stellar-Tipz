# Image delivery

IPFS gateways return original bytes. Creator avatars use the existing
`images.weserv.nl` resizing proxy at their rendered width and 2x width. A
`picture` WebP source sits above a responsive JPEG fallback. If the proxy
fails, the image retries the original gateway URL once; if that also fails,
the avatar displays its initials. No upload API or stored CID changes are required.

`OptimizedImage` applies the same delivery approach to remote profile banners
and hero imagery. It requires numeric width and height to reserve space.
Pass `sizes` matching the rendered CSS width. Local, blob and data URLs are
never sent to the proxy. Local variants must be provided explicitly through
`sources` (AVIF/WebP) and `srcSet` (fallback); filenames are never guessed.
The public proxy supports WebP, not AVIF. AVIF is supported for pre-generated
local sources. See https://wsrv.nl/docs/format.

Use `priority` only for above-the-fold imagery. `useHeroPreload` is called by
priority avatars and `OptimizedImage`, with the same candidates, sizes and
format as the picture. It no longer preloads a nonexistent `/img/hero.webp`.
The landing hero currently contains text and CSS, not a raster image.
Below-fold images use native lazy loading. `LazyImage` also waits for its
intersection observer before exposing either `src` or `srcSet`.

The proxy is a third-party dependency already used by avatars. Only public
image URLs should use it. An outage degrades to the original image (which can
be large). Upload previews remain local; bandwidth savings depend on a
successful proxy response. Do not append resizing parameters to an IPFS URL
and assume the gateway will resize it.

## Verification

From `frontend-scaffold`:

```sh
npm ci --legacy-peer-deps
npx vitest run --config vitest.images.config.ts
npx playwright install chromium
node tests/images/generate-fixtures.mjs
npx vite build --config tests/images/vite.config.ts
node tests/images/check-browser.mjs
```

From the repository root:

```sh
npx --yes @lhci/cli@0.14.0 autorun --config=.lighthouserc.images.json
```

`Image delivery audits` runs these checks on PRs without deployment credentials.
The fixture renders production image components with deterministic local raster
variants, so CI checks do not depend on gateway availability. Browser checks
verify selected widths at 320/768/1440px, one hero request and deferred
below-fold requests. Lighthouse enforces responsive sizing, modern formats,
explicit dimensions, offscreen loading and layout shift; errors fail CI.
These checks do not measure live IPFS/proxy availability or replace the full
application's performance audits. Screenshots and reports are CI artifacts.
