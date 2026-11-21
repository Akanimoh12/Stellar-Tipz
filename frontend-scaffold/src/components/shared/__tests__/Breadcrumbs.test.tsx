import React from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe, toHaveNoViolations } from "jest-axe";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { describe, expect, it } from "vitest";

import Breadcrumbs, { type BreadcrumbItem } from "../Breadcrumbs";

expect.extend(toHaveNoViolations);

const wcag21AaConfig = {
  runOnly: {
    type: "tag" as const,
    values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"],
  },
};

const threeItems: BreadcrumbItem[] = [
  { label: "Home", href: "/" },
  { label: "Profile", href: "/profile" },
  { label: "Edit profile" },
];

const fiveItems: BreadcrumbItem[] = [
  { label: "Home", href: "/" },
  { label: "Creators", href: "/creators" },
  { label: "Alice", href: "/@alice" },
  { label: "Tips", href: "/@alice/tips" },
  { label: "Tip #42" },
];

const LocationDisplay = () => {
  const location = useLocation();
  return <output aria-label="Current path">{location.pathname}</output>;
};

const renderBreadcrumbs = (
  items: BreadcrumbItem[],
  props: { className?: string; initialPath?: string } = {},
) =>
  render(
    <MemoryRouter initialEntries={[props.initialPath ?? "/start"]}>
      <Breadcrumbs items={items} className={props.className} />
      <Routes>
        <Route path="*" element={<LocationDisplay />} />
      </Routes>
    </MemoryRouter>,
  );

const getItems = () =>
  within(screen.getByRole("navigation", { name: "Breadcrumb" })).getAllByRole(
    "listitem",
  );

const readJsonLd = (container: HTMLElement) =>
  JSON.parse(
    container.querySelector('script[type="application/ld+json"]')!.textContent!,
  );

