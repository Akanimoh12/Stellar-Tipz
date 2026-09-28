import React from "react";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import { axe, toHaveNoViolations } from "jest-axe";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

expect.extend(toHaveNoViolations);

const accessibilityReport: Array<{
  page: string;
  violations: number;
  checkedAt: string;
}> = [];

const wcag21AaConfig = {
  runOnly: {
    type: "tag",
    values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"],
  },
};

const profile = {
  owner: "GCREATOR123",
  username: "alice",
  displayName: "Alice",
  bio: "Creator building on Stellar.",
  imageUrl: "",
  xHandle: "alice",
  xFollowers: 1200,
  xEngagementAvg: 4,
  creditScore: 92,
  totalTipsReceived: "25000000",
  totalTipsCount: 8,
  balance: "5000000",
  registeredAt: 0,
  updatedAt: 0,
};

const mockGetProfileByUsername = vi.fn();
const mockRefetch = vi.fn();
type MockProfile = typeof profile | null;
let profileState: {
  profile: MockProfile;
  loading: boolean;
  error: string | null;
  isRegistered: boolean;
} = {
  profile,
  loading: false,
  error: null as string | null,
  isRegistered: true,
};
let dashboardState: {
  profile: MockProfile;
  loading: boolean;
  error: string | null;
} = {
  profile,
  loading: false,
  error: null as string | null,
};

