import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetRoutePrefetch,
  canPrefetch,
  createRouteLoader,
  prefetchRoute,
  registerRoutePrefetch,
} from "../routePrefetch";

const Dummy = () => null;

function setConnection(value: unknown) {
  Object.defineProperty(navigator, "connection", {
    value,
    configurable: true,
  });
}

describe("routePrefetch", () => {
  beforeEach(() => {
    __resetRoutePrefetch();
    setConnection(undefined);
  });

  afterEach(() => {
    setConnection(undefined);
  });

  it("dedupes loads so lazy render and prefetch share one import", async () => {
    const importer = vi.fn().mockResolvedValue({ default: Dummy });
    const load = createRouteLoader(importer);
    await Promise.all([load(), load(), load()]);
    expect(importer).toHaveBeenCalledTimes(1);
  });

  it("retries after a failed load", async () => {
    const importer = vi
      .fn()
      .mockRejectedValueOnce(new Error("chunk failed"))
      .mockResolvedValue({ default: Dummy });
    const load = createRouteLoader(importer);
    await expect(load()).rejects.toThrow("chunk failed");
    await expect(load()).resolves.toEqual({ default: Dummy });
    expect(importer).toHaveBeenCalledTimes(2);
  });

  it("matches parameterised tip routes and profile routes", () => {
    const tip = vi.fn().mockResolvedValue({ default: Dummy });
    const profile = vi.fn().mockResolvedValue({ default: Dummy });
    registerRoutePrefetch("/@:username", createRouteLoader(tip));
    registerRoutePrefetch("/profile", createRouteLoader(profile));

    prefetchRoute("/@alice?ref=leaderboard");
    prefetchRoute("/profile");
    prefetchRoute("/unknown");

    expect(tip).toHaveBeenCalledTimes(1);
    expect(profile).toHaveBeenCalledTimes(1);
  });

  it("does not match nested paths under a registered route", () => {
    const profile = vi.fn().mockResolvedValue({ default: Dummy });
    registerRoutePrefetch("/profile", createRouteLoader(profile));
    expect(prefetchRoute("/profile/edit")).toBeNull();
    expect(profile).not.toHaveBeenCalled();
  });

  it("skips prefetching when data saver is on", () => {
    setConnection({ saveData: true, effectiveType: "4g" });
    const tip = vi.fn().mockResolvedValue({ default: Dummy });
    registerRoutePrefetch("/@:username", createRouteLoader(tip));

    expect(canPrefetch()).toBe(false);
    expect(prefetchRoute("/@alice")).toBeNull();
    expect(tip).not.toHaveBeenCalled();
  });

  it.each(["slow-2g", "2g"])("skips prefetching on %s connections", (type) => {
    setConnection({ saveData: false, effectiveType: type });
    expect(canPrefetch()).toBe(false);
  });

  it("allows prefetching on fast connections", () => {
    setConnection({ saveData: false, effectiveType: "4g" });
    expect(canPrefetch()).toBe(true);
  });
});
