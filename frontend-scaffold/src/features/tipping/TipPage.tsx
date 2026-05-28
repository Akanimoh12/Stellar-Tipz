import React, { useState, useEffect, useCallback } from "react";
import {
  ArrowRight,
  HeartHandshake,
  MessageSquare,
  Wallet,
} from "lucide-react";
import { Link, useParams } from "react-router-dom";

import PageContainer from "../../components/layout/PageContainer";
import Breadcrumbs from "../../components/shared/Breadcrumbs";
import AmountDisplay from "../../components/shared/AmountDisplay";
import CreditBadge from "../../components/shared/CreditBadge";
import VerificationBadge from "../profile/VerificationBadge";
import Avatar from "../../components/ui/Avatar";
import Button from "../../components/ui/Button";
import Card from "../../components/ui/Card";
import Textarea from "../../components/ui/Textarea";
import { useWallet, useContract, useTransactionGuard } from "../../hooks";
import ErrorState from "../../components/shared/ErrorState";
import { categorizeError, ERRORS } from "@/helpers/error";
import { MAX_MESSAGE_LENGTH, canTipAddress, sanitizeStellarAddress } from "@/helpers/validation";
import { Profile } from "@/types/contract";
import TipPageSkeleton from "./TipPageSkeleton";
import TipAmountInput from "./TipAmountInput";
import TipResult from "./TipResult";
import RecentTips from "./RecentTips";
import { TipConfirmationModal } from "./TipConfirmationModal";
import { useTipFlow } from "./useTipFlow";
import { usePageMeta } from "@/hooks/usePageMeta";
import CreatorNotFound from "./CreatorNotFound";
import TipAmountPresets from "./TipAmountPresets";
import TransactionTracker, { TransactionTrackerStatus } from "./TransactionTracker";
import { useFormAutosave } from "@/hooks/useFormAutosave";

