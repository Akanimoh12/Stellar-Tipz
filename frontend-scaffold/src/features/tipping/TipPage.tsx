import React, { useState, useEffect, useCallback } from "react";
import {
  AlertTriangle,
  ArrowRight,
  HeartHandshake,
  Lock,
  LockOpen,
  Wallet,
} from "lucide-react";
import { useParams } from "react-router-dom";

import PageContainer from "../../components/layout/PageContainer";
import Breadcrumbs from "../../components/shared/Breadcrumbs";
import Button from "../../components/ui/Button";
import Card from "../../components/ui/Card";
import Textarea from "../../components/ui/Textarea";
import { useWallet, useContract, useTransactionGuard } from "../../hooks";
import ErrorState from "../../components/shared/ErrorState";
import { categorizeError, ERRORS } from "@/helpers/error";
import {
  MAX_MESSAGE_LENGTH,
  canTipAddress,
  sanitizeStellarAddress,
} from "@/helpers/validation";
import { Profile } from "@/types/contract";
import TipPageSkeleton from "./TipPageSkeleton";
import TipAmountInput from "./TipAmountInput";
import TipResult from "./TipResult";
import { useGoalStore } from "@/store/goalStore";
import { TipConfirmationModal } from "./TipConfirmationModal";
import { useTipFlow } from "./useTipFlow";
import { usePageMeta } from "@/hooks/usePageMeta";
import CreatorNotFound from "./CreatorNotFound";
import TipAmountPresets from "./TipAmountPresets";
import TransactionTracker, {
  TransactionTrackerStatus,
} from "./TransactionTracker";
import { useFormAutosave } from "@/hooks/useFormAutosave";
import DraftRestoreBanner from "@/components/shared/DraftRestoreBanner";
import TransactionRestoredNotice from "@/components/shared/TransactionRestoredNotice";
import ErrorSummary, {
  ErrorSummaryItem,
} from "@/components/shared/ErrorSummary";
import { logger } from "../../services/logger";
import TipCreatorCard from "./TipCreatorCard";
import TipPageContext from "./TipPageContext";
import TipCreatorAchievements from "./TipCreatorAchievements";
import { useWalletStore } from "@/store/walletStore";
import { env } from "@/helpers/env";

