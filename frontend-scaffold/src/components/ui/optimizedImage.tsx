import React from 'react';

interface OptimizedImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  src: string;
  alt: string;
  width?: number;
  height?: number;
  priority?: boolean;
  className?: string;
}

const WIDTHS = [320, 640, 1024, 1920];

function toWebp(src: string): string {
  return src.replace(/\.(png|jpe?g)$/i, '.webp');
}

function buildSrcSet(src: string): string {
  const base = src.replace(/\.[^.]+$/, '');
  const ext = src.match(/\.[^.]+$/)?.[0] ?? '.webp';
  return WIDTHS.map((w) => `${base}-${w}${ext} ${w}w`).join(', ');
}

const OptimizedImage: React.FC<OptimizedImageProps> = ({
  src,
  alt,
  width,
  height,
  priority = false,
  className,
  sizes = '(max-width: 320px) 320px, (max-width: 640px) 640px, (max-width: 1024px) 1024px, 1920px',
  ...rest
}) => {
  const webpSrc = toWebp(src);

  return (
    <picture>
      <source type="image/webp" srcSet={buildSrcSet(webpSrc)} sizes={sizes} />
      <source srcSet={buildSrcSet(src)} sizes={sizes} />
      <img
        src={src}
        alt={alt}
        width={width}
        height={height}
        loading={priority ? 'eager' : 'lazy'}
        // @ts-expect-error fetchpriority not yet in React types
        fetchpriority={priority ? 'high' : 'auto'}
        decoding={priority ? 'sync' : 'async'}
        className={className}
        {...rest}
      />
    </picture>
  );
};

export default OptimizedImage;