import React from 'react';
import { FileSearch, Home, Trophy } from 'lucide-react';
import { Link } from 'react-router-dom';
import PageContainer from '../../components/layout/PageContainer';
import Button from '../../components/ui/Button';
import { usePageTitle } from '@/hooks/usePageTitle';

const NotFoundPage: React.FC = () => {
  usePageTitle('Page Not Found');

  return (
    <PageContainer maxWidth="md">
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
        {/* Illustration */}
        <div className="relative mb-8">
          <div className="p-6 bg-gray-50 border-2 border-black inline-block">
            <FileSearch size={64} strokeWidth={1.5} className="text-gray-700" />
          </div>
          <span className="absolute -top-2 -right-2 bg-black text-white text-sm font-black px-2 py-1 border-2 border-black">
            404
          </span>
        </div>

        {/* Large 404 text in brutalist style */}
        <h1
          className="text-[8rem] sm:text-[12rem] font-black leading-none mb-4"
          style={{
            textShadow: '8px 8px 0px rgba(0,0,0,0.2)',
            letterSpacing: '-0.05em'
          }}
        >
          404
        </h1>

        {/* Message */}
        <p className="text-2xl font-bold uppercase tracking-wide mb-2">
          Page not found
        </p>
        <p className="text-gray-600 font-bold mb-10 max-w-md">
          The page you are looking for doesn't exist or has been moved.
        </p>

        {/* Primary action - Go Home */}
        <Link to="/" aria-label="Go to home page">
          <Button variant="primary" size="lg" className="flex items-center gap-2">
            <Home size={20} />
            Go Home
          </Button>
        </Link>

        {/* Secondary action - Browse Leaderboard */}
        <Link
          to="/leaderboard"
          className="mt-6 inline-flex items-center gap-2 text-lg font-semibold uppercase tracking-wide underline-animation"
        >
          <Trophy size={18} />
          Browse Leaderboard
        </Link>
      </div>
    </PageContainer>
  );
};

export default NotFoundPage;
