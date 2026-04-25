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
  errorInfo: React.ErrorInfo | null;
}

class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error, errorInfo: null };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    this.setState({ errorInfo });
    
    if (import.meta.env.DEV) {
      console.error('ErrorBoundary caught an error:', error);
      console.error('Error info:', errorInfo);
    }
    
    // Log error with component stack
    console.group('Error Boundary Error Details');
    console.error('Error:', error);
    console.error('Component Stack:', errorInfo.componentStack);
    console.groupEnd();
    
    // Future: Send to analytics service
    this.reportError(error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    if (this.props.onReset) {
      this.props.onReset();
    } else {
      window.location.reload();
    }
  };

  reportError = (error: Error, errorInfo: React.ErrorInfo) => {
    // Future: Send to analytics service
    if (import.meta.env.DEV) {
      console.log('Error reporting hook - would send to analytics:', {
        error: error.message,
        stack: error.stack,
        componentStack: errorInfo.componentStack,
        timestamp: new Date().toISOString(),
      });
    }
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const { category } = categorizeError(this.state.error);

      return (
        <div className="min-h-[400px] flex items-center justify-center">
          <ErrorState 
            category={category} 
            onRetry={this.handleReset}
            error={this.state.error}
            errorInfo={this.state.errorInfo}
          />
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
