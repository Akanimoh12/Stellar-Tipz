import React from "react";
import { AnimatePresence, motion } from "framer-motion";

import type { Profile } from "../../types";
import Button from "../../components/ui/Button";
import { useWallet } from "../../hooks/useWallet";
import { getExplorerTxUrl } from "../../helpers/network";
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

  return (
    <motion.section
      initial={{ opacity: 0, y: 16, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="relative overflow-hidden border-2 border-black bg-white p-6"
    >
      {status === "success" && (
        <>
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,#fde68a_0%,transparent_35%),radial-gradient(circle_at_80%_15%,#bfdbfe_0%,transparent_32%),radial-gradient(circle_at_60%_80%,#fecaca_0%,transparent_30%)]" />
          <div className="pointer-events-none absolute inset-0">
            <span className="confetti confetti-a" />
            <span className="confetti confetti-b" />
            <span className="confetti confetti-c" />
            <span className="confetti confetti-d" />
            <span className="confetti confetti-e" />
          </div>
        </>
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
            <Button type="button" onClick={onPrimaryAction}>
              Send Another
            </Button>
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

      <AnimatePresence>
        {status === "success" && (
          <motion.style
            key="confetti-style"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            {`
              .confetti {
                position: absolute;
                width: 10px;
                height: 16px;
                opacity: 0.9;
                animation: tip-result-fall 1.8s ease-in infinite;
              }
              .confetti-a { left: 8%; top: -12%; background: #f97316; animation-delay: 0s; }
              .confetti-b { left: 26%; top: -15%; background: #2563eb; animation-delay: 0.3s; }
              .confetti-c { left: 50%; top: -10%; background: #16a34a; animation-delay: 0.15s; }
              .confetti-d { left: 72%; top: -16%; background: #ef4444; animation-delay: 0.45s; }
              .confetti-e { left: 90%; top: -11%; background: #eab308; animation-delay: 0.6s; }
              @keyframes tip-result-fall {
                0% { transform: translateY(0) rotate(0deg); }
                100% { transform: translateY(180px) rotate(230deg); }
              }
            `}
          </motion.style>
        )}
      </AnimatePresence>
    </motion.section>
  );
};

export default TipResult;
