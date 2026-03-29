import React, { useState, useEffect, useCallback } from "react";
import { ArrowRight, HeartHandshake, MessageSquare, Wallet } from "lucide-react";
import { Link, useParams } from "react-router-dom";

import PageContainer from "../../components/layout/PageContainer";
import AmountDisplay from "../../components/shared/AmountDisplay";
import CreditBadge from "../../components/shared/CreditBadge";
import TransactionStatus from "../../components/shared/TransactionStatus";
import Avatar from "../../components/ui/Avatar";
import Button from "../../components/ui/Button";
import Card from "../../components/ui/Card";
import Textarea from "../../components/ui/Textarea";
import { useWallet, useContract } from "../../hooks";
import ErrorState from "../../components/shared/ErrorState";
import { categorizeError, ERRORS } from "@/helpers/error";
import { Profile } from "@/types/contract";
import TipPageSkeleton from "./TipPageSkeleton";
import TipAmountInput from "./TipAmountInput";
import TipResult from "./TipResult";
import RecentTips from "./RecentTips";
import TipConfirm from "./TipConfirm";
import { useTipFlow } from "./useTipFlow";
import { usePageTitle } from "@/hooks/usePageTitle";

const TipPage: React.FC = () => {
  const { username } = useParams<{ username: string }>();
  const { connected, connect } = useWallet();
  const [amount, setAmount] = useState("5");
  const [message, setMessage] = useState("");
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
      console.error('Failed to fetch creator:', err);
      setFetchError(String(err));
    } finally {
      setLoading(false);
    }
  }, [username, getProfileByUsername]);

  useEffect(() => {
    fetchCreator();
  }, [fetchCreator]);

  usePageTitle(loading ? "Loading..." : creator ? `Tip @${creator.username}` : "Creator Not Found");

  const { step, goToConfirm, confirmAndSign, reset, error: flowError, txHash } = useTipFlow(creator?.owner || "");

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    goToConfirm(amount, message);
  };

  if (loading) {
    return <TipPageSkeleton />;
  }

  if (fetchError || !creator) {
    return (
      <PageContainer maxWidth="xl" className="py-20">
        <ErrorState 
          category={categorizeError(fetchError || 'Not Found')} 
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
                <h1 className="text-3xl font-black uppercase">{creator.displayName}</h1>
                <p className="text-sm font-bold text-gray-600">@{creator.username}</p>
              </div>
            </div>

            <CreditBadge score={creator.creditScore} />
          </div>

          <p className="max-w-2xl text-base leading-7 text-gray-700">{creator.bio}</p>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="border-2 border-black bg-yellow-100 p-4">
              <p className="text-xs font-black uppercase tracking-[0.2em] text-gray-600">
                Lifetime tips
              </p>
              <AmountDisplay amount={creator.totalTipsReceived} className="mt-2 block text-xl" />
            </div>
            <div className="border-2 border-black bg-white p-4">
              <p className="text-xs font-black uppercase tracking-[0.2em] text-gray-600">
                Supporters
              </p>
              <p className="mt-2 text-2xl font-black">{creator.totalTipsCount}</p>
            </div>
            <div className="border-2 border-black bg-white p-4">
              <p className="text-xs font-black uppercase tracking-[0.2em] text-gray-600">
                X followers
              </p>
              <p className="mt-2 text-2xl font-black">{creator.xFollowers.toLocaleString()}</p>
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

          {!connected && (
            <div className="border-2 border-black bg-orange-100 p-4 text-sm font-bold">
              Connect a wallet before signing the transaction.
            </div>
          )}

          {step === "success" || step === "error" ? (
            <TipResult
              status={step === "success" ? "success" : "error"}
              txHash={txHash ?? undefined}
              amount={amount}
              creator={creator}
              errorMessage={flowError ? (categorizeError(flowError) === 'network' ? ERRORS.NETWORK : ERRORS.CONTRACT) : undefined}
              onPrimaryAction={reset}
            />
          ) : (
            <form className="space-y-4" onSubmit={handleSubmit}>
              <TipAmountInput amount={amount} onChange={setAmount} balance={creator.balance} />

              <Textarea
                label="Message"
                placeholder="Say why you are supporting this creator."
                maxLength={160}
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

          <TipConfirm
            isOpen={step === "confirm"}
            onClose={reset}
            onConfirm={() => void confirmAndSign()}
            creator={creator}
            amount={amount}
            message={message}
            submitting={step === "signing" || step === "submitting"}
          />

          {step === "signing" || step === "submitting" ? (
            <TransactionStatus
              status={step === "signing" ? "signing" : "submitting"}
              txHash={txHash ?? undefined}
              errorMessage={flowError ? (categorizeError(flowError) === 'network' ? ERRORS.NETWORK : ERRORS.CONTRACT) : undefined}
            />
          ) : null}
        </Card>
      </section>

      <section className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <Card className="space-y-4">
          <div className="flex items-center gap-3">
            <MessageSquare size={18} />
            <h2 className="text-xl font-black uppercase">Why supporters tip here</h2>
          </div>
          <ul className="space-y-3 text-sm font-medium leading-6 text-gray-700">
            <li>Tips settle quickly on Stellar and creators keep the majority of every payment.</li>
            <li>Every profile has a visible reputation signal through the on-chain credit score.</li>
            <li>Supporters can pair value with a message, making each tip feel personal.</li>
          </ul>
          <Link to="/leaderboard" className="inline-flex text-sm font-black uppercase underline">
            Explore the leaderboard
          </Link>
        </Card>

        <Card className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-xl font-black uppercase">Recent activity</h2>
            <Link to="/dashboard" className="text-sm font-black uppercase underline">
              View dashboard
            </Link>
          </div>
          <RecentTips />
        </Card>
      </section>
    </PageContainer>
  );
};

export default TipPage;
