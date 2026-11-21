import React from "react";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe, toHaveNoViolations } from "jest-axe";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import i18n from "@/i18n/config";
import { I18nProvider } from "@/i18n";

import Footer from "../Footer";

expect.extend(toHaveNoViolations);

const wcag21AaConfig = {
  runOnly: {
    type: "tag" as const,
    values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"],
  },
};

const renderFooter = () =>
  render(
    <I18nProvider>
      <MemoryRouter>
        <Footer />
      </MemoryRouter>
    </I18nProvider>,
  );

const resetLanguage = async () => {
  window.localStorage.clear();
  await act(async () => {
    await i18n.changeLanguage("en");
  });
  window.localStorage.clear();
};

describe("Footer", () => {
  beforeEach(resetLanguage);
  afterEach(resetLanguage);

  describe("rendering", () => {
    it("renders the brand, tagline and copyright notice", () => {
      renderFooter();

      expect(screen.getByText("TIPZ")).toBeInTheDocument();
      expect(screen.getByText("Built on Stellar")).toBeInTheDocument();
      expect(
        screen.getByText(
          `© ${new Date().getFullYear()} Stellar Tipz. MIT License.`,
        ),
      ).toBeInTheDocument();
    });

    it("renders the product, resources and community section headings", () => {
      renderFooter();

      for (const heading of ["Product", "Resources", "Community"]) {
        expect(
          screen.getByRole("heading", { level: 3, name: heading }),
        ).toBeInTheDocument();
      }
    });

    it("renders internal product links with router hrefs", () => {
      renderFooter();
      const product = screen.getByRole("navigation", {
        name: "Footer product navigation",
      });

      expect(
        within(product).getByRole("link", { name: "Home" }),
      ).toHaveAttribute("href", "/");
      expect(
        within(product).getByRole("link", { name: "Leaderboard" }),
      ).toHaveAttribute("href", "/leaderboard");
      expect(
        within(product).getByRole("link", { name: "Dashboard" }),
      ).toHaveAttribute("href", "/dashboard");
    });

    it("renders resource links", () => {
      renderFooter();
      const resources = screen.getByRole("navigation", {
        name: "Footer resources navigation",
      });

      expect(
        within(resources).getByRole("link", { name: "Help" }),
      ).toHaveAttribute("href", "/help");
      expect(
        within(resources).getByRole("link", { name: "Docs" }),
      ).toHaveAttribute("href", "/docs");
      expect(
        within(resources).getByRole("link", { name: "GitHub" }),
      ).toHaveAttribute("href", "https://github.com/Akanimoh12/Stellar-Tipz");
      expect(
        within(resources).getByRole("link", { name: "Contract Spec" }),
      ).toHaveAttribute("href", "https://soroban.stellar.org/docs");
    });

    it("renders community links", () => {
      renderFooter();
      const community = screen.getByRole("region", { name: "Community links" });

      expect(
        within(community).getByRole("link", { name: "Twitter" }),
      ).toHaveAttribute("href", "https://twitter.com/TipzApp");
      expect(
        within(community).getByRole("link", { name: "Stellar Discord" }),
      ).toHaveAttribute("href", "https://discord.gg/stellardev");
    });

    it("lists every supported language in the language picker", () => {
      renderFooter();
      const select = screen.getByRole("combobox", { name: /language/i });
      const options = within(select).getAllByRole("option");

      expect(options.map((option) => option.getAttribute("value"))).toEqual([
        "en",
        "es",
        "fr",
        "pt",
        "zh",
      ]);
      expect(options.map((option) => option.textContent)).toEqual([
        "English",
        "Español",
        "Français",
        "Português",
        "中文",
      ]);
      expect(select).toHaveValue("en");
    });
  });

  describe("interactions", () => {
    it("switches the footer copy when a new language is selected", async () => {
      const user = userEvent.setup();
      renderFooter();

      await user.selectOptions(
        screen.getByRole("combobox", { name: /language/i }),
        "es",
      );

      await waitFor(() =>
        expect(
          screen.getByRole("heading", { level: 3, name: "Producto" }),
        ).toBeInTheDocument(),
      );
      expect(screen.getByRole("combobox", { name: /idioma/i })).toHaveValue(
        "es",
      );
      expect(screen.getByRole("contentinfo")).toHaveAccessibleName(
        "Pie del sitio",
      );
      expect(screen.getByRole("link", { name: "Inicio" })).toHaveAttribute(
        "href",
        "/",
      );
      expect(i18n.language).toBe("es");
    });

    it("lets keyboard users reach the language picker", async () => {
      const user = userEvent.setup();
      renderFooter();
      const select = screen.getByRole("combobox", { name: /language/i });

      // Tab past every link that precedes the picker in DOM order.
      for (let i = 0; i < 10 && document.activeElement !== select; i += 1) {
        await user.tab();
      }

      expect(select).toHaveFocus();
    });
  });

  describe("accessibility", () => {
    it("exposes a labelled contentinfo landmark", () => {
      renderFooter();

      expect(screen.getByRole("contentinfo")).toHaveAccessibleName(
        "Site footer",
      );
    });

    it("labels each link group", () => {
      renderFooter();

      expect(
        screen.getByRole("navigation", { name: "Footer product navigation" }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("navigation", { name: "Footer resources navigation" }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("region", { name: "Community links" }),
      ).toBeInTheDocument();
    });

    it("gives icon-only social links an accessible name", () => {
      renderFooter();
      const footer = screen.getByRole("contentinfo");

      // Text links and icon-only links share names, so expect two of each.
      expect(
        within(footer).getAllByRole("link", { name: "GitHub" }),
      ).toHaveLength(2);
      expect(
        within(footer).getAllByRole("link", { name: "Twitter" }),
      ).toHaveLength(2);
      expect(footer.querySelector('a[aria-label="GitHub"]')).not.toBeNull();
      expect(footer.querySelector('a[aria-label="Twitter"]')).not.toBeNull();
    });

    it("opens every external link safely in a new tab", () => {
      renderFooter();
      const externalLinks = screen
        .getAllByRole("link")
        .filter((link) => link.getAttribute("href")?.startsWith("http"));

      expect(externalLinks.length).toBeGreaterThan(0);
      for (const link of externalLinks) {
        expect(link).toHaveAttribute("target", "_blank");
        expect(link).toHaveAttribute("rel", "noopener noreferrer");
      }
    });

    it("keeps internal links in the same tab", () => {
      renderFooter();
      const internalLinks = screen
        .getAllByRole("link")
        .filter((link) => link.getAttribute("href")?.startsWith("/"));

      expect(internalLinks.length).toBeGreaterThan(0);
      for (const link of internalLinks) {
        expect(link).not.toHaveAttribute("target");
      }
    });

    it("has no WCAG 2.1 AA axe violations", async () => {
      const { container } = renderFooter();

      expect(await axe(container, wcag21AaConfig)).toHaveNoViolations();
    });
  });
});
