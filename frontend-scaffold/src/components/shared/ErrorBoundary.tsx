import React from 'react';
import ErrorState from './ErrorState';
import { categorizeError } from '@/helpers/error';

interface ErrorBoundaryProps {
  fallback?: React.ReactNode;
  children: React.ReactNode;
  onReset?: () => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
    };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    if (process.env.NODE_ENV === 'development') {
      console.error('ErrorBoundary caught an error:', error);
      console.error('Error info:', errorInfo);
    }
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
    if (this.props.onReset) {
      this.props.onReset();
    } else {
      window.location.reload();
    }
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const category = categorizeError(this.state.error);

      return (
        <div className="min-h-[400px] flex items-center justify-center">
          <ErrorState 
            category={category} 
            onRetry={this.handleReset}
          />
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
