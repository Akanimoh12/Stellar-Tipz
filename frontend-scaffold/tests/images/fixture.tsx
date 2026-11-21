import React from "react";
import { createRoot } from "react-dom/client";
import OptimizedImage from "../../src/components/ui/optimizedImage";
import LazyImage from "../../src/components/shared/LazyImage";

const srcSet = (format: string) =>
  [320, 640, 1280]
    .map((width) => `/hero-${width}.${format} ${width}w`)
    .join(", ");
createRoot(document.getElementById("root")!).render(
  <main>
    <h1>Responsive image delivery</h1>
    <OptimizedImage
      src="/hero-1280.jpg"
      alt="Hero fixture"
      width={640}
      height={320}
      priority
      sources={[{ type: "image/webp", srcSet: srcSet("webp") }]}
      srcSet={srcSet("jpg")}
      sizes="(max-width: 640px) 100vw, 640px"
      style={{ width: "100%", maxWidth: 640, height: "auto" }}
    />
    <div style={{ height: 5000 }} />
    <LazyImage
      src="/below.webp"
      alt="Below fold fixture"
      width={320}
      height={160}
    />
  </main>,
);
