import React from "react";
import Button from "../ui/Button";
import CopyButton from "../ui/CopyButton";
import Loader from "../ui/Loader";
import { useWallet } from "../../hooks/useWallet";

interface TransactionStatusProps {
  status:
    | "idle"
    | "signing"
    | "submitting"
    | "confirming"
    | "success"
    | "error";
  txHash?: string;
  errorMessage?: string;
  onRetry?: () => void;
}

const statusMessages: Record<string, string> = {
  idle: "",
  signing: "Waiting for wallet signature...",
  submitting: "Submitting transaction...",
  confirming: "Confirming on network...",
  success: "Transaction confirmed!",
  error: "Transaction failed",
};

const TransactionStatus: React.FC<TransactionStatusProps> = ({
  status,
  txHash,
  errorMessage,
  onRetry,
}) => {
  const { network } = useWallet();
  if (status === "idle") return null;

  const isLoading = ["signing", "submitting", "confirming"].includes(status);
  const explorerBase =
    network === "PUBLIC"
      ? "https://stellar.expert/explorer/public/tx/"
      : "https://stellar.expert/explorer/testnet/tx/";

  return (
    <div className="border-2 border-black p-4 text-center">
      {isLoading && <Loader text={statusMessages[status]} />}

      {status === "success" && (
        <div>
          <p className="text-lg font-black text-green-800 mb-2">
            {statusMessages.success}
          </p>
          {txHash && (
            <div className="flex flex-col items-center gap-3">
              <a
                href={`${explorerBase}${txHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm underline font-bold"
              >
                View on Stellar Expert →
              </a>
              <CopyButton text={txHash} label="Copy TX Hash" />
            </div>
          )}
        </div>
      )}

      {status === "error" && (
        <div className="flex flex-col items-center gap-3">
          <p className="text-lg font-black text-red-800">
            {errorMessage || statusMessages.error}
          </p>
          {onRetry && (
            <Button variant="outline" size="sm" onClick={onRetry}>
              Try Again
            </Button>
          )}
        </div>
      )}
    </div>
  );
};

export default TransactionStatus;
