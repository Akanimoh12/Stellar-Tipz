import { render, screen, act, fireEvent } from "@testing-library/react";
import { axe, toHaveNoViolations } from "jest-axe";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import LazyImage from "../LazyImage";

expect.extend(toHaveNoViolations);

type ObserverCallback = (entries: IntersectionObserverEntry[]) => void;

let observerCallbacks: ObserverCallback[] = [];

class ControlledIntersectionObserver implements IntersectionObserver {
  readonly root = null;
  readonly rootMargin = "";
  readonly thresholds = [];

  constructor(private readonly callback: ObserverCallback) {
    observerCallbacks.push(callback);
  }

  disconnect(): void {
    observerCallbacks = observerCallbacks.filter((cb) => cb !== this.callback);
  }
  observe(): void {}
  unobserve(): void {}
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
}

const triggerIntersect = (isIntersecting: boolean): void => {
  const entry = {
    isIntersecting,
    target: document.createElement("div"),
  } as unknown as IntersectionObserverEntry;
  act(() => {
    for (const cb of [...observerCallbacks]) {
      cb([entry]);
    }
  });
};

describe("LazyImage", () => {
  beforeEach(() => {
    observerCallbacks = [];
    vi.stubGlobal("IntersectionObserver", ControlledIntersectionObserver);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders placeholder before the image is visible", () => {
    render(
      <LazyImage
        width={640}
        height={320}
        src="/img/hero.jpg"
        placeholder="/img/hero-blur.jpg"
        alt="hero"
      />,
    );

    const img = screen.getByRole("img", { name: "hero" });
    expect(img).toHaveAttribute("src", "/img/hero-blur.jpg");
    expect(img).toHaveAttribute("loading", "lazy");
  });

  it("swaps to the real src when the observer fires", () => {
    render(
      <LazyImage
        width={640}
        height={320}
        src="/img/hero.jpg"
        placeholder="/img/hero-blur.jpg"
        alt="hero"
      />,
    );

    triggerIntersect(true);

    const img = screen.getByRole("img", { name: "hero" });
    expect(img).toHaveAttribute("src", "/img/hero.jpg");
  });

  it("uses eager loading when priority=true", () => {
    render(
      <LazyImage
        width={640}
        height={320}
        src="/img/hero.jpg"
        priority
        alt="hero"
      />,
    );

    const img = screen.getByRole("img", { name: "hero" });
    expect(img).toHaveAttribute("loading", "eager");
    expect(img).toHaveAttribute("src", "/img/hero.jpg");
  });

  it("withholds responsive candidates until visible and resets for a new source", () => {
    const { rerender } = render(
      <LazyImage
        src="/one.jpg"
        srcSet="/one-small.jpg 320w"
        sizes="320px"
        width={640}
        height={320}
        alt="photo"
      />,
    );
    expect(screen.getByRole("img")).not.toHaveAttribute("srcset");
    triggerIntersect(true);
    expect(screen.getByRole("img")).toHaveAttribute(
      "srcset",
      "/one-small.jpg 320w",
    );
    fireEvent.load(screen.getByRole("img"));
    expect(screen.getByRole("img")).toHaveStyle({ filter: "none" });
    rerender(
      <LazyImage
        src="/two.jpg"
        srcSet="/two-small.jpg 320w"
        width={640}
        height={320}
        alt="photo"
      />,
    );
    expect(screen.getByRole("img")).not.toHaveAttribute("srcset");
    expect(screen.getByRole("img")).toHaveStyle({ filter: "blur(8px)" });
    triggerIntersect(true);
    expect(screen.getByRole("img")).toHaveAttribute("src", "/two.jpg");
  });

  it("passes axe checks with descriptive alternative text", async () => {
    const { container } = render(
      <LazyImage
        width={640}
        height={320}
        src="/img/hero.jpg"
        placeholder="/img/hero-blur.jpg"
        alt="A sunset over the coast"
      />,
    );

    expect(await axe(container)).toHaveNoViolations();
  });

  it("announces loading and error states for assistive tech", () => {
    render(
      <LazyImage
        src="/error.jpg"
        width={640}
        height={320}
        alt="A sunset over the coast"
        placeholder="/placeholder.jpg"
      />,
    );

    expect(screen.getByRole("status", { name: /loading a sunset over the coast/i })).toBeInTheDocument();
    fireEvent.error(screen.getByRole("img", { name: "A sunset over the coast" }));
    expect(screen.getByRole("alert", { name: /failed to load a sunset over the coast/i })).toBeInTheDocument();
  });

  it("loads without IntersectionObserver support", () => {
    vi.stubGlobal("IntersectionObserver", undefined);
    render(<LazyImage src="/one.jpg" width={640} height={320} alt="photo" />);
    expect(screen.getByRole("img")).toHaveAttribute("src", "/one.jpg");
  });
});
