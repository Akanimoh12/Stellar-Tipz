import React, { lazy } from "react";
import { RouteObject } from "react-router-dom";
import { wrap, protect } from "@/helpers/routeHelpers";

/* eslint-disable react-refresh/only-export-components */
const LandingPage = lazy(() => import("@/features/landing/LandingPage"));
const RegisterPage = lazy(() => import("@/features/profile/RegisterPage"));
const ProfilePage = lazy(() => import("@/features/profile/ProfilePage"));
const ProfileEditPage = lazy(
  () => import("@/features/profile/ProfileEditPage"),
);
const DashboardPage = lazy(() => import("@/features/dashboard/DashboardPage"));
const LeaderboardPage = lazy(
  () => import("@/features/leaderboard/LeaderboardPage"),
);
const TipPage = lazy(() => import("@/features/tipping/TipPage"));
const TipReceipt = lazy(() => import("@/features/tipping/TipReceipt"));
const EmbedWidget = lazy(() => import("@/features/tipping/EmbedWidget"));
const TransactionsPage = lazy(
  () => import("@/features/transactions/TransactionsPage"),
);
const SettingsPage = lazy(() => import("@/features/settings/SettingsPage"));
const AdminDashboard = lazy(() => import("@/features/admin/AdminDashboard"));
const NotFoundPage = lazy(() => import("@/features/not-found/NotFoundPage"));

/**
 * Route configuration for the Stellar-Tipz application.
 * Fast Refresh is disabled for this file as it primarily exports configuration,
 * not UI components.
 */
export const routes: RouteObject[] = [
  {
    path: "/",
    element: wrap(<LandingPage />),
  },
  {
    path: "/register",
    element: wrap(<RegisterPage />),
  },
  {
    path: "/@:username",
    element: wrap(<TipPage />),
  },
  {
    path: "/embed/@:username",
    element: wrap(<EmbedWidget />),
  },
  {
    path: "/receipt",
    element: wrap(<TipReceipt />),
  },
  {
    path: "/leaderboard",
    element: wrap(<LeaderboardPage />),
  },
  {
    path: "/profile",
    element: protect(<ProfilePage />),
  },
  {
    path: "/profile/edit",
    element: protect(<ProfileEditPage />),
  },
  {
    path: "/dashboard",
    element: protect(<DashboardPage />),
  },
  {
    path: "/transactions",
    element: protect(<TransactionsPage />),
  },
  {
    path: "/settings",
    element: protect(<SettingsPage />),
  },
  {
    path: "/admin",
    element: protect(<AdminDashboard />),
  },
  {
    path: "*",
    element: wrap(<NotFoundPage />),
  },
];
