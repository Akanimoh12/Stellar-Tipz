import React, { useState } from "react";
import {
  AlertCircle,
  RefreshCcw,
  WifiOff,
  FileSearch,
  WalletCards,
  Home,
  ChevronDown,
  ChevronUp,
  Bug,
} from "lucide-react";
import Card from "../ui/Card";
import Button from "../ui/Button";
import { ERRORS, ErrorCategory } from "@/helpers/error";
import { useNavigate } from "react-router-dom";

interface ErrorStateProps {
  message?: string;
  onRetry?: () => void;
  category?: ErrorCategory;
  className?: string;
  error?: Error | null;
  errorInfo?: React.ErrorInfo | null;
}

const ErrorState: React.FC<ErrorStateProps> = ({
  message,
  onRetry,
  category = "unknown",
  className = "",
  error,
  errorInfo,
}) => {
  const navigate = useNavigate();
  const [showErrorDetails, setShowErrorDetails] = useState(false);
  const getContent = () => {
    switch (category) {
      case "network":
        return {
          icon: <WifiOff className="text-red-600" size={48} />,
          title: "Connection Issue",
          defaultMessage: ERRORS.NETWORK,
        };
      case "not-found":
        return {
          icon: <FileSearch className="text-blue-600" size={48} />,
          title: "Not Found",
          defaultMessage: ERRORS.NOT_FOUND,
        };
      case "wallet":
        return {
          icon: <WalletCards className="text-orange-600" size={48} />,
          title: "Wallet Error",
          defaultMessage: ERRORS.WALLET,
        };
      case "contract":
        return {
          icon: <AlertCircle className="text-red-600" size={48} />,
          title: "Something went wrong",
          defaultMessage: ERRORS.CONTRACT,
        };
      case "timeout":
        return {
          icon: <AlertCircle className="text-yellow-600" size={48} />,
          title: "Request Timed Out",
          defaultMessage: "The request timed out. Please try again.",
        };
      case "validation":
        return {
          icon: <AlertCircle className="text-orange-500" size={48} />,
          title: "Invalid Input",
          defaultMessage: "Please check your input and try again.",
        };
      case "unknown":
      default:
        return {
          icon: <AlertCircle className="text-gray-600" size={48} />,
          title: "Unexpected Error",
          defaultMessage: "An unexpected error occurred. Please try again.",
        };
    }
  };

  const content = getContent();

  const handleGoHome = () => {
    navigate('/');
  };

  const toggleErrorDetails = () => {
    setShowErrorDetails(!showErrorDetails);
  };

  return (
    <div className={`flex items-center justify-center py-12 px-4 ${className}`}>
      <Card className="max-w-md w-full text-center" padding="lg">
        <div className="flex justify-center mb-6">
          <div className="p-4 bg-gray-50 border-2 border-black">
            {content.icon}
          </div>
        </div>

        <h3 className="text-2xl font-black uppercase mb-3 tracking-tight">
          {content.title}
        </h3>

        <p className="font-bold text-gray-600 mb-8 leading-relaxed">
          {message || content.defaultMessage}
        </p>

        <div className="space-y-3">
          {onRetry && (
            <Button
              onClick={onRetry}
              variant="primary"
              className="w-full flex items-center justify-center gap-2"
            >
              <RefreshCcw size={18} />
              Try Again
            </Button>
          )}
          
          <Button
            onClick={handleGoHome}
            variant="secondary"
            className="w-full flex items-center justify-center gap-2"
          >
            <Home size={18} />
            Go Home
          </Button>
        </div>

        {/* Error Details - Development Only */}
        {import.meta.env.DEV && error && (
          <div className="mt-6 pt-6 border-t border-gray-200">
            <Button
              onClick={toggleErrorDetails}
              variant="ghost"
              className="w-full flex items-center justify-center gap-2 text-sm"
            >
              <Bug size={16} />
              Error Details
              {showErrorDetails ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </Button>
            
            {showErrorDetails && (
              <div className="mt-4 text-left bg-gray-50 border border-gray-300 rounded p-4">
                <div className="space-y-2">
                  <div>
                    <strong>Error:</strong>
                    <pre className="text-xs text-red-600 mt-1 whitespace-pre-wrap">
                      {error.message}
                    </pre>
                  </div>
                  {error.stack && (
                    <div>
                      <strong>Stack Trace:</strong>
                      <pre className="text-xs text-gray-600 mt-1 whitespace-pre-wrap">
                        {error.stack}
                      </pre>
                    </div>
                  )}
                  {errorInfo?.componentStack && (
                    <div>
                      <strong>Component Stack:</strong>
                      <pre className="text-xs text-blue-600 mt-1 whitespace-pre-wrap">
                        {errorInfo.componentStack}
                      </pre>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </Card>
    </div>
  );
};

export default ErrorState;
