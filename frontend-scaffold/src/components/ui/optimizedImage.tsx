import React, { useState } from "react";
import { normalizeAvatarSrc } from "../../helpers/avatarImage";
import { imageSrcSet, ImageSource } from "../../helpers/imageDelivery";
import { useHeroPreload } from "../../hooks/useHeroPreload";

interface OptimizedImageProps
  extends React.ImgHTMLAttributes<HTMLImageElement> {
  src: string;
  alt: string;
  width: number;
  height: number;
  priority?: boolean;
  /** Actual generated local variants, in preferred format order (AVIF, WebP). */
  sources?: ImageSource[];
}

const OptimizedImage: React.FC<OptimizedImageProps> = (props) => (
  <ImageContent key={props.src} {...props} />
);

const ImageContent: React.FC<OptimizedImageProps> = ({
  src,
  alt,
  width,
  height,
  priority = false,
  sources,
  srcSet,
  sizes = `(max-width: ${width}px) 100vw, ${width}px`,
  onError,
  ...rest
}) => {
  const [failed, setFailed] = useState(false);
  const normalizedSrc = normalizeAvatarSrc(src) ?? src;
  const widths = [...new Set([320, 640, 1024, width, width * 2])]
    .filter((value) => value <= width * 2)
    .sort((a, b) => a - b);
  const webp = imageSrcSet(normalizedSrc, widths, width / height, "webp");
  const variants = failed
    ? []
    : sources ?? (webp ? [{ type: "image/webp", srcSet: webp }] : []);
  const fallbackSet = failed
    ? undefined
    : srcSet ?? imageSrcSet(normalizedSrc, widths, width / height, "jpg");
  const preferred = variants[0];
  useHeroPreload(priority && !failed ? normalizedSrc : undefined, {
    srcSet: preferred?.srcSet ?? fallbackSet,
    sizes,
    type: preferred?.type,
  });
  return (
    <picture>
      {variants.map((source) => (
        <source key={source.type} {...source} sizes={sizes} />
      ))}
      <img
        {...rest}
        src={normalizedSrc}
        srcSet={fallbackSet}
        sizes={fallbackSet ? sizes : undefined}
        alt={alt}
        width={width}
        height={height}
        loading={priority ? "eager" : "lazy"}
        {...{ fetchpriority: priority ? "high" : "auto" }}
        decoding="async"
        onError={(event) => {
          if (!failed && (variants.length || fallbackSet)) setFailed(true);
          else onError?.(event);
        }}
      />
    </picture>
  );
};
export default OptimizedImage;
