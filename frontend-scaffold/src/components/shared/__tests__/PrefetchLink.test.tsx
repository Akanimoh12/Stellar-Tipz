import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import PrefetchLink from "../PrefetchLink";
import {
  __resetRoutePrefetch,
  createRouteLoader,
  registerRoutePrefetch,
} from "@/helpers/routePrefetch";

describe("PrefetchLink", () => {
  const importer = vi.fn();

  beforeEach(() => {
    __resetRoutePrefetch();
    importer.mockReset().mockResolvedValue({ default: () => null });
    registerRoutePrefetch("/@:username", createRouteLoader(importer));
  });

  const renderLink = () =>
    render(
      <MemoryRouter>
        <PrefetchLink to="/@alice">Tip alice</PrefetchLink>
      </MemoryRouter>,
    );

  it("prefetches the tip route chunk on hover", () => {
    renderLink();
    fireEvent.mouseEnter(screen.getByText("Tip alice"));
    expect(importer).toHaveBeenCalledTimes(1);
  });

  it("prefetches on keyboard focus", () => {
    renderLink();
    fireEvent.focus(screen.getByText("Tip alice"));
    expect(importer).toHaveBeenCalledTimes(1);
  });

  it("only fetches the chunk once across repeated hovers", () => {
    renderLink();
    const link = screen.getByText("Tip alice");
    fireEvent.mouseEnter(link);
    fireEvent.focus(link);
    fireEvent.mouseEnter(link);
    expect(importer).toHaveBeenCalledTimes(1);
  });
});
