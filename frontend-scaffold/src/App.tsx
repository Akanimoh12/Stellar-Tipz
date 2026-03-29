import React from 'react';
import { BrowserRouter, useRoutes } from 'react-router-dom';

import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import ScrollToTop from '@/components/shared/ScrollToTop';
import ErrorBoundary from '@/components/shared/ErrorBoundary';
import ToastContainer from '@/components/shared/ToastContainer';
import { routes } from '@/routes';
import React from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";

import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import ScrollToTop from "@/components/shared/ScrollToTop";
import ErrorBoundary from "@/components/shared/ErrorBoundary";
import ToastContainer from "@/components/shared/ToastContainer";
import LandingPage from "@/features/landing/LandingPage";
import ProfilePage from "@/features/profile/ProfilePage";
import EditProfilePage from "@/features/profile/EditProfilePage";
import TipPage from "@/features/tipping/TipPage";
import DashboardPage from "@/features/dashboard/DashboardPage";
import LeaderboardPage from "@/features/leaderboard/LeaderboardPage";
import NotFoundPage from "@/features/not-found/NotFoundPage";

const App: React.FC = () => {
  const routeElements = useRoutes(routes);

  return (
    <BrowserRouter>
      <ScrollToTop />
      <ErrorBoundary>
        <div className="min-h-screen flex flex-col bg-white dark:bg-black">
          <a
            href="#main-content"
            className="sr-only focus:not-sr-only focus:absolute focus:top-0 focus:left-0 focus:z-50 focus:bg-black focus:text-white focus:px-4 focus:py-2 focus:font-black focus:outline-none"
          >
            Skip to main content
          </a>
          <Header />
          <div className="flex-1">
            {routeElements}
            <Routes>
              <Route path="/" element={<LandingPage />} />
              <Route path="/@:username" element={<TipPage />} />
              <Route path="/profile" element={<ProfilePage />} />
              <Route path="/profile/edit" element={<EditProfilePage />} />
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/leaderboard" element={<LeaderboardPage />} />
              <Route path="*" element={<NotFoundPage />} />
            </Routes>
          </div>
          <Footer />
        </div>
      </ErrorBoundary>
      <ToastContainer />
    </BrowserRouter>
  );
};

export default App;