describe("Breadcrumbs", () => {
  describe("rendering", () => {
    it("renders nothing when there are no items", () => {
      const { container } = render(
        <MemoryRouter>
          <Breadcrumbs items={[]} />
        </MemoryRouter>,
      );

      expect(container).toBeEmptyDOMElement();
    });

    it("renders every item in order as an ordered list", () => {
      renderBreadcrumbs(threeItems);
      const nav = screen.getByRole("navigation", { name: "Breadcrumb" });

      expect(within(nav).getByRole("list").tagName).toBe("OL");
      expect(getItems().map((item) => item.textContent)).toEqual([
        "Home",
        "Profile",
        "Edit profile",
      ]);
    });

    it("renders items with an href as links", () => {
      renderBreadcrumbs(threeItems);

      expect(screen.getByRole("link", { name: "Home" })).toHaveAttribute(
        "href",
        "/",
      );
      expect(screen.getByRole("link", { name: "Profile" })).toHaveAttribute(
        "href",
        "/profile",
      );
    });

    it("renders the last item as plain text even when it has an href", () => {
      renderBreadcrumbs([
        { label: "Home", href: "/" },
        { label: "Dashboard", href: "/dashboard" },
      ]);

      expect(
        screen.queryByRole("link", { name: "Dashboard" }),
      ).not.toBeInTheDocument();
      expect(screen.getByText("Dashboard")).toBeInTheDocument();
    });

    it("renders intermediate items without an href as plain text", () => {
      renderBreadcrumbs([
        { label: "Home", href: "/" },
        { label: "Settings" },
        { label: "Notifications" },
      ]);

      expect(
        screen.queryByRole("link", { name: "Settings" }),
      ).not.toBeInTheDocument();
      expect(screen.getByText("Settings")).not.toHaveAttribute("aria-current");
    });

    it("renders a separator before every item except the first", () => {
      renderBreadcrumbs(threeItems);
      const [first, ...rest] = getItems();

      expect(first.querySelector("svg")).toBeNull();
      for (const item of rest) {
        expect(item.querySelector("svg")).not.toBeNull();
      }
    });

    it("applies a custom className to the nav", () => {
      renderBreadcrumbs(threeItems, { className: "mt-6" });

      expect(
        screen.getByRole("navigation", { name: "Breadcrumb" }),
      ).toHaveClass("mb-4", "mt-6");
    });

    it("does not collapse three or fewer items", () => {
      renderBreadcrumbs(threeItems);

      expect(getItems()).toHaveLength(3);
      expect(screen.queryByText("…")).not.toBeInTheDocument();
    });

    it("collapses the middle of more than three items into one ellipsis", () => {
      renderBreadcrumbs(fiveItems);
      const items = getItems();

      expect(items).toHaveLength(3);
      expect(items[0]).toHaveTextContent("Home");
      expect(items[1]).toHaveTextContent("…");
      expect(items[2]).toHaveTextContent("Tip #42");
      for (const label of ["Creators", "Alice", "Tips"]) {
        expect(screen.queryByText(label)).not.toBeInTheDocument();
      }
    });

    it("hides the first item and ellipsis on small screens when collapsed", () => {
      renderBreadcrumbs(fiveItems);
      const [first, ellipsis, last] = getItems();

      expect(first).toHaveClass("hidden", "sm:flex");
      expect(ellipsis).toHaveClass("hidden", "sm:flex");
      expect(last).not.toHaveClass("hidden");
    });
  });

  describe("structured data", () => {
    it("emits a schema.org BreadcrumbList for every item", () => {
      const { container } = renderBreadcrumbs(threeItems);
      const origin = window.location.origin;

      expect(readJsonLd(container)).toEqual({
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: [
          {
            "@type": "ListItem",
            position: 1,
            name: "Home",
            item: `${origin}/`,
          },
          {
            "@type": "ListItem",
            position: 2,
            name: "Profile",
            item: `${origin}/profile`,
          },
          { "@type": "ListItem", position: 3, name: "Edit profile" },
        ],
      });
    });

    it("keeps collapsed items in the structured data", () => {
      const { container } = renderBreadcrumbs(fiveItems);

      expect(
        readJsonLd(container).itemListElement.map(
          (entry: { name: string }) => entry.name,
        ),
      ).toEqual(["Home", "Creators", "Alice", "Tips", "Tip #42"]);
    });
  });

  describe("interactions", () => {
    it("navigates when a breadcrumb link is clicked", async () => {
      const user = userEvent.setup();
      renderBreadcrumbs(threeItems);

      await user.click(screen.getByRole("link", { name: "Profile" }));

      expect(
        screen.getByRole("status", { name: "Current path" }),
      ).toHaveTextContent("/profile");
    });

    it("moves keyboard focus through the links in order", async () => {
      const user = userEvent.setup();
      renderBreadcrumbs(threeItems);

      await user.tab();
      expect(screen.getByRole("link", { name: "Home" })).toHaveFocus();

      await user.tab();
      expect(screen.getByRole("link", { name: "Profile" })).toHaveFocus();
    });

    it("activates a focused link with Enter", async () => {
      const user = userEvent.setup();
      renderBreadcrumbs(threeItems, { initialPath: "/profile/edit" });

      await user.tab();
      await user.keyboard("{Enter}");

      expect(
        screen.getByRole("status", { name: "Current path" }),
      ).toHaveTextContent(/^\/$/);
    });
  });

  describe("accessibility", () => {
    it("wraps the trail in a navigation landmark labelled Breadcrumb", () => {
      renderBreadcrumbs(threeItems);

      expect(
        screen.getByRole("navigation", { name: "Breadcrumb" }),
      ).toBeInTheDocument();
    });

    it("marks only the last item as the current page", () => {
      const { container } = renderBreadcrumbs(threeItems);
      const current = container.querySelectorAll('[aria-current="page"]');

      expect(current).toHaveLength(1);
      expect(current[0]).toHaveTextContent("Edit profile");
    });

    it("hides separators and the ellipsis from assistive technology", () => {
      renderBreadcrumbs(fiveItems);
      const nav = screen.getByRole("navigation", { name: "Breadcrumb" });

      for (const icon of nav.querySelectorAll("svg")) {
        expect(icon).toHaveAttribute("aria-hidden", "true");
      }
      expect(screen.getByText("…")).toHaveAttribute("aria-hidden", "true");
    });

    it("has no WCAG 2.1 AA axe violations", async () => {
      const { container } = renderBreadcrumbs(threeItems);

      expect(await axe(container, wcag21AaConfig)).toHaveNoViolations();
    });

    it("has no WCAG 2.1 AA axe violations when collapsed", async () => {
      const { container } = renderBreadcrumbs(fiveItems);

      expect(await axe(container, wcag21AaConfig)).toHaveNoViolations();
    });
  });
});
