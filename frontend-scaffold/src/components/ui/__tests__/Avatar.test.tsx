import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import Avatar from "../Avatar";

describe("Avatar", () => {
  it("reserves intrinsic dimensions and lazy-loads by default", () => {
    render(
      <Avatar
        src="https://example.com/avatar.png"
        alt="Alice avatar"
        fallback="Alice"
        size="lg"
      />,
    );

    const img = screen.getByRole("img", { name: "Alice avatar" });
    expect(img).toHaveAttribute("width", "64");
    expect(img).toHaveAttribute("height", "64");
    expect(img).toHaveAttribute("loading", "lazy");
    expect(img).toHaveAttribute("decoding", "async");
  });

  it("loads eagerly when marked as priority", () => {
    render(
      <Avatar
        src="https://example.com/avatar.png"
        alt="Profile hero avatar"
        fallback="Alice"
        size="xl"
        priority
      />,
    );

    const img = screen.getByRole("img", { name: "Profile hero avatar" });
    expect(img).toHaveAttribute("loading", "eager");
    expect(img).toHaveAttribute("decoding", "sync");
  });

  it("shows a skeleton placeholder until the avatar image loads", () => {
    const { queryByTestId } = render(
      <Avatar
        src="https://example.com/avatar.png"
        alt="Creator avatar"
        fallback="Creator"
        size="md"
      />,
    );

    expect(queryByTestId("avatar-placeholder")).toBeInTheDocument();
    fireEvent.load(screen.getByRole("img", { name: "Creator avatar" }));
    expect(queryByTestId("avatar-placeholder")).not.toBeInTheDocument();
  });

  it("adds IPFS-responsive srcset candidates for creator avatars", () => {
    render(
      <Avatar
        src="ipfs://bafybeigdyrzt/avatar.png"
        alt="IPFS avatar"
        fallback="Creator"
        size="md"
      />,
    );

    const img = screen.getByRole("img", { name: "IPFS avatar" });
    expect(img).toHaveAttribute(
      "src",
      "https://ipfs.io/ipfs/bafybeigdyrzt/avatar.png",
    );
    expect(img.getAttribute("srcset")).toContain("https://images.weserv.nl/");
    expect(img).toHaveAttribute("sizes", "48px");
    expect(img.getAttribute("srcset")).toContain("output=jpg");
    expect(
      document
        .querySelector('source[type="image/webp"]')
        ?.getAttribute("srcset"),
    ).toContain("output=webp");
  });

  it("preloads the hero candidate and retries the original on proxy failure", () => {
    const { container, getByRole, rerender } = render(
      <Avatar
        src="ipfs://bafybeigdyrzt/avatar.png"
        alt="Hero"
        priority
        fallback="Alice"
      />,
    );
    const source = container.querySelector("source")!;
    expect(document.querySelector('link[as="image"]')).toHaveAttribute(
      "imagesrcset",
      source.getAttribute("srcset"),
    );
    fireEvent.error(getByRole("img"));
    expect(container.querySelector("source")).toBeNull();
    expect(getByRole("img")).not.toHaveAttribute("srcset");
    fireEvent.error(getByRole("img"));
    expect(container.querySelector("img")).toBeNull();
    rerender(
      <Avatar
        src="ipfs://bafybeigdyrzt/new.png"
        alt="Hero"
        priority
        fallback="Alice"
      />,
    );
    expect(container.querySelector("source")).not.toBeNull();
  });
});
