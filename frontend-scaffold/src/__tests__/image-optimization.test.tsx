import React from "react";
import { render, cleanup, fireEvent } from "@testing-library/react";
import { afterEach, describe, it, expect, vi } from "vitest";
import OptimizedImage from "../components/ui/optimizedImage";
import { useHeroPreload } from "../hooks/useHeroPreload";

afterEach(() => {
  cleanup();
  document
    .querySelectorAll('link[rel="preload"][as="image"]')
    .forEach((el) => el.remove());
});
const hero = "https://example.com/hero.png?version=2";

describe("Image optimization", () => {
  it("uses real resize URLs, with WebP and proportional JPEG candidates", () => {
    const { container, getByRole } = render(
      <OptimizedImage
        src={hero}
        alt="Hero"
        width={640}
        height={320}
        priority
      />,
    );
    const source = container.querySelector('source[type="image/webp"]')!;
    const candidate = new URL(source.getAttribute("srcset")!.split(" ")[0]);
    expect(candidate.searchParams.get("url")).toBe(hero);
    expect(candidate.searchParams.get("w")).toBe("320");
    expect(candidate.searchParams.get("h")).toBe("160");
    expect(candidate.searchParams.get("output")).toBe("webp");
    const img = getByRole("img");
    expect(img.getAttribute("srcset")).toContain("output=jpg");
    expect(img).toHaveAttribute("width", "640");
    expect(img).toHaveAttribute("height", "320");
    expect(img).toHaveAttribute("loading", "eager");
    expect(img).toHaveAttribute("fetchpriority", "high");
    const preload = document.querySelector('link[as="image"]')!;
    expect(preload.getAttribute("imagesrcset")).toBe(
      source.getAttribute("srcset"),
    );
    expect(preload.getAttribute("imagesizes")).toBe(
      source.getAttribute("sizes"),
    );
  });

  it("never invents local variants and lazy loads below-fold imagery", () => {
    const { container, getByRole } = render(
      <OptimizedImage
        src="/img/existing.png"
        alt="Local"
        width={320}
        height={160}
      />,
    );
    expect(container.querySelector("source")).toBeNull();
    expect(getByRole("img")).not.toHaveAttribute("srcset");
    expect(getByRole("img")).toHaveAttribute("loading", "lazy");
    expect(document.querySelector('link[as="image"]')).toBeNull();
  });

  it("uses explicitly provided AVIF and WebP local variants", () => {
    const sources = [
      { type: "image/avif", srcSet: "/hero-320.avif 320w" },
      { type: "image/webp", srcSet: "/hero-320.webp 320w" },
    ];
    const { container } = render(
      <OptimizedImage
        src="/hero.jpg"
        alt="Hero"
        width={320}
        height={160}
        sources={sources}
        srcSet="/hero-320.jpg 320w"
        priority
      />,
    );
    expect(container.querySelectorAll("source")).toHaveLength(2);
    expect(document.querySelectorAll('link[as="image"]')).toHaveLength(1);
    expect(document.querySelector('link[as="image"]')).toHaveAttribute(
      "type",
      "image/avif",
    );
  });

  it("falls back to the original once, then forwards an error; new sources reset fallback", () => {
    const onError = vi.fn();
    const { container, getByRole, rerender } = render(
      <OptimizedImage
        src={hero}
        alt="Hero"
        width={640}
        height={320}
        onError={onError}
      />,
    );
    fireEvent.error(getByRole("img"));
    expect(container.querySelector("source")).toBeNull();
    expect(getByRole("img")).not.toHaveAttribute("srcset");
    expect(getByRole("img")).toHaveAttribute("src", hero);
    expect(onError).not.toHaveBeenCalled();
    fireEvent.error(getByRole("img"));
    expect(onError).toHaveBeenCalledOnce();
    rerender(
      <OptimizedImage
        src="https://example.com/other.png"
        alt="Hero"
        width={640}
        height={320}
      />,
    );
    expect(container.querySelector("source")).not.toBeNull();
  });

  it("keeps blob previews local", () => {
    const { container } = render(
      <OptimizedImage
        src="blob:preview"
        alt="Preview"
        width={640}
        height={80}
      />,
    );
    expect(container.querySelector("source")).toBeNull();
  });

  it("does not let unrelated preloads suppress a hero, and cleans up only its own link", () => {
    const existing = document.createElement("link");
    existing.rel = "preload";
    existing.setAttribute("as", "image");
    existing.href = "/other.png";
    document.head.appendChild(existing);
    function Harness({ src }: { src: string }) {
      useHeroPreload(src);
      return null;
    }
    const { rerender, unmount } = render(<Harness src="/hero.png" />);
    expect(document.querySelectorAll('link[as="image"]')).toHaveLength(2);
    rerender(<Harness src="/changed.jpg" />);
    expect(document.querySelector('link[href="/hero.png"]')).toBeNull();
    expect(
      document.querySelector('link[href="/changed.jpg"]'),
    ).not.toHaveAttribute("type");
    unmount();
    expect(document.querySelectorAll('link[as="image"]')).toHaveLength(1);
    expect(document.head.contains(existing)).toBe(true);
  });
});
