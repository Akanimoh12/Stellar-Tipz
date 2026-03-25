import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';

import Header from '@/components/layout/Header';
import Footer from './components/layout/Footer';
import LandingPage from './features/landing/LandingPage';

// Feature pages - will be implemented in frontend issues
// import ProfilePage from './features/profile/ProfilePage';
// import TipPage from './features/tipping/TipPage';
// import DashboardPage from './features/dashboard/DashboardPage';
// import LeaderboardPage from './features/leaderboard/LeaderboardPage';

const App: React.FC = () => {
  return (
    <BrowserRouter>
      <div className="min-h-screen flex flex-col bg-white">
        <Header />
        <div className="flex-1">
          <Routes>
            <Route path="/" element={<LandingPage />} />
            {/* Routes to be enabled as features are built:
            <Route path="/@:username" element={<TipPage />} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/leaderboard" element={<LeaderboardPage />} />
            */}
          </Routes>
        </div>
        <Footer />
      </div>
    </BrowserRouter>
  );
};

export default App;
