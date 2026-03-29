import React, { lazy } from 'react';
import { RouteObject } from 'react-router-dom';
import { wrap, protect } from '@/helpers/routeHelpers';

/* eslint-disable react-refresh/only-export-components */
const LandingPage = lazy(() => import('@/features/landing/LandingPage'));
const RegisterPage = lazy(() => import('@/features/profile/RegisterPage'));
const ProfilePage = lazy(() => import('@/features/profile/ProfilePage'));
const ProfileEditPage = lazy(() => import('@/features/profile/ProfileEditPage'));
const DashboardPage = lazy(() => import('@/features/dashboard/DashboardPage'));
const LeaderboardPage = lazy(() => import('@/features/leaderboard/LeaderboardPage'));
const TipPage = lazy(() => import('@/features/tipping/TipPage'));

/**
 * Route configuration for the Stellar-Tipz application.
 * Fast Refresh is disabled for this file as it primarily exports configuration,
 * not UI components.
 */
export const routes: RouteObject[] = [
  {
    path: '/',
    element: wrap(<LandingPage />),
  },
  {
    path: '/register',
    element: wrap(<RegisterPage />),
  },
  {
    path: '/@:username',
    element: wrap(<TipPage />),
  },
  {
    path: '/leaderboard',
    element: wrap(<LeaderboardPage />),
  },
  {
    path: '/profile',
    element: protect(<ProfilePage />),
  },
  {
    path: '/profile/edit',
    element: protect(<ProfileEditPage />),
  },
  {
    path: '/dashboard',
    element: protect(<DashboardPage />),
  },
];
