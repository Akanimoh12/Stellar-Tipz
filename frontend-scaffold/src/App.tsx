import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';

import Header from '@/components/layout/Header';
import Footer from './components/layout/Footer';
import ScrollToTop from './components/shared/ScrollToTop';
import PageTransition from './components/shared/PageTransition';
import LandingPage from './features/landing/LandingPage';
import ProfilePage from './features/profile/ProfilePage';
import TipPage from './features/tipping/TipPage';
import DashboardPage from './features/dashboard/DashboardPage';
import LeaderboardPage from './features/leaderboard/LeaderboardPage';

const App: React.FC = () => {
  return (
    <BrowserRouter>
      <ScrollToTop />
      <div className="min-h-screen flex flex-col bg-white">
        <Header />
        <div className="flex-1">
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/@:username" element={<TipPage />} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/leaderboard" element={<LeaderboardPage />} />
          </Routes>
        </div>
      </ErrorBoundary>
      <ToastContainer />
    </BrowserRouter>
  );
};

export default App;
