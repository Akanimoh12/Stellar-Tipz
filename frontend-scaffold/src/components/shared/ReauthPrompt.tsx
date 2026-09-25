import React, { useState } from "react";
import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";
import {
  dismissReauth,
  refreshTokens,
  useAuthStatus,
} from "@/services/auth/tokenManager";
import { useToastStore } from "@/store/toastStore";

interface ReauthPromptProps {
  /** Called after a successful re-authentication. */
  onReauthenticated?: () => void;
}

/**
 * Modal shown when the session needs re-authentication (expired refresh
 * token, idle timeout, or a failed refresh). Preserves form drafts and
 * localStorage — dismissing simply continues without a signed-in session.
 */
const ReauthPrompt: React.FC<ReauthPromptProps> = ({ onReauthenticated }) => {
  const status = useAuthStatus();
  const [busy, setBusy] = useState(false);
  const addToast = useToastStore((s) => s.addToast);

  const isOpen = status === "reauth-required";

  const handleTryAgain = async () => {
    setBusy(true);
    try {
      const result = await refreshTokens();
      if (result) {
        addToast({
          message: "Signed in again.",
          type: "success",
          duration: 4000,
        });
        onReauthenticated?.();
      } else {
        addToast({
          message: "Sign-in failed. Check your connection and try again.",
          type: "error",
          duration: 6000,
        });
      }
    } finally {
      setBusy(false);
    }
  };

  const handleDismiss = () => {
    dismissReauth();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleDismiss}
      title="Sign in required"
      closeOnBackdropClick={false}
    >
      <div className="space-y-4">
        <p className="text-sm font-bold text-gray-800">
          Your session has expired. Sign in again to continue. Unsaved form data
          and drafts have been kept.
        </p>
        <div className="flex flex-col gap-3 sm:flex-row">
          <Button
            type="button"
            onClick={() => void handleTryAgain()}
            loading={busy}
            disabled={busy}
            className="flex-1"
          >
            Try again
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={handleDismiss}
            disabled={busy}
            className="flex-1"
          >
            Continue without signing in
          </Button>
        </div>
      </div>
    </Modal>
  );
};

export default ReauthPrompt;
