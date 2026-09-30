import React, {
  CSSProperties,
  ImgHTMLAttributes,
  useEffect,
  useRef,
  useState,
} from "react";

export type LazyImageProps = Omit<
  ImgHTMLAttributes<HTMLImageElement>,
  "src" | "loading"
> & {
  src: string;
  width: number;
  height: number;
  placeholder?: string;
  /** Force eager loading (e.g. for above-the-fold hero images). */
  priority?: boolean;
  rootMargin?: string;
  /** Fired the first time the image source switches from placeholder to real src. */
  onVisible?: () => void;
};

const FALLBACK_TRANSPARENT_PIXEL =
  "data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=";

const LazyImage: React.FC<LazyImageProps> = (props) => (
  <LazyImageContent key={`${props.src}:${props.priority}`} {...props} />
);

const LazyImageContent: React.FC<LazyImageProps> = ({
  src,
  placeholder,
  priority = false,
  rootMargin = "200px",
  alt = "",
  onLoad,
  onVisible,
  style,
  className,
  srcSet,
  sizes,
  ...rest
}) => {
  const initialSrc = priority ? src : placeholder ?? FALLBACK_TRANSPARENT_PIXEL;
  const [currentSrc, setCurrentSrc] = useState<string>(initialSrc);
  const [loaded, setLoaded] = useState(false);
  const imgRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    if (priority) {
      return;
    }

    const node = imgRef.current;
    if (!node) {
      return;
    }

    if (typeof IntersectionObserver === "undefined") {
      // No observer support: load immediately.
      setCurrentSrc(src);
      onVisible?.();
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setCurrentSrc(src);
            onVisible?.();
            observer.disconnect();
            break;
          }
        }
      },
      { rootMargin },
    );

    observer.observe(node);
    return () => {
      observer.disconnect();
    };
  }, [priority, src, rootMargin, onVisible]);

  const isRealImage = currentSrc === src;
  const blurStyle: CSSProperties =
    !isRealImage || !loaded
      ? { filter: "blur(8px)", transition: "filter 200ms ease-out" }
      : { filter: "none", transition: "filter 200ms ease-out" };

  return (
    <img
      {...rest}
      ref={imgRef}
      src={currentSrc}
      srcSet={isRealImage ? srcSet : undefined}
      sizes={isRealImage ? sizes : undefined}
      alt={alt}
      loading={priority ? "eager" : "lazy"}
      {...{ fetchpriority: priority ? "high" : "auto" }}
      decoding="async"
      className={className}
      style={{ ...blurStyle, ...style }}
      onLoad={(event) => {
        if (isRealImage) {
          setLoaded(true);
        }
        onLoad?.(event);
      }}
    />
  );
};

export default LazyImage;
