import React, { useEffect } from "react";
import { motion } from "framer-motion";

import type { Profile } from "../../types";
import Button from "../../components/ui/Button";
import ShareButton from "../../components/shared/ShareButton";
import { useWallet } from "../../hooks/useWallet";
import { useReducedMotion } from "../../hooks/useReducedMotion";
import { celebrate } from "../../helpers/confetti";
import { createTipShareData } from "../../helpers/sharing";
import TipReceipt from "./TipReceipt";

interface TipResultProps {
  status: "success" | "error";
  txHash?: string;
  amount?: string;
  creator?: Profile;
  errorMessage?: string;
  onPrimaryAction?: () => void;
}

const TipResult: React.FC<TipResultProps> = ({
  status,
  txHash,
  amount,
  creator,
  errorMessage,
  onPrimaryAction,
}) => {
  const { publicKey } = useWallet();
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (status !== "success" || reduceMotion) {
      return;
    }

    // Decorative celebration. `celebrate` is a no-op when motion is reduced,
    // so the success state never depends on the confetti to be perceived.
    celebrate();
  }, [status, reduceMotion]);

  return (
    <motion.section
      initial={{ opacity: 0, y: reduceMotion ? 0 : 16, scale: reduceMotion ? 1 : 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: reduceMotion ? 0 : 0.35, ease: "easeOut" }}
      data-reduced-motion={reduceMotion ? "true" : undefined}
      className="relative overflow-hidden border-2 border-black bg-white p-6"
      role={status === "error" ? "alert" : "status"}
      aria-live={status === "error" ? "assertive" : "polite"}
      aria-atomic="true"
    >
      {status === "success" && (
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,#fde68a_0%,transparent_35%),radial-gradient(circle_at_80%_15%,#bfdbfe_0%,transparent_32%),radial-gradient(circle_at_60%_80%,#fecaca_0%,transparent_30%)]" />
      )}

      <div className="relative z-10 space-y-4">
        {status === "success" ? (
          <>
            <h3 className="text-3xl font-black uppercase tracking-tight">Tip sent! 🎉</h3>
            <p className="text-sm font-medium text-gray-700">
              {amount ? `${amount} XLM sent` : "Your tip was sent"}
              {creator ? ` to ${creator.displayName}` : ""}.
            </p>
            {txHash && (
              <TipReceipt 
                txHash={txHash}
                amount={amount}
                sender={publicKey || undefined}
                receiver={creator?.username || creator?.displayName}
              />
            )}
            <div className="flex gap-3">
              <Button type="button" onClick={onPrimaryAction} className="flex-1">
                Send Another
              </Button>
              {creator && amount && (
                <ShareButton
                  type="tip"
                  data={createTipShareData(
                    parseFloat(amount),
                    creator.username,
                    undefined,
                    true // isSender
                  )}
                  variant="button"
                  size="md"
                />
              )}
            </div>
          </>
        ) : (
          <>
            <h3 className="text-2xl font-black uppercase text-red-700">Payment failed</h3>
            <p className="text-sm font-medium text-gray-700">
              {errorMessage || "Something went wrong while sending your tip."}
            </p>
            <Button type="button" variant="outline" onClick={onPrimaryAction}>
              Try Again
            </Button>
          </>
        )}
      </div>
    </motion.section>
  );
};

export default TipResult;
