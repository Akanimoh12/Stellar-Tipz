import React from "react";
import {
  ArrowDownToLine,
  Copy,
  Pencil,
  Share2,
} from "lucide-react";
import { useNavigate } from "react-router-dom";

import { useToastStore } from "../../store/toastStore";

interface QuickActionsProps {
  balance: string;
  tipLink: string;
  onWithdraw: () => void;
}

interface ActionCardProps {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}

const ActionCard: React.FC<ActionCardProps> = ({
  icon,
  label,
  onClick,
  disabled = false,
}) => {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex min-h-[110px] flex-col items-start gap-4 border-[3px] border-black bg-white p-5 text-left transition-transform duration-200 hover:-translate-x-1 hover:-translate-y-1 disabled:cursor-not-allowed disabled:opacity-50"
      style={{ boxShadow: "6px 6px 0px 0px rgba(0,0,0,1)" }}
    >
      <span className="inline-flex h-11 w-11 items-center justify-center border-2 border-black bg-[#f5f5f5]">
        {icon}
      </span>
      <span className="text-sm font-black uppercase leading-5">{label}</span>
    </button>
  );
};

const QuickActions: React.FC<QuickActionsProps> = ({
  balance,
  tipLink,
  onWithdraw,
}) => {
  const navigate = useNavigate();
  const { addToast } = useToastStore();
  const hasBalance = BigInt(balance || "0") > BigInt(0);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(tipLink);
      addToast({
        message: "Tip link copied to clipboard.",
        type: "success",
        duration: 3000,
      });
    } catch {
      addToast({
        message: "Could not copy the tip link.",
        type: "error",
        duration: 3000,
      });
    }
  };

  const handleShare = () => {
    const shareUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(
      `Support me on Stellar Tipz: ${tipLink}`
    )}`;
    window.open(shareUrl, "_blank", "noopener,noreferrer");
  };

  return (
    <section className="space-y-4">
      <div>
        <p className="text-xs font-black uppercase tracking-[0.25em] text-gray-500">
          Quick actions
        </p>
        <h2 className="mt-2 text-2xl font-black uppercase">Move fast</h2>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <ActionCard
          icon={<ArrowDownToLine size={20} />}
          label={hasBalance ? "Withdraw" : "No balance yet"}
          onClick={onWithdraw}
          disabled={!hasBalance}
        />
        <ActionCard
          icon={<Copy size={20} />}
          label="Copy tip link"
          onClick={() => void handleCopy()}
        />
        <ActionCard
          icon={<Share2 size={20} />}
          label="Share on X"
          onClick={handleShare}
        />
        <ActionCard
          icon={<Pencil size={20} />}
          label="Edit profile"
          onClick={() => navigate("/profile/edit")}
        />
      </div>
    </section>
  );
};

export default QuickActions;
