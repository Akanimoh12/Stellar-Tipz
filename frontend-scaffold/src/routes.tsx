import React, { lazy } from "react";
import { RouteObject } from "react-router-dom";
import { wrap, protect } from "@/helpers/routeHelpers";
import {
  createRouteLoader,
  registerRoutePrefetch,
  type RouteLoader,
} from "@/helpers/routePrefetch";
import {
  ContentRouteSkeleton,
  DashboardRouteSkeleton,
  EmbedRouteSkeleton,
  FormRouteSkeleton,
  ListRouteSkeleton,
  ProfileRouteSkeleton,
  TipRouteSkeleton,
} from "@/components/shared/RouteSkeletons";

/* eslint-disable react-refresh/only-export-components */

/**
 * Declares a lazily loaded route chunk (#1337). The same loader backs
 * `React.lazy` and hover/focus prefetching, so a prefetched chunk is reused
 * rather than fetched again. `prefetchPaths` registers the URL patterns whose
 * links should warm this chunk.
 */
function lazyRoute(importer: RouteLoader, prefetchPaths: string[] = []) {
  const load = createRouteLoader(importer);
  prefetchPaths.forEach((path) => registerRoutePrefetch(path, load));
  return lazy(load);
}

const LandingPage = lazyRoute(() => import("@/features/landing/LandingPage"), ["/"]);
const RegisterPage = lazyRoute(() => import("@/features/profile/RegisterPage"), [
  "/register",
]);
const ProfilePage = lazyRoute(() => import("@/features/profile/ProfilePage"), [
  "/profile",
]);
const ProfileEditPage = lazyRoute(() => import("@/features/profile/ProfileEditPage"), [
  "/profile/edit",
]);
const DashboardPage = lazyRoute(() => import("@/features/dashboard/DashboardPage"), [
  "/dashboard",
]);
const LeaderboardPage = lazyRoute(
  () => import("@/features/leaderboard/LeaderboardPage"),
  ["/leaderboard"],
);
const TipPage = lazyRoute(() => import("@/features/tipping/TipPage"), ["/@:username"]);
const TipReceipt = lazyRoute(() => import("@/features/tipping/TipReceipt"), ["/receipt"]);
const EmbedWidget = lazyRoute(() => import("@/features/tipping/EmbedWidget"));
const EmbedGeneratorPage = lazyRoute(
  () => import("@/features/embed/EmbedGeneratorPage"),
  ["/embed/generate"],
);
const TransactionsPage = lazyRoute(
  () => import("@/features/transactions/TransactionsPage"),
  ["/transactions"],
);
const SettingsPage = lazyRoute(() => import("@/features/settings/SettingsPage"), [
  "/settings",
]);
const SubscribePage = lazyRoute(
  () => import("@/features/subscriptions/SubscribePage"),
  ["/subscriptions"],
);
// Admin is intentionally not registered for prefetch: it is never on a
// first-time visitor's path and should only load on explicit navigation.
const AdminDashboard = lazyRoute(() => import("@/features/admin/AdminDashboard"));
const HelpPage = lazyRoute(() => import("@/features/help/HelpPage"), ["/help"]);
const HealthPage = lazyRoute(() => import("@/features/health/HealthPage"));
const NotFoundPage = lazyRoute(() => import("@/features/not-found/NotFoundPage"));

/**
 * Route configuration for the Stellar-Tipz application.
 * Fast Refresh is disabled for this file as it primarily exports configuration,
 * not UI components.
 */
export const routes: RouteObject[] = [
  {
    path: "/",
    element: wrap(<LandingPage />, <ContentRouteSkeleton label="Loading home" />),
  },
  {
    path: "/register",
    element: wrap(<RegisterPage />, <FormRouteSkeleton label="Loading registration" />),
  },
  {
    path: "/@:username",
    element: wrap(<TipPage />, <TipRouteSkeleton />),
  },
  {
    path: "/embed/@:username",
    element: wrap(<EmbedWidget />, <EmbedRouteSkeleton />),
  },
  {
    path: "/embed/generate",
    element: protect(
      <EmbedGeneratorPage />,
      <FormRouteSkeleton label="Loading embed generator" />,
    ),
  },
  {
    path: "/receipt",
    element: wrap(<TipReceipt />, <FormRouteSkeleton label="Loading receipt" />),
  },
  {
    path: "/leaderboard",
    element: wrap(<LeaderboardPage />, <ListRouteSkeleton label="Loading leaderboard" />),
  },
  {
    path: "/profile",
    element: protect(<ProfilePage />, <ProfileRouteSkeleton />),
  },
  {
    path: "/profile/edit",
    element: protect(<ProfileEditPage />, <FormRouteSkeleton label="Loading profile editor" />),
  },
  {
    path: "/dashboard",
    element: protect(<DashboardPage />, <DashboardRouteSkeleton />),
  },
  {
    path: "/transactions",
    element: protect(
      <TransactionsPage />,
      <ListRouteSkeleton label="Loading transactions" />,
    ),
  },
  {
    path: "/settings",
    element: protect(<SettingsPage />, <FormRouteSkeleton label="Loading settings" />),
  },
  {
    path: "/subscriptions",
    element: protect(
      <SubscribePage />,
      <ListRouteSkeleton label="Loading subscriptions" />,
    ),
  },
  {
    path: "/admin",
    element: protect(<AdminDashboard />, <DashboardRouteSkeleton />),
  },
  {
    path: "/help",
    element: wrap(<HelpPage />, <ContentRouteSkeleton label="Loading help" />),
  },
  {
    path: "/health",
    element: wrap(<HealthPage />, <ListRouteSkeleton label="Loading health status" />),
  },
  {
    path: "*",
    element: wrap(<NotFoundPage />, <ContentRouteSkeleton />),
  },
];
