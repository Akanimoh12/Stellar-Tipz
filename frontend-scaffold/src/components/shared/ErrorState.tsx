import React from "react";
import {
  AlertCircle,
  RefreshCcw,
  WifiOff,
  FileSearch,
  WalletCards,
} from "lucide-react";
import Card from "../ui/Card";
import Button from "../ui/Button";
import { ERRORS, ErrorCategory } from "@/helpers/error";

interface ErrorStateProps {
  message?: string;
  onRetry?: () => void;
  category?: ErrorCategory;
  className?: string;
}

const ErrorState: React.FC<ErrorStateProps> = ({
  message,
  onRetry,
  category = "unknown",
  className = "",
}) => {
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
      </Card>
    </div>
  );
};

export default ErrorState;