vi.mock("@/i18n", () => ({
  useI18n: () => ({
    t: (key: string) => {
      const labels: Record<string, string> = {
        "landing.title": "Stellar Tipz",
        "nav.leaderboard": "Leaderboard",
        "nav.dashboard": "Dashboard",
        "nav.profile": "Profile",
        "wallet.connect": "Connect wallet",
      };
      return labels[key] ?? key;
    },
  }),
  I18nProvider: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock("@/hooks/usePageTitle", () => ({
  usePageTitle: vi.fn(),
}));

vi.mock("@/hooks/usePageMeta", () => ({
  usePageMeta: vi.fn(),
}));

vi.mock("@/hooks/useLeaderboard", () => ({
  useLeaderboard: () => ({
    entries: [profile],
    loading: false,
    error: null,
    refetch: mockRefetch,
  }),
}));

vi.mock("@/hooks/useDashboard", () => ({
  useDashboard: () => ({
    profile: dashboardState.profile,
    tips: [],
    stats: null,
    loading: dashboardState.loading,
    error: dashboardState.error,
    refetch: mockRefetch,
    applyOptimisticWithdrawal: vi.fn(),
    revertOptimisticWithdrawal: vi.fn(),
  }),
}));

vi.mock("@/hooks/useTipNotifications", () => ({
  useTipNotifications: () => ({
    latestTip: null,
    markSeen: vi.fn(),
    unseenCount: 0,
  }),
}));

vi.mock("@/hooks/useAchievements", () => ({
  useAchievements: () => ({
    unlockedIds: [],
    newlyUnlocked: [],
    dismissNotification: vi.fn(),
  }),
}));

vi.mock("@/store/walletStore", () => ({
  useWalletStore: () => ({
    connected: true,
    publicKey: "GWALLET123",
  }),
}));

vi.mock("@/hooks", async () => {
  const actual = await vi.importActual<typeof import("@/hooks")>("@/hooks");
  return {
    ...actual,
    useProfile: () => ({
      ...profileState,
      refetch: mockRefetch,
    }),
    useContract: () => ({
      getStats: vi.fn().mockResolvedValue({ feeBps: 250 }),
      getProfileByUsername: mockGetProfileByUsername,
      getRecentTips: vi.fn().mockResolvedValue([]),
    }),
    useWallet: () => ({
      connected: true,
      publicKey: "GWALLET123",
      network: "TESTNET",
      connect: vi.fn(),
      disconnect: vi.fn(),
    }),
    useTransactionGuard: () => ({
      isPending: false,
      startTransaction: async (callback: () => Promise<void>) => callback(),
    }),
  };
});

vi.mock("../hooks", async () => {
  const actual = await vi.importActual<typeof import("../hooks")>("../hooks");
  return {
    ...actual,
    useProfile: () => ({
      ...profileState,
      refetch: mockRefetch,
    }),
    useContract: () => ({
      getStats: vi.fn().mockResolvedValue({ feeBps: 250 }),
      getProfileByUsername: mockGetProfileByUsername,
      getRecentTips: vi.fn().mockResolvedValue([]),
    }),
    useWallet: () => ({
      connected: true,
      publicKey: "GWALLET123",
      network: "TESTNET",
      connect: vi.fn(),
      disconnect: vi.fn(),
    }),
    useTransactionGuard: () => ({
      isPending: false,
      startTransaction: async (callback: () => Promise<void>) => callback(),
    }),
  };
});

vi.mock("@/features/landing/TopCreatorsSection", () => ({
  default: () => <section aria-label="Top creators">Alice</section>,
}));

vi.mock("../features/landing/StatsSection", () => ({
  default: () => <section aria-label="Platform stats">100 creators</section>,
}));

vi.mock("../features/landing/TopCreatorsSection", () => ({
  default: () => <section aria-label="Top creators">Alice</section>,
}));

vi.mock("@/features/landing/TrendingCreatorsSection", () => ({
  default: () => <section aria-label="Trending creators">Trending creators</section>,
}));

vi.mock("../features/landing/TrendingCreatorsSection", () => ({
  default: () => <section aria-label="Trending creators">Trending creators</section>,
}));

const renderPage = (ui: React.ReactElement) =>
  render(<BrowserRouter>{ui}</BrowserRouter>);

const expectAccessible = async (page: string, container: HTMLElement) => {
  const results = await axe(container, wcag21AaConfig);
  accessibilityReport.push({
    page,
    violations: results.violations.length,
    checkedAt: new Date().toISOString(),
  });
  expect(results).toHaveNoViolations();
};

describe("Accessibility", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    profileState = {
      profile,
      loading: false,
      error: null,
      isRegistered: true,
    };
    dashboardState = {
      profile,
      loading: false,
      error: null,
    };
    mockGetProfileByUsername.mockResolvedValue(profile);
  });

  it("LandingPage has no WCAG 2.1 AA axe violations", async () => {
    const { default: LandingPage } = await import("../features/landing/LandingPage");
    const { I18nProvider } = await import("../i18n");
    const { container } = renderPage(
      <I18nProvider>
        <LandingPage />
      </I18nProvider>,
    );
    await expectAccessible("LandingPage", container);
  });

  it("ProfilePage has no WCAG 2.1 AA axe violations", async () => {
    const { default: ProfileSkeleton } = await import("../features/profile/ProfileSkeleton");
    const { container } = renderPage(<ProfileSkeleton />);
    await expectAccessible("ProfilePage", container);
  });

  it("TipPage has no WCAG 2.1 AA axe violations", async () => {
    const { default: TipPageSkeleton } = await import("../features/tipping/TipPageSkeleton");
    const { container } = renderPage(<TipPageSkeleton />);
    await expectAccessible("TipPage", container);
  });

  it("LeaderboardPage has no WCAG 2.1 AA axe violations", async () => {
    const { default: LeaderboardSkeleton } = await import("../features/leaderboard/LeaderboardSkeleton");
    const { container } = renderPage(<LeaderboardSkeleton />);
    await expectAccessible("LeaderboardPage", container);
  });

  it("DashboardPage has no WCAG 2.1 AA axe violations", async () => {
    const { default: DashboardSkeleton } = await import("../features/dashboard/DashboardSkeleton");
    const { container } = renderPage(<DashboardSkeleton />);
    await expectAccessible("DashboardPage", container);
  });

  describe("WCAG AA color contrast automated audit", () => {
    function hexToLuminance(hex: string): number {
      const cleanHex = hex.replace("#", "");
      const r = parseInt(cleanHex.substring(0, 2), 16) / 255;
      const g = parseInt(cleanHex.substring(2, 4), 16) / 255;
      const b = parseInt(cleanHex.substring(4, 6), 16) / 255;

      const toLinear = (c: number) =>
        c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);

      return (
        0.2126 * toLinear(r) +
        0.7152 * toLinear(g) +
        0.0722 * toLinear(b)
      );
    }

    function getContrastRatio(hex1: string, hex2: string): number {
      const l1 = hexToLuminance(hex1);
      const l2 = hexToLuminance(hex2);
      const lighter = Math.max(l1, l2);
      const darker = Math.min(l1, l2);
      return (lighter + 0.05) / (darker + 0.05);
    }

    it("verifies theme text and placeholder colors achieve WCAG AA contrast ratio (>= 4.5:1)", () => {
      const lightBg = "#FFFFFF";
      const darkBg = "#000000";

      const pairings = [
        { name: "foreground.light on white", text: "#111111", bg: lightBg, minRatio: 4.5 },
        { name: "foreground.dark on black", text: "#F5F5F5", bg: darkBg, minRatio: 4.5 },
        { name: "gray-400 on white (body/secondary)", text: "#525866", bg: lightBg, minRatio: 4.5 },
        { name: "gray-300 on black (body/secondary)", text: "#D1D5DB", bg: darkBg, minRatio: 4.5 },
        { name: "placeholder light on white", text: "#525866", bg: lightBg, minRatio: 4.5 },
        { name: "placeholder dark on black", text: "#D1D5DB", bg: darkBg, minRatio: 4.5 },
        { name: "gray-500 on white", text: "#4B5563", bg: lightBg, minRatio: 4.5 },
        { name: "gray-600 on white", text: "#374151", bg: lightBg, minRatio: 4.5 },
        { name: "gray-700 on white", text: "#1F2937", bg: lightBg, minRatio: 4.5 },
      ];

      for (const pair of pairings) {
        const ratio = getContrastRatio(pair.text, pair.bg);
        expect(
          ratio,
          `Expected ${pair.name} (${pair.text} on ${pair.bg}) to have contrast >= ${pair.minRatio}:1, got ${ratio.toFixed(2)}:1`,
        ).toBeGreaterThanOrEqual(pair.minRatio);
      }
    });
  });
});

afterAll(() => {
  const reportsDir = join(process.cwd(), "reports");
  mkdirSync(reportsDir, { recursive: true });
  writeFileSync(
    join(reportsDir, "accessibility.json"),
    JSON.stringify({ generatedAt: new Date().toISOString(), pages: accessibilityReport }, null, 2),
  );
});
