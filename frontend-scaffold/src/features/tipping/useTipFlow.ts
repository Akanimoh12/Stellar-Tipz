import { useCallback, useEffect, useMemo, useState } from "react";

import { useTipz } from "../../hooks";

export type TipFlowStep =
  | "form"
  | "confirm"
  | "signing"
  | "submitting"
  | "success"
  | "error";

interface UseTipFlowReturn {
  step: TipFlowStep;
  goToConfirm: (amount: string, message: string) => void;
  confirmAndSign: () => Promise<void>;
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
  } | null>(null);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (txStatus === "signing") {
        setStep("signing");
        return;
      }

      if (txStatus === "submitting" || txStatus === "confirming") {
        setStep("submitting");
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

  const goToConfirm = useCallback((amount: string, message: string) => {
    setDraft({ amount, message });
    setStep("confirm");
  }, []);

  const confirmAndSign = useCallback(async () => {
    if (!draft) {
      setStep("form");
      return;
    }

    await sendTip(creatorAddress, draft.amount, draft.message);
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
      reset,
      error,
      txHash,
    }),
    [step, goToConfirm, confirmAndSign, reset, error, txHash],
  );
};
