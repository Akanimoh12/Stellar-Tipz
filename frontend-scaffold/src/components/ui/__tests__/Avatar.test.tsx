import { fireEvent, render, screen } from "@testing-library/react";
import { axe, toHaveNoViolations } from "jest-axe";
import { describe, expect, it } from "vitest";

import Avatar from "../Avatar";

expect.extend(toHaveNoViolations);

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

  it("passes axe checks with descriptive alt text and status announcements", async () => {
    const { container } = render(
      <Avatar
        src="https://example.com/avatar.png"
        alt="Jane Doe's profile picture"
        fallback="Jane"
        size="lg"
      />,
    );

    expect(await axe(container)).toHaveNoViolations();
  });

  it("shows a skeleton placeholder until the avatar image loads", () => {
    const { queryByTestId } = render(
      <Avatar
        src="https://example.com/avatar.png"
        alt="Creator profile picture"
        fallback="Creator"
        size="md"
      />,
    );

    expect(queryByTestId("avatar-placeholder")).toBeInTheDocument();
    expect(screen.getByRole("status", { name: /loading creator profile picture/i })).toBeInTheDocument();
    fireEvent.load(screen.getByRole("img", { name: "Creator profile picture" }));
    expect(queryByTestId("avatar-placeholder")).not.toBeInTheDocument();
  });

  it("uses descriptive alt text for profile imagery and announces image failures", () => {
    render(
      <Avatar
        src="https://example.com/broken.png"
        alt="Jane Doe's profile picture"
        fallback="Jane"
        size="md"
      />,
    );

    const img = screen.getByRole("img", { name: "Jane Doe's profile picture" });
    expect(img).toHaveAttribute("alt", "Jane Doe's profile picture");
    fireEvent.error(img);
    expect(screen.getByRole("alert", { name: /failed to load jane doe's profile picture/i })).toBeInTheDocument();
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
