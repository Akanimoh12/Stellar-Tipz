import React from 'react';
import Loader from '@/components/ui/Loader';

/**
 * Centered loader for initially fetching lazy-loaded pages.
 */
const PageLoader: React.FC = () => (
  <div className="flex-1 flex items-center justify-center py-20">
    <Loader />
  </div>
);

export default PageLoader;
