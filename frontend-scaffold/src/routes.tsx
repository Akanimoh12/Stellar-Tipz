import React, { lazy, Suspense } from 'react';
import { RouteObject } from 'react-router-dom';
import PageTransition from '@/components/shared/PageTransition';
import ProtectedRoute from '@/components/shared/ProtectedRoute';
import Loader from '@/components/ui/Loader';

const LandingPage = lazy(() => import('@/features/landing/LandingPage'));
const RegisterPage = lazy(() => import('@/features/profile/RegisterPage'));
const ProfilePage = lazy(() => import('@/features/profile/ProfilePage'));
const ProfileEditPage = lazy(() => import('@/features/profile/ProfileEditPage'));
const DashboardPage = lazy(() => import('@/features/dashboard/DashboardPage'));
const LeaderboardPage = lazy(() => import('@/features/leaderboard/LeaderboardPage'));
const TipPage = lazy(() => import('@/features/tipping/TipPage'));

const PageLoader: React.FC = () => (
  <div className="flex-1 flex items-center justify-center py-20">
    <Loader />
  </div>
);

const wrap = (element: React.ReactElement) => (
  <Suspense fallback={<PageLoader />}>
    <PageTransition>{element}</PageTransition>
  </Suspense>
);

const protect = (element: React.ReactElement) => (
  <ProtectedRoute>{wrap(element)}</ProtectedRoute>
);

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
