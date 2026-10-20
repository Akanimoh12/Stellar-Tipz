import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";

const mockTrackPageView = vi.fn();

vi.mock("react-router-dom", () => ({
  useLocation: vi.fn(() => ({ pathname: "/", search: "" })),
}));
vi.mock("../services/analytics", () => ({
  analytics: { trackPageView: mockTrackPageView },
}));

import { useLocation } from "react-router-dom";
import { analytics } from "../services/analytics";

const mockedUseLocation = vi.mocked(useLocation);

describe("useAnalytics", () => {
  beforeEach(() => {
    mockTrackPageView.mockClear();
    mockedUseLocation.mockReturnValue({ pathname: "/", search: "" });
  });

  it("returns the analytics service object", () => {
    const { result } = renderHook(() => useAnalytics());
    expect(result.current).toBe(analytics);
  });

  it("tracks a page view on mount (success)", () => {
    mockedUseLocation.mockReturnValue({
      pathname: "/dashboard",
      search: "?tab=tips",
    });

    renderHook(() => useAnalytics());

    expect(mockTrackPageView).toHaveBeenCalledWith("/dashboard?tab=tips");
  });

  it("tracks a page view when the location changes", () => {
    const { rerender } = renderHook(() => useAnalytics());

    mockedUseLocation.mockReturnValue({ pathname: "/profile", search: "" });
    rerender();

    expect(mockTrackPageView).toHaveBeenLastCalledWith("/profile");
  });

  it("cleanup does not throw on unmount", () => {
    const { unmount } = renderHook(() => useAnalytics());
    expect(() => unmount()).not.toThrow();
  });
});
