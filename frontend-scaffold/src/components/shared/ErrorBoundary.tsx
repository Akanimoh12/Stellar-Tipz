import React from 'react';
import { RefreshCcw, Home } from 'lucide-react';
import { logger } from '../../services/logger';
import { captureError } from '@/services/sentry';
import { useI18n } from '@/i18n';
import Button from '../ui/Button';

export type ErrorBoundaryLevel = 'root' | 'feature';

export interface ErrorBoundaryProps {
  fallback?: React.ReactNode;
  children: React.ReactNode;
  onReset?: () => void;
  /** root = full-app recovery; feature = isolate a widget/section */
  level?: ErrorBoundaryLevel;
  /** Sentry tag identifying the failed surface */
  name?: string;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
}

interface FallbackProps {
  onRetry: () => void;
  onReload: () => void;
  name?: string;
}

const RootErrorFallback: React.FC<FallbackProps> = ({ onRetry, onReload }) => {
  const { t } = useI18n();

  return (
    <div
      className="min-h-screen flex items-center justify-center p-6 bg-white dark:bg-black"
      role="alert"
      aria-live="assertive"
    >
      <div className="max-w-md w-full border-4 border-black bg-white p-8 shadow-brutalist text-center">
        <h1 className="text-2xl font-black uppercase mb-3 tracking-tight">
          {t('error.appTitle')}
        </h1>
        <p className="font-bold text-gray-600 mb-8 leading-relaxed">
          {t('error.appMessage')}
        </p>
        <div className="space-y-3">
          <Button
            onClick={onRetry}
            variant="primary"
            className="w-full flex items-center justify-center gap-2"
          >
            <RefreshCcw size={18} />
            {t('common.tryAgain')}
          </Button>
          <Button
            onClick={onReload}
            variant="outline"
            className="w-full flex items-center justify-center gap-2"
          >
            {t('app.reloadNow')}
          </Button>
          <Button
            onClick={() => {
              window.location.assign('/');
            }}
            variant="outline"
            className="w-full flex items-center justify-center gap-2"
          >
            <Home size={18} />
            {t('common.goHome')}
          </Button>
        </div>
      </div>
    </div>
  );
};

const FeatureErrorFallback: React.FC<FallbackProps> = ({ onRetry, name }) => {
  const { t } = useI18n();

  return (
    <div
      className="border-4 border-black bg-white p-6 shadow-brutalist"
      role="alert"
      aria-live="assertive"
      data-error-boundary={name ?? 'feature'}
    >
      <h3 className="text-lg font-black uppercase mb-2 tracking-tight">
        {t('error.sectionTitle')}
      </h3>
      <p className="font-bold text-gray-600 mb-4 leading-relaxed">
        {t('error.sectionMessage')}
      </p>
      <Button
        onClick={onRetry}
        variant="primary"
        className="flex items-center justify-center gap-2"
      >
        <RefreshCcw size={18} />
        {t('common.tryAgain')}
      </Button>
    </div>
  );
};

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

    logger.error('React Error Boundary caught error', {
      error: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack,
      boundary: this.props.level ?? 'feature',
      feature: this.props.name ?? 'unknown',
      timestamp: new Date().toISOString(),
    });

    if (import.meta.env.DEV) {
      console.error('ErrorBoundary caught an error:', error);
      console.error('Error info:', errorInfo);
    }

    this.reportError(error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    this.props.onReset?.();
  };

  handleReload = () => {
    window.location.reload();
  };

  reportError = (error: Error, errorInfo: React.ErrorInfo) => {
    captureError(error, {
      boundary: this.props.level ?? 'feature',
      feature: this.props.name ?? 'unknown',
      componentStack: errorInfo.componentStack ?? undefined,
    });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const level = this.props.level ?? 'feature';
      const fallbackProps: FallbackProps = {
        onRetry: this.handleReset,
        onReload: this.handleReload,
        name: this.props.name,
      };

      if (level === 'root') {
        return <RootErrorFallback {...fallbackProps} />;
      }

      return <FeatureErrorFallback {...fallbackProps} />;
    }

    return this.props.children;
  }
}

export const FeatureErrorBoundary: React.FC<{
  name: string;
  children: React.ReactNode;
  onReset?: () => void;
}> = ({ name, children, onReset }) => (
  <ErrorBoundary level="feature" name={name} onReset={onReset}>
    {children}
  </ErrorBoundary>
);

export default ErrorBoundary;
