import React, { useEffect, useState, useCallback } from "react";
import { HeartHandshake, Repeat, Settings, Wallet } from "lucide-react";

import PageContainer from "@/components/layout/PageContainer";
import Breadcrumbs from "@/components/shared/Breadcrumbs";
import WalletConnect from "@/components/shared/WalletConnect";
import Button from "@/components/ui/Button";
import EmptyState from "@/components/ui/EmptyState";
import ErrorState from "@/components/shared/ErrorState";
import Input from "@/components/ui/Input";
import { useI18n } from "@/i18n";
import { useWallet } from "@/hooks/useWallet";
import { useContract } from "@/hooks/useContract";
import { useSubscriptionStore } from "@/store/subscriptionStore";
import { useToastStore } from "@/store/toastStore";
import { Subscription } from "@/types/contract";
import { categorizeError } from "@/helpers/error";
import ErrorSummary, { ErrorSummaryItem } from "@/components/shared/ErrorSummary";
import SubscriptionCard from "./SubscriptionCard";

const FREQUENCIES: { label: string; days: number }[] = [
  { label: "subs.weekly", days: 7 },
  { label: "subs.monthly", days: 30 },
];

const SubscribePage: React.FC = () => {
  const { t } = useI18n();
  const { connected, publicKey } = useWallet();
  const { getSubscriptions, createSubscription, getProfile, loading } =
    useContract();
  const {
    subscriptions,
    loading: storeLoading,
    error,
    setSubscriptions,
    setLoading,
    setError,
  } = useSubscriptionStore();
  const addToast = useToastStore((s) => s.addToast);

  // New subscription form state
  const [creatorAddress, setCreatorAddress] = useState("");
  const [amount, setAmount] = useState("");
  const [frequencyDays, setFrequencyDays] = useState(30);
  const [isCreating, setIsCreating] = useState(false);
  const [creatorName, setCreatorName] = useState("");

  // Field-level validation errors
  interface SubFormErrors {
    creatorAddress?: string;
    amount?: string;
  }
  const [formErrors, setFormErrors] = useState<SubFormErrors>({});
  const [subSummaryErrors, setSubSummaryErrors] = useState<ErrorSummaryItem[]>([]);

  const fetchSubscriptions = useCallback(async () => {
    if (!publicKey) return;
    setLoading(true);
    try {
      const subs = await getSubscriptions(publicKey);
      const active = (subs || []).filter((s: Subscription) => s.active);
      setSubscriptions(active);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("subs.lookupFailed"));
    } finally {
      setLoading(false);
    }
  }, [publicKey, getSubscriptions, setSubscriptions, setLoading, setError, t]);

  useEffect(() => {
    fetchSubscriptions();
  }, [fetchSubscriptions]);

  const handleLookupCreator = async () => {
    if (!creatorAddress) return;
    try {
      const profile = await getProfile(creatorAddress);
      setCreatorName(profile.displayName || `@${profile.username}`);
    } catch {
      setCreatorName("");
    }
  };

  const handleSubscribe = async () => {
    // Validate
    const errors: SubFormErrors = {};
    if (!creatorAddress.trim()) {
      errors.creatorAddress = "Enter the creator's Stellar wallet address.";
    } else if (!/^G[A-Z2-7]{55}$/.test(creatorAddress.trim().toUpperCase())) {
      errors.creatorAddress =
        "Enter a valid Stellar address starting with G (56 characters).";
    }
    const numericAmount = parseFloat(amount);
    if (!amount.trim()) {
      errors.amount = "Enter a tip amount in XLM.";
    } else if (isNaN(numericAmount) || numericAmount <= 0) {
      errors.amount = "Amount must be a number greater than 0.";
    } else if (numericAmount < 1) {
      errors.amount = "Minimum subscription amount is 1 XLM.";
    }

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      const summary: ErrorSummaryItem[] = [];
      if (errors.creatorAddress) {
        summary.push({ fieldId: "creator-address", label: "Creator address", message: errors.creatorAddress });
      }
      if (errors.amount) {
        summary.push({ fieldId: "sub-amount", label: "Amount", message: errors.amount });
      }
      setSubSummaryErrors(summary);
      // Focus first invalid field
      const firstId = summary[0]?.fieldId;
      if (firstId) document.getElementById(firstId)?.focus();
      return;
    }

    setFormErrors({});
    setSubSummaryErrors([]);
    setIsCreating(true);
    try {
      await createSubscription(creatorAddress, amount, frequencyDays);
      addToast({
        message: t("subs.createSuccess"),
        type: "success",
        duration: 3000,
      });
      setCreatorAddress("");
      setAmount("");
      setCreatorName("");
      await fetchSubscriptions();
    } catch (err) {
      addToast({
        message: err instanceof Error ? err.message : t("subs.createFailed"),
        type: "error",
      });
    } finally {
      setIsCreating(false);
    }
  };

  if (!connected) {
    return (
      <PageContainer maxWidth="lg" className="space-y-8 py-10">
        <Breadcrumbs
          items={[{ label: t("subs.home"), href: "/" }, { label: t("subs.title") }]}
        />
        <section className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.25em] text-gray-800 dark:text-gray-200">
              {t("subs.recurringSupport")}
            </p>
            <h1 className="mt-2 flex items-center gap-3 text-4xl font-black uppercase">
              <Repeat size={32} />
              {t("subs.title")}
            </h1>
          </div>
          <WalletConnect />
        </section>
        <EmptyState
          icon={<Wallet />}
          title={t("subs.connectTitle")}
          description={t("subs.connectDescription")}
        />
      </PageContainer>
    );
  }

  if (error && !storeLoading) {
    return (
      <PageContainer maxWidth="lg" className="py-20">
        <ErrorState
          errorData={categorizeError(error)}
          onRetry={fetchSubscriptions}
        />
      </PageContainer>
    );
  }

  return (
    <PageContainer maxWidth="lg" className="space-y-8 py-10">
      <Breadcrumbs
        items={[{ label: t("subs.home"), href: "/" }, { label: t("subs.title") }]}
      />
      <section
        aria-labelledby="subscriptions-heading"
        className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between"
      >
        <div>
          <p className="text-xs font-black uppercase tracking-[0.25em] text-gray-800 dark:text-gray-200">
            {t("subs.recurringSupport")}
          </p>
          <h1
            id="subscriptions-heading"
            className="mt-2 flex items-center gap-3 text-4xl font-black uppercase"
          >
            <Repeat size={32} />
            {t("subs.title")}
          </h1>
          <p className="mt-2 text-sm font-bold text-gray-600 dark:text-gray-300">
            {t("subs.description")}
          </p>
        </div>
      </section>

      {/* New Subscription Form */}
      <section
        aria-labelledby="new-sub-heading"
        className="border-3 border-black bg-white p-6 shadow-brutalist dark:border-white dark:bg-black"
      >
        <h2
          id="new-sub-heading"
          className="flex items-center gap-2 text-xl font-black uppercase"
        >
          <Settings size={20} />
          {t("subs.newHeading")}
        </h2>

        <p className="mt-4 text-sm text-gray-500">
          Changes to an active subscription take effect on its next billing date.
          Cancelling stops future tips; completed tips are not automatically refunded.
        </p>

        {/* Error summary — auto-focuses when validation errors are present */}
        <div className="mt-4">
          <ErrorSummary errors={subSummaryErrors} />
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1">
            <Input
              id="creator-address"
              label={t("subs.creator")}
              placeholder="GABCD...WXYZ"
              value={creatorAddress}
              onChange={(e) => {
                setCreatorAddress(e.target.value);
                setCreatorName("");
                if (formErrors.creatorAddress) {
                  setFormErrors((prev) => ({ ...prev, creatorAddress: undefined }));
                }
              }}
              onBlur={handleLookupCreator}
              error={formErrors.creatorAddress}
              aria-required="true"
              required
            />
            {creatorName && !formErrors.creatorAddress && (
              <p className="text-xs font-bold text-green-600">{creatorName}</p>
            )}
          </div>

          <div className="space-y-1">
            <Input
              id="sub-amount"
              label={`${t("subs.amount")} (XLM)`}
              type="number"
              min="1"
              step="0.1"
              placeholder="10"
              value={amount}
              onChange={(e) => {
                setAmount(e.target.value);
                if (formErrors.amount) {
                  setFormErrors((prev) => ({ ...prev, amount: undefined }));
                }
              }}
              error={formErrors.amount}
              aria-required="true"
              required
            />
          </div>

          <div className="space-y-1">
            <label
              htmlFor="sub-frequency"
              className="block text-sm font-bold uppercase tracking-wide mb-2"
            >
              {t("subs.frequency")}
            </label>
            <select
              id="sub-frequency"
              value={frequencyDays}
              onChange={(e) => setFrequencyDays(Number(e.target.value))}
              className="w-full border-2 border-black bg-white px-3 py-2 text-sm font-bold uppercase dark:border-white dark:bg-black"
            >
              {FREQUENCIES.map((f) => (
                <option key={f.days} value={f.days}>
                  {t(f.label)}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-end">
            <Button
              variant="primary"
              size="sm"
              icon={<HeartHandshake size={16} />}
              onClick={handleSubscribe}
              disabled={isCreating || loading}
            >
              {isCreating ? t("subs.subscribing") : t("subs.subscribe")}
            </Button>
          </div>
        </div>
      </section>

      {/* Active Subscriptions */}
      <section
        aria-labelledby="active-subs-heading"
        className="border-3 border-black bg-white p-6 shadow-brutalist dark:border-white dark:bg-black"
      >
        <h2
          id="active-subs-heading"
          className="flex items-center gap-2 text-xl font-black uppercase"
        >
          <Repeat size={20} />
          {t("subs.activeTitle")} ({subscriptions.length})
        </h2>

        {storeLoading ? (
          <div className="mt-4 space-y-3">
            {[1, 2].map((i) => (
              <div
                key={i}
                className="h-24 animate-pulse border-2 border-gray-200 bg-gray-100 dark:border-gray-800 dark:bg-gray-900"
              />
            ))}
          </div>
        ) : subscriptions.length === 0 ? (
          <div className="mt-4">
            <EmptyState
              icon={<HeartHandshake size={32} />}
              title={t("subs.noSubs")}
              description={t("subs.noSubsHint")}
            />
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            {subscriptions.map((sub) => (
              <SubscriptionCard
                key={sub.creator}
                subscription={sub}
                creatorName={
                  sub.creator === creatorAddress && creatorName
                    ? creatorName
                    : undefined
                }
              />
            ))}
          </div>
        )}
      </section>
    </PageContainer>
  );
};

export default SubscribePage;
