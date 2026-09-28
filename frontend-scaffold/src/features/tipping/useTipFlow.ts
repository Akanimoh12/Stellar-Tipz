import { useCallback, useEffect, useMemo, useState } from "react";

import { useTipz } from "../../hooks";
import { logger } from "../../services/logger";

export type TipFlowStep =
  | "form"
  | "confirm"
  | "preparing"
  | "signing"
  | "submitting"
  | "confirming"
  | "success"
  | "queued"
  | "error";

interface UseTipFlowReturn {
  step: TipFlowStep;
  goToConfirm: (amount: string, message: string, isEncrypted?: boolean) => void;
  confirmAndSign: () => Promise<void>;
  retry: () => Promise<void>;
  reset: () => void;
  error: string | null;
  txHash: string | null;
}

export const useTipFlow = (creatorAddress: string): UseTipFlowReturn => {
  const { sendTip, txHash, txStatus, error, reset: resetTipz } = useTipz();
  const [step, setStep] = useState<TipFlowStep>("form");
  const [draft, setDraft] = useState<{
    amount: string;
    message: string;
    isEncrypted: boolean;
  } | null>(null);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (txStatus === "signing") {
        setStep("signing");
        return;
      }

      if (txStatus === "submitting" || txStatus === "confirming") {
        setStep(txStatus);
        return;
      }

      if (txStatus === "success") {
        setStep("success");
        return;
      }

      if (txStatus === "error") {
        setStep("error");
      }
    }, 0);
    return () => clearTimeout(timeoutId);
  }, [txStatus]);

  const goToConfirm = useCallback((amount: string, message: string, isEncrypted = false) => {
    setDraft({ amount, message, isEncrypted });
    setStep("confirm");
  }, []);

  const confirmAndSign = useCallback(async () => {
    if (!draft) {
      setStep("form");
      return;
    }

    setStep("preparing");

    // Block offline submission per #1311: transactions cannot be queued offline
    // to prevent sequence desynchronization, fee mismatch, and stale recipient state.
    if (!navigator.onLine) {
      logger.warn(
        'features/tipping/useTipFlow',
        'Cannot sign transactions offline',
        { creator: creatorAddress },
      );
      setStep("error");
      return;
    }

    await sendTip(creatorAddress, draft.amount, draft.message, draft.isEncrypted);
  }, [creatorAddress, draft, sendTip]);

  const reset = useCallback(() => {
    setStep("form");
    setDraft(null);
    resetTipz();
  }, [resetTipz]);

  return useMemo(
    () => ({
      step,
      goToConfirm,
      confirmAndSign,
      retry: confirmAndSign,
      reset,
      error,
      txHash,
    }),
    [step, goToConfirm, confirmAndSign, reset, error, txHash],
  );
};
