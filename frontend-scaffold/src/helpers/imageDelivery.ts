export interface ImageSource {
  type: string;
  srcSet: string;
}

/** Resize through the existing proxy; ordinary IPFS gateways cannot resize. */
export function imageSrcSet(
  src: string,
  widths: readonly number[],
  aspectRatio: number,
  format: "webp" | "jpg",
): string | undefined {
  if (!/^https?:\/\//i.test(src)) return undefined;
  return widths
    .map((width) => {
      const params = new URLSearchParams({
        url: src,
        w: String(width),
        h: String(Math.max(1, Math.round(width / aspectRatio))),
        fit: "cover",
        output: format,
        q: "80",
      });
      return `https://images.weserv.nl/?${params} ${width}w`;
    })
    .join(", ");
}
