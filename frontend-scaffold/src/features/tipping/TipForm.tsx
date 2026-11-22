import React, { useState, useEffect } from "react";
import { HeartHandshake, Wallet, ArrowRight } from "lucide-react";

import Button from "../../components/ui/Button";
import { useWallet } from "../../hooks";
import { Profile } from "../../types/contract";
import { useLiveRegion } from "../../lib/liveRegion";
import TipAmountInput from "./TipAmountInput";
import TipMessageInput from "./TipMessageInput";
import TipAmountPresets from "./TipAmountPresets";

interface TipFormProps {
  creator: Profile;
  onSubmit: (amount: string, message: string) => void;
  isSubmitting?: boolean;
}

const TipForm: React.FC<TipFormProps> = ({
  creator,
  onSubmit,
  isSubmitting = false,
}) => {
  const { connected, connect } = useWallet();
  const [amount, setAmount] = useState("5");
  const [message, setMessage] = useState("");
  const { announce } = useLiveRegion();

  useEffect(() => {
    if (isSubmitting) {
      announce("Submitting tip to creator");
    }
  }, [isSubmitting, announce]);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!connected) {
      connect();
      return;
    }
    onSubmit(amount, message);
  };

  const isInvalid = !amount || Number(amount) <= 0;
  const isDisabled = isSubmitting || isInvalid;

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <TipAmountInput amount={amount} onChange={setAmount} />
      <TipAmountPresets
        value={amount}
        onChange={(nextAmount) => setAmount(String(nextAmount))}
      />

      <TipMessageInput
        message={message}
        onChange={setMessage}
        disabled={isSubmitting}
      />

      <div className="flex flex-col gap-3 sm:flex-row">
        {connected ? (
          <Button
            type="submit"
            loading={isSubmitting}
            disabled={isDisabled}
            icon={<HeartHandshake size={18} />}
            iconRight={<ArrowRight size={18} />}
            className="sm:flex-1"
          >
            Send {amount || "0"} XLM to @{creator.username}
          </Button>
        ) : (
          <Button
            type="button"
            icon={<Wallet size={18} />}
            onClick={connect}
            className="sm:flex-1"
          >
            Connect wallet to tip
          </Button>
        )}

        <Button
          type="button"
          variant="outline"
          onClick={() => {
            setAmount("5");
            setMessage("");
          }}
          disabled={isSubmitting}
        >
          Clear
        </Button>
      </div>
    </form>
  );
};

export default TipForm;