const TipPage: React.FC = () => {
  const { username } = useParams<{ username: string }>();
  const { connected, connect, publicKey: connectedWallet } = useWallet();
  const [amount, setAmount] = useState("5");
  const [message, setMessage] = useState("");
  const [addressError, setAddressError] = useState<string | null>(null);
  const { getProfileByUsername } = useContract();
  const [loading, setLoading] = useState(true);
  const [creator, setCreator] = useState<Profile | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const fetchCreator = useCallback(async () => {
    if (!username) return;
    setLoading(true);
    setFetchError(null);
    try {
      const profile = await getProfileByUsername(username);
      setCreator(profile);
    } catch (err) {
      console.error("Failed to fetch creator:", err);
      setFetchError(String(err));
    } finally {
      setLoading(false);
    }
  }, [username, getProfileByUsername]);

  useEffect(() => {
    fetchCreator();
  }, [fetchCreator]);

  usePageMeta({
    title: loading
      ? "Loading..."
      : creator
      ? `Tip @${creator.username}`
      : "Creator Not Found",
    description: creator
      ? `Send a tip to ${creator.displayName || creator.username} on Stellar Tipz - decentralized, instant, and fair tipping on Stellar Blockchain`
      : undefined,
    ogUrl: creator ? `${window.location.origin}/@${creator.username}` : undefined,
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
  const { isPending: isTransactionPending, startTransaction } = useTransactionGuard();

  const { clearSaved: clearTipDraft } = useFormAutosave({
    storageKey: "tipz_tip_form",
    data: { amount, message },
    onRestore: (saved) => {
      if (typeof saved.amount === "string") setAmount(saved.amount);
      if (typeof saved.message === "string") setMessage(saved.message);
    },
    intervalMs: 5000,
    ttlMs: 24 * 60 * 60 * 1000,
    restorePrompt: "Restore saved tip?",
  });

  useEffect(() => {
    if (step === "success") {
      clearTipDraft();
    }
  }, [step, clearTipDraft]);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAddressError(null);

    // Guard against submission during pending transaction
    if (isTransactionPending || step === "signing" || step === "submitting") {
      return;
    }

    // Validate and sanitize the creator's wallet address before proceeding
    const creatorAddress = creator?.owner ?? "";
    const sanitized = sanitizeStellarAddress(creatorAddress);
    if (!sanitized) {
      setAddressError("Creator wallet address is invalid. Cannot send tip.");
      return;
    }

    const tipCheck = canTipAddress(sanitized, connectedWallet ?? undefined);
    if (!tipCheck.valid) {
      setAddressError(tipCheck.error ?? "Cannot tip this address.");
      return;
    }

    goToConfirm(amount, message);
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
          category={categorizeError(fetchError || "Not Found").category}
          message={categorizeError(fetchError || "Not Found").message}
          onRetry={fetchCreator}
        />
      </PageContainer>
    );
  }

  return (
    <PageContainer maxWidth="xl" className="space-y-8 py-10">
      <Breadcrumbs items={[
        { label: 'Home', href: '/' },
        { label: `@${creator.username}` },
      ]} />
      <section aria-labelledby="tip-creator-heading" className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <Card className="space-y-6" padding="lg">
          <div className="flex flex-col gap-5 border-b-2 border-dashed border-black pb-6 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-4">
              <Avatar
                address={creator.owner}
                alt={creator.displayName}
                fallback={creator.displayName}
                size="xl"
              />
              <div>
                <p className="text-xs font-black uppercase tracking-[0.25em] text-gray-800 dark:text-gray-200">
                  Tip creator
                </p>
                <h1 id="tip-creator-heading" className="text-3xl font-black uppercase">
                  {creator.displayName}
                </h1>
                <p className="text-sm font-bold text-gray-600">
                  @{creator.username}
                </p>
                <VerificationBadge
                  isVerified={creator.verification?.isVerified ?? false}
                  verificationType={creator.verification?.verificationType as
                    | "Identity"
                    | "SocialMedia"
                    | "Community"
                    | undefined}
                  domain={creator.domain}
                  domainVerified={creator.domainVerified}
                  className="mt-2"
                />
              </div>
            </div>

            <CreditBadge score={creator.creditScore} />
          </div>

          <p className="max-w-2xl text-base leading-7 text-gray-700">
            {creator.bio}
          </p>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="border-2 border-black bg-yellow-100 p-4">
              <p className="text-xs font-black uppercase tracking-[0.2em] text-gray-600">
                Lifetime tips
              </p>
              <AmountDisplay
                amount={creator.totalTipsReceived}
                className="mt-2 block text-xl"
              />
            </div>
            <div className="border-2 border-black bg-white p-4">
              <p className="text-xs font-black uppercase tracking-[0.2em] text-gray-600">
                Supporters
              </p>
              <p className="mt-2 text-2xl font-black">
                {creator.totalTipsCount}
              </p>
            </div>
            <div className="border-2 border-black bg-white p-4">
              <p className="text-xs font-black uppercase tracking-[0.2em] text-gray-600">
                X followers
              </p>
              <p className="mt-2 text-2xl font-black">
                {creator.xFollowers.toLocaleString()}
              </p>
            </div>
          </div>
        </Card>

        <Card className="space-y-5" padding="lg">
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

          {step === "queued" ? (
            <div
              role="status"
              aria-live="polite"
              className="border-2 border-black bg-yellow-100 p-5 space-y-3"
            >
              <p className="text-xl font-black uppercase">Tip queued</p>
              <p className="text-sm font-bold text-gray-700">
                You are offline. Your tip will be sent when online automatically.
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
                value={message}
                onChange={(event) => setMessage(event.target.value)}
              />

              <div className="flex flex-col gap-3 sm:flex-row">
                {connected ? (
                  <Button
                    type="submit"
                    loading={step === "signing" || step === "submitting"}
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
            submitting={step === "signing" || step === "submitting" || isTransactionPending}
          />

          {["preparing", "signing", "submitting", "confirming", "success", "error"].includes(step) ? (
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
              onCancel={step === "preparing" || step === "signing" ? reset : undefined}
            />
          ) : null}
        </Card>
      </section>

      <section role="region" aria-label="Tipping context and recent activity" className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <Card className="space-y-4">
          <div className="flex items-center gap-3">
            <MessageSquare size={18} />
            <h2 className="text-xl font-black uppercase">
              Why supporters tip here
            </h2>
          </div>
          <ul className="space-y-3 text-sm font-medium leading-6 text-gray-700">
            <li>
              Tips settle quickly on Stellar and creators keep the majority of
              every payment.
            </li>
            <li>
              Every profile has a visible reputation signal through the on-chain
              credit score.
            </li>
            <li>
              Supporters can pair value with a message, making each tip feel
              personal.
            </li>
          </ul>
          <Link
            to="/leaderboard"
            className="inline-flex text-sm font-black uppercase underline"
          >
            Explore the leaderboard
          </Link>
        </Card>

        <Card className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-xl font-black uppercase">Recent activity</h2>
            <Link
              to="/dashboard"
              className="text-sm font-black uppercase underline"
            >
              View dashboard
            </Link>
          </div>
          <RecentTips address={creator.owner} />
        </Card>
      </section>
    </PageContainer>
  );
};

export default TipPage;
