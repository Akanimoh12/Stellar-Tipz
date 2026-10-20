import { useEffect } from "react";

interface PreloadOptions {
  srcSet?: string;
  sizes?: string;
  type?: string;
}

/** Preload the same responsive candidate as the image, not its full-size original. */
export function useHeroPreload(
  heroSrc?: string,
  options: PreloadOptions = {},
): void {
  const { srcSet, sizes, type } = options;
  useEffect(() => {
    if (!heroSrc) return;
    const existing = Array.from(
      document.querySelectorAll<HTMLLinkElement>(
        'link[rel="preload"][as="image"]',
      ),
    ).some(
      (link) =>
        link.getAttribute("href") === heroSrc &&
        link.getAttribute("imagesrcset") === (srcSet ?? null) &&
        link.getAttribute("imagesizes") === (srcSet && sizes ? sizes : null) &&
        link.getAttribute("type") === (type ?? null),
    );
    if (existing) return;
    const link = document.createElement("link");
    link.rel = "preload";
    link.setAttribute("as", "image");
    link.href = heroSrc;
    if (srcSet) link.setAttribute("imagesrcset", srcSet);
    if (srcSet && sizes) link.setAttribute("imagesizes", sizes);
    if (type) link.type = type;
    link.setAttribute("fetchpriority", "high");
    document.head.appendChild(link);
    return () => link.remove();
  }, [heroSrc, srcSet, sizes, type]);
}
