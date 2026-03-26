import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';

import Header from '@/components/layout/Header';
import Footer from './components/layout/Footer';
import ScrollToTop from './components/shared/ScrollToTop';
import PageTransition from './components/shared/PageTransition';
import LandingPage from './features/landing/LandingPage';

// Feature pages - will be implemented in frontend issues
// import ProfilePage from './features/profile/ProfilePage';
// import TipPage from './features/tipping/TipPage';
// import DashboardPage from './features/dashboard/DashboardPage';
// import LeaderboardPage from './features/leaderboard/LeaderboardPage';

const App: React.FC = () => {
  return (
    <BrowserRouter>
      <ScrollToTop />
      <div className="min-h-screen flex flex-col bg-white">
        <Header />
        <div className="flex-1">
          <Routes>
            <Route path="/" element={<PageTransition><LandingPage /></PageTransition>} />
            {/* Routes to be enabled as features are built:
            <Route path="/@:username" element={<PageTransition><TipPage /></PageTransition>} />
            <Route path="/profile" element={<PageTransition><ProfilePage /></PageTransition>} />
            <Route path="/dashboard" element={<PageTransition><DashboardPage /></PageTransition>} />
            <Route path="/leaderboard" element={<PageTransition><LeaderboardPage /></PageTransition>} />
            */}
          </Routes>
        </div>
        <Footer />
      </div>
    </BrowserRouter>
  );
};

export default App;
