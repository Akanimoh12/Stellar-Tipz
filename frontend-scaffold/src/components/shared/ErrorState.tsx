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
  Clock,
  ExternalLink,
} from "lucide-react";
import Card from "../ui/Card";
import Button from "../ui/Button";
import { ErrorCategory, ErrorInfo } from "@/helpers/error";
import { useNavigate } from "react-router-dom";
import { useI18n } from "@/i18n";

interface ErrorStateProps {
  message?: string;
  onRetry?: () => void;
  category?: ErrorCategory;
  className?: string;
  error?: Error | null;
  errorInfo?: React.ErrorInfo | null;
  errorData?: ErrorInfo;
}

const WALLET_INSTALLS = [
  { name: "Freighter", url: "https://freighter.app" },
  { name: "xBull", url: "https://xbull.app" },
  { name: "Albedo", url: "https://albedo.link" },
];

const ErrorState: React.FC<ErrorStateProps> = ({
  message,
  onRetry,
  category = "unknown",
  className = "",
  error,
  errorInfo,
  errorData,
}) => {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [showErrorDetails, setShowErrorDetails] = useState(false);
  
  // Use errorData if provided, otherwise fall back to category/message pattern
  const effectiveCategory = errorData?.category || category;
  const effectiveMessage = errorData?.message || message;
  const effectiveRetryable = errorData?.retryable !== undefined ? errorData.retryable : true;
  
  const getContent = () => {
    switch (effectiveCategory) {
      case "network":
        return {
          icon: (
            <div className="relative">
              <WifiOff className="text-red-600" size={48} strokeWidth={1.5} />
              <span className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-red-500 border border-black" />
            </div>
          ),
          title: t("error.connectionLost"),
          defaultMessage: t("error.networkMessage"),
        };
      case "not-found":
        return {
          icon: (
            <div className="relative">
              <FileSearch className="text-blue-600" size={48} strokeWidth={1.5} />
              <span className="absolute -bottom-1 -right-1 text-lg">404</span>
            </div>
          ),
          title: t("error.pageNotFound"),
          defaultMessage: t("error.notFoundMessage"),
        };
      case "wallet":
        return {
          icon: <WalletCards className="text-orange-600" size={48} strokeWidth={1.5} />,
          title: t("error.walletNotFound"),
          defaultMessage: t("error.walletMessage"),
        };
      case "contract":
        return {
          icon: (
            <div className="relative">
              <AlertCircle className="text-red-600" size={48} strokeWidth={1.5} />
              <span className="absolute -bottom-1 -right-1 text-xs font-black text-red-600">!</span>
            </div>
          ),
          title: t("error.somethingWrong"),
          defaultMessage: t("error.contractMessage"),
        };
      case "timeout":
        return {
          icon: <Clock className="text-yellow-600" size={48} strokeWidth={1.5} />,
          title: t("error.requestTimedOut"),
          defaultMessage: t("error.requestTimedOutMessage"),
        };
      case "validation":
        return {
          icon: <AlertCircle className="text-orange-500" size={48} strokeWidth={1.5} />,
          title: t("error.invalidInput"),
          defaultMessage: t("error.invalidInputMessage"),
        };
      case "rate-limited":
        return {
          icon: (
            <div className="relative">
              <Clock className="text-purple-600" size={48} strokeWidth={1.5} />
              <span className="absolute -bottom-1 -right-1 text-xs font-black text-purple-600">429</span>
            </div>
          ),
          title: t("error.tooManyRequests"),
          defaultMessage: t("error.rateLimitedMessage"),
        };
      case "unknown":
      default:
        return {
          icon: <AlertCircle className="text-gray-600" size={48} strokeWidth={1.5} />,
          title: t("error.unexpected"),
          defaultMessage: t("error.unexpectedMessage"),
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
    <div
      className={`flex items-center justify-center py-12 px-4 ${className}`}
      role="alert"
      aria-live="assertive"
      aria-atomic="true"
    >
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
          {effectiveMessage || content.defaultMessage}
        </p>

        <div className="space-y-3">
          {onRetry && effectiveRetryable && (
            <Button
              onClick={onRetry}
              variant="primary"
              className="w-full flex items-center justify-center gap-2"
            >
              <RefreshCcw size={18} />
              {t("common.tryAgain")}
            </Button>
          )}

          {effectiveCategory === "wallet" && (
            <div className="space-y-2 pt-2 border-t border-gray-200">
              <p className="text-xs font-black uppercase tracking-wide text-gray-500">
                {t("error.installWallet")}
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                {WALLET_INSTALLS.map((w) => (
                  <a
                    key={w.name}
                    href={w.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-bold uppercase border-2 border-black bg-white hover:-translate-x-0.5 hover:-translate-y-0.5 transition-transform duration-150"
                    style={{ boxShadow: "2px 2px 0px 0px rgba(0,0,0,1)" }}
                  >
                    {w.name}
                    <ExternalLink size={14} />
                  </a>
                ))}
              </div>
            </div>
          )}

          <Button
            onClick={handleGoHome}
            variant="outline"
            className="w-full flex items-center justify-center gap-2"
          >
            <Home size={18} />
            {t("common.goHome")}
          </Button>
        </div>

        {/* Error Details - Development Only */}
        {(import.meta.env.DEV || errorData?.technicalDetails) && (error || errorData?.technicalDetails) && (
          <div className="mt-6 pt-6 border-t border-gray-200">
            <Button
              onClick={toggleErrorDetails}
              variant="ghost"
              className="w-full flex items-center justify-center gap-2 text-sm"
            >
              <Bug size={16} />
              {t("common.errorDetails")}
              {showErrorDetails ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </Button>

            {showErrorDetails && (
              <div className="mt-4 text-left bg-gray-50 border border-gray-300 rounded p-4">
                <div className="space-y-2">
                  {errorData?.technicalDetails && (
                    <div>
                      <strong>Technical Details</strong>
                      <pre className="text-xs text-gray-600 mt-1 whitespace-pre-wrap">
                        {errorData.technicalDetails}
                      </pre>
                    </div>
                  )}
                  {error && (
                    <div>
                      <strong>{t("common.error")}</strong>
                      <pre className="text-xs text-red-600 mt-1 whitespace-pre-wrap">
                        {error.message}
                      </pre>
                    </div>
                  )}
                  {error?.stack && (
                    <div>
                      <strong>{t("common.stackTrace")}</strong>
                      <pre className="text-xs text-gray-600 mt-1 whitespace-pre-wrap">
                        {error.stack}
                      </pre>
                    </div>
                  )}
                  {errorInfo?.componentStack && (
                    <div>
                      <strong>{t("common.componentStack")}</strong>
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
