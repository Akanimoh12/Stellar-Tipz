import React from "react";
import Button from "../ui/Button";
import CopyButton from "../ui/CopyButton";
import Loader from "../ui/Loader";
import { useWallet } from "../../hooks/useWallet";
import { useLiveRegion } from "../../lib/liveRegion";

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
  const { announce } = useLiveRegion();

  // Announce transaction status changes (must be before any early return
  // to keep hook order stable)
  React.useEffect(() => {
    if (status === "idle") return;
    switch (status) {
      case "signing":
        announce("Starting transaction signing");
        break;
      case "submitting":
        announce("Submitting transaction to network");
        break;
      case "confirming":
        announce("Waiting for network confirmation");
        break;
      case "success":
        announce(`Transaction confirmed. View on Stellar Expert`, "assertive");
        break;
      case "error":
        announce(`Transaction failed: ${errorMessage || "unknown error"}`, "assertive");
        break;
    }
  }, [status, errorMessage, announce]);

  if (status === "idle") return null;

  const isLoading = ["signing", "submitting", "confirming"].includes(status);
  const liveRegionProps =
    status === "error"
      ? { role: "alert", "aria-live": "assertive" as const }
      : { role: "status", "aria-live": "polite" as const };
  const explorerBase =
    network === "PUBLIC"
      ? "https://stellar.expert/explorer/public/tx/"
      : "https://stellar.expert/explorer/testnet/tx/";

  return (
    <div
      className="border-2 border-black p-4 text-center"
      aria-atomic="true"
      aria-busy={isLoading ? "true" : "false"}
      {...liveRegionProps}
    >
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
