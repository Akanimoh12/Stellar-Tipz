import React from 'react';
import { Link } from 'react-router-dom';
import PageContainer from '../../components/layout/PageContainer';
import Button from '../../components/ui/Button';

const NotFoundPage: React.FC = () => {
  return (
    <PageContainer maxWidth="md">
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
        {/* Large 404 text in brutalist style */}
        <h1 
          className="text-[12rem] font-black leading-none mb-4"
          style={{
            textShadow: '8px 8px 0px rgba(0,0,0,0.2)',
            letterSpacing: '-0.05em'
          }}
        >
          404
        </h1>

        {/* Message */}
        <p className="text-2xl font-bold uppercase tracking-wide mb-8">
          Page not found
        </p>

        {/* Primary action - Go Home button */}
        <Link to="/">
          <Button variant="primary" size="lg">
            Go Home
          </Button>
        </Link>

        {/* Secondary action - Browse Leaderboard link */}
        <Link 
          to="/leaderboard" 
          className="mt-6 text-lg font-semibold uppercase tracking-wide underline hover:no-underline transition-all"
        >
          Browse Leaderboard
        </Link>
      </div>
    </PageContainer>
  );
};

export default NotFoundPage;
