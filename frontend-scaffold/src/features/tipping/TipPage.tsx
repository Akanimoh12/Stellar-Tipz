import React, { useState, useEffect, useCallback } from "react";
import {
  ArrowRight,
  HeartHandshake,
  MessageSquare,
  Wallet,
} from "lucide-react";
import { Link, useParams } from "react-router-dom";

import PageContainer from "../../components/layout/PageContainer";
import AmountDisplay from "../../components/shared/AmountDisplay";
import CreditBadge from "../../components/shared/CreditBadge";
import TransactionStatus from "../../components/shared/TransactionStatus";
import Avatar from "../../components/ui/Avatar";
import Button from "../../components/ui/Button";
import Card from "../../components/ui/Card";
import Textarea from "../../components/ui/Textarea";
import { useWallet, useContract, useTransactionGuard } from "../../hooks";
import ErrorState from "../../components/shared/ErrorState";
import { categorizeError, ERRORS } from "@/helpers/error";
import { MAX_MESSAGE_LENGTH } from "@/helpers/validation";
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
import { useNavigate } from "react-router-dom";

const TipPage: React.FC = () => {
  const { username } = useParams<{ username: string }>();
  const navigate = useNavigate();
  const { connected, connect, publicKey } = useWallet();
  const [amount, setAmount] = useState("5");
  const [message, setMessage] = useState("");
  const [isAnonymous, setIsAnonymous] = useState(false);
  const { getProfileByUsername } = useContract();
  const [loading, setLoading] = useState(true);
  const [creator, setCreator] = useState<Profile | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const isSelfTipping = connected && creator && publicKey === creator.owner;

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
    reset,
    error: flowError,
    txHash,
  } = useTipFlow(creator?.owner || "");
  const flowErrorCategory = flowError ? categorizeError(flowError).category : null;

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    // Guard against submission during pending transaction
    if (isTransactionPending || step === "signing" || step === "submitting") {
      return;
    }
    goToConfirm(amount, message, isAnonymous);
  };
  
  // Wrapped confirm handler with transaction guard
  const handleConfirmAndSign = useCallback(async () => {
    await startTransaction(async () => {
      await confirmAndSign();
    });
  }, [confirmAndSign, startTransaction]);

  useEffect(() => {
    if (step === "success" && txHash && creator) {
      navigate("/receipt", { 
        state: { 
          tipData: { 
            amount, 
            message, 
            txHash, 
            recipient: creator 
          } 
        } 
      });
    }
  }, [step, txHash, creator, amount, message, navigate]);

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
          onRetry={fetchCreator}
        />
      </PageContainer>
    );
  }

  return (
    <PageContainer maxWidth="xl" className="space-y-8 py-10">
      <section className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
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
                <p className="text-xs font-black uppercase tracking-[0.25em] text-gray-500">
                  Tip creator
                </p>
                <h1 className="text-3xl font-black uppercase">
                  {creator.displayName}
                </h1>
                <p className="text-sm font-bold text-gray-600">
                  @{creator.username}
                </p>
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
            <p className="text-xs font-black uppercase tracking-[0.25em] text-gray-500">
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
                  ? flowErrorCategory === "network"
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
              <TipAmountInput amount={amount} onChange={setAmount} />

              <Textarea
                label="Message"
                placeholder="Say why you are supporting this creator."
                maxLength={MAX_MESSAGE_LENGTH}
                warnAt={250}
                dangerAt={270}
                value={message}
                onChange={(event) => setMessage(event.target.value)}
              />

              <label className="flex items-center gap-3 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={isAnonymous}
                  onChange={(e) => setIsAnonymous(e.target.checked)}
                  className="w-5 h-5 border-2 border-black rounded-none appearance-none checked:bg-black relative after:content-['✓'] after:hidden checked:after:block after:text-white after:absolute after:inset-0 after:flex after:items-center after:justify-center font-bold"
                />
                <span className="text-sm font-bold group-hover:underline">Send tip anonymously</span>
              </label>

              <div className="flex flex-col gap-3 sm:flex-row">
                {isSelfTipping ? (
                  <>
                    <Button
                      type="button"
                      disabled
                      className="sm:flex-1"
                    >
                      Can't tip yourself
                    </Button>
                    <p className="text-sm font-medium text-gray-600">
                      You cannot send a tip to your own profile.
                    </p>
                  </>
                ) : connected ? (
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

                {!isSelfTipping && (
                  <Button type="button" variant="outline" onClick={reset}>
                    Clear
                  </Button>
                )}
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
            isAnonymous={isAnonymous}
            submitting={step === "signing" || step === "submitting" || isTransactionPending}
          />

          {step === "signing" || step === "submitting" ? (
            <TransactionStatus
              status={step === "signing" ? "signing" : "submitting"}
              txHash={txHash ?? undefined}
              errorMessage={
                flowError
                  ? flowErrorCategory === "network"
                    ? ERRORS.NETWORK
                    : ERRORS.CONTRACT
                  : undefined
              }
            />
          ) : null}
        </Card>
      </section>

      <section className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
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
