/**
 * Inline alert shown when registration requires a wallet but one is not
 * connected, or when the previous wallet connection failed.
 *
 * Extracted from RegisterForm to keep the parent component focused on form
 * logic rather than wallet-recovery UX.
 */

import React from "react";
import Button from "@/components/ui/Button";
import { analytics } from "@/services/analytics";

interface WalletRecoveryBannerProps {
  walletError: string | null | undefined;
  connecting: boolean;
  onConnect: () => Promise<void>;
}

export const WalletRecoveryBanner: React.FC<WalletRecoveryBannerProps> = ({
  walletError,
  connecting,
  onConnect,
}) => (
  <div
    role="alert"
    data-testid="wallet-recovery"
    className="rounded-md border-2 border-amber-500 bg-amber-50 p-4"
  >
    <p className="text-sm font-bold text-gray-900">
      Your profile is ready, but a wallet is needed to finish registering.
    </p>
    <p className="mt-1 text-sm text-gray-800">
      {walletError
        ? `We couldn't reach your wallet: ${walletError}.`
        : "Registration is confirmed on the Stellar network, so a connected wallet has to approve the transaction."}{" "}
      Your details are saved — reconnect the same wallet and press Register
      again, and nothing has to be retyped.
    </p>
    <Button
      type="button"
      variant="primary"
      size="md"
      className="mt-3 w-full sm:w-auto"
      disabled={connecting}
      onClick={() => {
        analytics.trackEvent("onboarding_wallet_reconnect_attempted", {
          step: "wallet",
        });
        void onConnect().catch(() => {
          analytics.trackEvent("onboarding_wallet_reconnect_failed", {
            step: "wallet",
          });
        });
      }}
    >
      {connecting ? "Reconnecting…" : "Reconnect wallet"}
    </Button>
  </div>
);