const TipPage: React.FC = () => {
  const { username } = useParams<{ username: string }>();
  const { connected, connect, publicKey: connectedWallet } = useWallet();
  const [amount, setAmount] = useState("5");
  const [message, setMessage] = useState("");
  const [isEncrypted, setIsEncrypted] = useState(false);
  const [addressError, setAddressError] = useState<string | null>(null);
  // Error summary for accessible form-level error announcement.
  const [tipFormErrors, setTipFormErrors] = useState<ErrorSummaryItem[]>([]);
  const { getProfileByUsername } = useContract();
  const [loading, setLoading] = useState(true);
  const [creator, setCreator] = useState<Profile | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const goals = useGoalStore((s) => s.goals);
  const creatorGoal = creator
    ? goals.find((g) => g.creator === creator.owner && g.active)
    : undefined;

  // Detect a mismatch between the wallet's reported network and the app's
  // configured network. LOCAL is treated as equivalent to TESTNET for this
  // check because local devnets use the testnet passphrase.
  const walletNetwork = useWalletStore((s) => s.network);
  const appNetwork = env.network === "LOCAL" ? "TESTNET" : env.network;
  const isNetworkMismatch = connected && walletNetwork !== appNetwork;

  const fetchCreator = useCallback(async () => {
    if (!username) return;
    setLoading(true);
    setFetchError(null);
    try {
      const profile = await getProfileByUsername(username);
      setCreator(profile);
    } catch (err) {
      logger.error(
        "features/tipping/TipPage",
        "Failed to fetch creator",
        undefined,
        err instanceof Error ? err : new Error(String(err)),
      );
      setFetchError(String(err));
    } finally {
      setLoading(false);
    }
  }, [username, getProfileByUsername]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetchCreator performs async contract I/O before state updates settle.
    fetchCreator();
  }, [fetchCreator]);

  usePageMeta({
    title: loading
      ? "Loading..."
      : creator
      ? `Tip @${creator.username}`
      : "Creator Not Found",
    description: creator
      ? `Send a tip to ${
          creator.displayName || creator.username
        } on Stellar Tipz - decentralized, instant, and fair tipping on Stellar Blockchain`
      : undefined,
    ogUrl: creator
      ? `${window.location.origin}/@${creator.username}`
      : undefined,
  });

  const {
    step,
    goToConfirm,
    confirmAndSign,
    retry,
    reset,
    error: flowError,
    txHash,
  } = useTipFlow(creator?.owner || "");

  // Transaction guard to prevent duplicate submissions
  const {
    isPending: isTransactionPending,
    startTransaction,
    restored: txRestored,
    reset: resetTransactionGuard,
  } = useTransactionGuard();

  const {
    hasDraft,
    draftSavedAt,
    restoreDraft,
    discardDraft: discardTipDraft,
    clearSaved: clearTipDraft,
  } = useFormAutosave({
    storageKey: "tipz_tip_form",
    data: { amount, message },
    onRestore: (saved) => {
      if (typeof saved.amount === "string") setAmount(saved.amount);
      if (typeof saved.message === "string") setMessage(saved.message);
    },
  });

  useEffect(() => {
    if (step === "success") {
      clearTipDraft();
    }
  }, [step, clearTipDraft]);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAddressError(null);
    setTipFormErrors([]);

    // Guard against submission during pending transaction
    if (isTransactionPending || step === "signing" || step === "submitting") {
      return;
    }

    // Validate and sanitize the creator's wallet address before proceeding
    const creatorAddress = creator?.owner ?? "";
    const sanitized = sanitizeStellarAddress(creatorAddress);
    if (!sanitized) {
      const msg = "Creator wallet address is invalid. Cannot send tip.";
      setAddressError(msg);
      setTipFormErrors([
        {
          fieldId: "tip-address-error",
          label: "Creator Address",
          message: msg,
        },
      ]);
      return;
    }

    const tipCheck = canTipAddress(sanitized, connectedWallet ?? undefined);
    if (!tipCheck.valid) {
      const msg = tipCheck.error ?? "Cannot tip this address.";
      setAddressError(msg);
      setTipFormErrors([
        {
          fieldId: "tip-address-error",
          label: "Creator Address",
          message: msg,
        },
      ]);
      return;
    }

    // Block signing when the wallet is on a different network than the app.
    if (isNetworkMismatch) {
      const msg = `Network mismatch: your wallet is on ${walletNetwork} but this app is configured for ${appNetwork}. Switch your wallet to ${appNetwork} before signing.`;
      setAddressError(msg);
      setTipFormErrors([
        {
          fieldId: "tip-address-error",
          label: "Network",
          message: msg,
        },
      ]);
      return;
    }

    goToConfirm(amount, message, isEncrypted);
  };

  // Wrapped confirm handler with transaction guard
  const handleConfirmAndSign = useCallback(async () => {
    await startTransaction(async () => {
      await confirmAndSign();
    });
  }, [confirmAndSign, startTransaction]);

  if (loading) {
    return <TipPageSkeleton />;
  }

  if (fetchError || !creator) {
    if (!creator && !loading) {
      return <CreatorNotFound username={username} />;
    }

    return (
      <PageContainer maxWidth="xl" className="py-20">
        <ErrorState
          errorData={categorizeError(fetchError || "Not Found")}
          onRetry={fetchCreator}
        />
      </PageContainer>
    );
  }

  return (
    <PageContainer maxWidth="xl" className="space-y-8 py-10 pb-safe">
      <Breadcrumbs
        items={[
          { label: "Home", href: "/" },
          { label: `@${creator.username}` },
        ]}
      />
      <section
        aria-labelledby="tip-creator-heading"
        className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]"
      >
        <TipCreatorCard creator={creator} goal={creatorGoal} />
        <Card className="space-y-5" padding="lg">
          <TransactionRestoredNotice
            restored={txRestored}
            onDismiss={resetTransactionGuard}
          />
          <div>
            <p className="text-xs font-black uppercase tracking-[0.25em] text-gray-800 dark:text-gray-200">
              Send support
            </p>
            <h2 className="mt-2 text-2xl font-black uppercase">Tip in XLM</h2>
          </div>

          <div className="border-2 border-black bg-yellow-100 p-4 text-sm font-bold text-gray-800">
            Any connected wallet can send a tip. Supporters do not need to
            create a Stellar Tipz profile first.
          </div>

          {!connected && (
            <div className="border-2 border-black bg-orange-100 p-4 text-sm font-bold">
              Connect a wallet before signing the transaction.
            </div>
          )}

          {isNetworkMismatch && (
            <div
              role="alert"
              className="border-2 border-black bg-orange-100 p-4 text-sm font-bold flex items-start gap-2"
            >
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
              <span>
                Network mismatch: your wallet is on{" "}
                <strong>{walletNetwork}</strong> but this app requires{" "}
                <strong>{appNetwork}</strong>. Switch your wallet network before
                signing.
              </span>
            </div>
          )}

          {step === "queued" ? (
            <div
              role="status"
              aria-live="polite"
              className="border-2 border-black bg-yellow-100 p-5 space-y-3"
            >
              <p className="text-xl font-black uppercase">Tip queued</p>
              <p className="text-sm font-bold text-gray-700">
                You are offline. Your tip will be sent when online
                automatically.
              </p>
              <button
                type="button"
                className="border-2 border-black bg-black px-4 py-2 text-xs font-black uppercase text-white"
                onClick={reset}
              >
                Send another
              </button>
            </div>
          ) : step === "success" || step === "error" ? (
            <TipResult
              status={step === "success" ? "success" : "error"}
              txHash={txHash ?? undefined}
              amount={amount}
              creator={creator}
              errorMessage={
                flowError
                  ? categorizeError(flowError).category === "network"
                    ? ERRORS.NETWORK
                    : ERRORS.CONTRACT
                  : undefined
              }
              onPrimaryAction={reset}
            />
          ) : (
            <form className="space-y-4" onSubmit={handleSubmit}>
              {hasDraft && (
                <DraftRestoreBanner
                  savedAt={draftSavedAt}
                  onRestore={restoreDraft}
                  onDiscard={discardTipDraft}
                />
              )}

              {/* Error summary — auto-focuses when address/amount errors are present */}
              <ErrorSummary errors={tipFormErrors} />

              <TipAmountPresets
                value={amount}
                onChange={(nextAmount) => setAmount(String(nextAmount))}
              />
              <TipAmountInput
                amount={amount}
                onChange={setAmount}
                creatorAddress={creator.owner}
              />

              {addressError && (
                <div
                  id="tip-address-error"
                  role="alert"
                  className="border-2 border-red-600 bg-red-50 p-3 text-sm font-bold text-red-700"
                >
                  {addressError}
                </div>
              )}

              <Textarea
                label="Message"
                placeholder="Say why you are supporting this creator."
                maxLength={MAX_MESSAGE_LENGTH}
                warnAt={250}
                dangerAt={270}
                showRemaining
                value={message}
                onChange={(event) => setMessage(event.target.value)}
              />

              <button
                type="button"
                onClick={() => setIsEncrypted(!isEncrypted)}
                className={`flex items-center gap-2 border-2 px-3 py-2 text-xs font-black uppercase transition-colors ${
                  isEncrypted
                    ? "border-black bg-green-100 text-green-800"
                    : "border-gray-300 bg-white text-gray-500 hover:border-gray-400"
                }`}
              >
                {isEncrypted ? <Lock size={14} /> : <LockOpen size={14} />}
                {isEncrypted ? "Encrypted message" : "Encrypt message"}
              </button>

              <div className="flex flex-col gap-3 sm:flex-row">
                {connected ? (
                  <Button
                    type="submit"
                    loading={step === "signing" || step === "submitting"}
                    disabled={isNetworkMismatch}
                    icon={<HeartHandshake size={18} />}
                    iconRight={<ArrowRight size={18} />}
                    className="sm:flex-1"
                  >
                    {step === "confirm" ? "Continue" : "Send tip"}
                  </Button>
                ) : (
                  <Button
                    type="button"
                    icon={<Wallet size={18} />}
                    onClick={connect}
                    className="sm:flex-1"
                  >
                    Connect wallet
                  </Button>
                )}

                <Button type="button" variant="outline" onClick={reset}>
                  Clear
                </Button>
              </div>
            </form>
          )}

          <TipConfirmationModal
            isOpen={step === "confirm"}
            onClose={reset}
            onConfirm={() => void handleConfirmAndSign()}
            creator={creator}
            amount={amount}
            message={message}
            isEncrypted={isEncrypted}
            submitting={
              step === "signing" ||
              step === "submitting" ||
              isTransactionPending
            }
          />

          {[
            "preparing",
            "signing",
            "submitting",
            "confirming",
            "success",
            "error",
          ].includes(step) ? (
            <TransactionTracker
              status={step as TransactionTrackerStatus}
              txHash={txHash ?? undefined}
              errorMessage={
                flowError
                  ? categorizeError(flowError).category === "network"
                    ? ERRORS.NETWORK
                    : ERRORS.CONTRACT
                  : undefined
              }
              onRetry={step === "error" ? () => void retry() : undefined}
              onCancel={
                step === "preparing" || step === "signing" ? reset : undefined
              }
            />
          ) : null}
        </Card>
      </section>

      <TipPageContext address={creator.owner} />
      <TipCreatorAchievements
        totalTipsCount={creator.totalTipsCount}
        streak={creator.streak}
      />
    </PageContainer>
  );
};

export default TipPage;
