import React, { useState, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import Input from "@/components/ui/Input";
import Textarea from "@/components/ui/Textarea";
import Button from "@/components/ui/Button";
import TransactionStatus from "@/components/shared/TransactionStatus";
import DraftRestoreBanner from "@/components/shared/DraftRestoreBanner";
import TransactionRestoredNotice from "@/components/shared/TransactionRestoredNotice";
import ErrorSummary from "@/components/shared/ErrorSummary";
import { MAX_BIO_LENGTH, validateBio, validateXHandle } from "@/helpers/validation";
import { useContract, useUsernameCheck, useTransactionGuard } from "@/hooks";
import { useToastStore } from "@/store/toastStore";
import { ProfileFormData } from "@/types/profile";
import { categorizeError, ERRORS } from "@/helpers/error";
import { useFormAutosave } from "@/hooks/useFormAutosave";
import { useOnboardingProgress } from "@/hooks/useOnboardingProgress";
import { useWallet } from "@/hooks/useWallet";
import { analytics } from "@/services/analytics";
import {
  validateRegistrationForm,
  buildErrorSummary,
  type FormErrors,
} from "./registerFormValidation";
import { WalletRecoveryBanner } from "./WalletRecoveryBanner";
import { UsernameField } from "./UsernameField";

type TxStatus =
  | "idle"
  | "signing"
  | "submitting"
  | "confirming"
  | "success"
  | "error";

interface RegisterFormProps {
  initialImageUrl?: string;
}

const RegisterForm: React.FC<RegisterFormProps> = ({ initialImageUrl }) => {
  const [form, setForm] = useState<ProfileFormData>({
    username: "",
    displayName: "",
    bio: "",
    imageUrl: initialImageUrl ?? "",
    xHandle: "",
  });
  const [errors, setErrors] = useState<FormErrors>({});
  const [txStatus, setTxStatus] = useState<TxStatus>("idle");
  const [txHash, setTxHash] = useState<string | undefined>(undefined);
  const [txError, setTxError] = useState<string | undefined>(undefined);
  const [walletPrompt, setWalletPrompt] = useState(false);
  // Error summary items — populated on submit failure, cleared on success.
  const [errorSummaryItems, setErrorSummaryItems] = useState<ErrorSummaryItem[]>([]);
  const formRef = useRef<HTMLFormElement>(null);

  const { registerProfile } = useContract();
  const { addToast } = useToastStore();
  const navigate = useNavigate();
  const { connected, connect, connecting, walletError } = useWallet();

  // Funnel instrumentation + resumable progress (#1345).
  const { currentStep, resumed, trackStep } = useOnboardingProgress();

  // Track step entries and surface a resume notice for interrupted registrations.
  React.useEffect(() => {
    if (currentStep === "landing" || currentStep === "register") {
      trackStep("register");
    }
    // Only on mount / step change into the register step.
  }, [currentStep, trackStep]);

  const walletConnectedRef = React.useRef(false);
  React.useEffect(() => {
    if (connected && !walletConnectedRef.current) {
      walletConnectedRef.current = true;
      trackStep("wallet");
    }
  }, [connected, trackStep]);

  // Transaction guard to prevent duplicate submissions
  const {
    isPending: isTransactionPending,
    startTransaction,
    restored: txRestored,
    reset: resetTransactionGuard,
  } = useTransactionGuard();

  // Username availability check
  const {
    available,
    checking,
    error: availabilityError,
  } = useUsernameCheck(form.username);

  const {
    hasDraft,
    draftSavedAt,
    restoreDraft,
    discardDraft: discardRegisterDraft,
    clearSaved: clearRegisterDraft,
  } = useFormAutosave({
    storageKey: "tipz_register_form",
    data: {
      username: form.username,
      displayName: form.displayName,
      xHandle: form.xHandle,
    },
    onRestore: (saved) => {
      setForm((prev) => ({
        ...prev,
        username:
          typeof saved.username === "string" ? saved.username : prev.username,
        displayName:
          typeof saved.displayName === "string"
            ? saved.displayName
            : prev.displayName,
        xHandle:
          typeof saved.xHandle === "string" ? saved.xHandle : prev.xHandle,
      }));
    },
  });

  React.useEffect(() => {
    if (txStatus === "success") {
      clearRegisterDraft();
    }
  }, [txStatus, clearRegisterDraft]);

  const handleChange =
    (field: keyof ProfileFormData) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      const value = e.target.value;
      setForm((prev) => ({ ...prev, [field]: value }));

      if (field === "bio") {
        const result = validateBio(value);
        setErrors((prev) => ({
          ...prev,
          bio: result.valid ? undefined : result.error,
        }));
        return;
      }

      if ((errors as Record<string, string | undefined>)[field]) {
        setErrors((prev) => ({ ...prev, [field]: undefined }));
      }
    };

  const handleBlur = (field: keyof ProfileFormData) => () => {
    if (field === "username") {
      // Per-step funnel: a valid username is the first drop-off checkpoint (#1345).
      const result = validateUsername(form.username);
      if (result.valid) trackStep("username");
    }

    if (field === "xHandle" && form.xHandle.trim()) {
      const result = validateXHandle(form.xHandle);
      setErrors((prev) => ({
        ...prev,
        xHandle: result.valid ? undefined : result.error,
      }));
    }

    if (field === "bio") {
      const result = validateBio(form.bio);
      setErrors((prev) => ({
        ...prev,
        bio: result.valid ? undefined : result.error,
      }));
    }
  };

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();

      // Guard against submission during pending transaction
      if (isTransactionPending) {
        return;
      }

      const trimmedForm: ProfileFormData = {
        ...form,
        username: form.username.trim(),
        displayName: form.displayName.trim(),
        bio: form.bio.trim(),
        imageUrl: form.imageUrl.trim(),
        xHandle: form.xHandle.trim(),
      };

      const validationErrors = validateRegistrationForm(trimmedForm, available, checking);
      if (Object.keys(validationErrors).length > 0) {
        analytics.trackEvent("onboarding_step_failed", {
          step: "register",
          failed_fields: Object.keys(validationErrors).join(","),
        });
        setErrors(validationErrors);

        const summary = buildErrorSummary(validationErrors);
        setErrorSummaryItems(summary);

        // Focus the first invalid field so keyboard/AT users land on the problem.
        const firstFieldId = summary[0]?.fieldId;
        if (firstFieldId) {
          const el = document.getElementById(firstFieldId);
          el?.focus();
        }
        return;
      }
      // Clear any previous summary when the form validates cleanly.
      setErrorSummaryItems([]);

      // Registration needs a wallet to sign the profile transaction (#1345).
      if (!connected) {
        analytics.trackEvent("onboarding_wallet_required", { step: "register" });
        setWalletPrompt(true);
        return;
      }

      await startTransaction(async () => {
        try {
          setTxStatus("signing");
          setTxError(undefined);
          setTxHash(undefined);

          const formData: ProfileFormData = {
            ...trimmedForm,
            username: trimmedForm.username.toLowerCase(),
          };

          setTxStatus("submitting");
          const hash = await registerProfile(formData);

          setTxStatus("confirming");
          setTxHash(hash);

          setTxStatus("success");
          analytics.trackEvent("profile_registered");
          trackStep("complete");
          addToast({
            message: "Profile registered successfully!",
            type: "success",
            duration: 5000,
          });

          setTimeout(() => navigate("/profile"), 1500);
        } catch (err) {
          const { category } = categorizeError(err);
          setTxStatus("error");
          setTxError(category === "network" ? ERRORS.NETWORK : ERRORS.CONTRACT);
          analytics.trackEvent("onboarding_registration_failed", {
            step: "wallet",
            error_category: category,
          });
          throw err; // Re-throw to let transaction guard handle it
        }
      });
    },
    [
      form,
      available,
      checking,
      isTransactionPending,
      startTransaction,
      registerProfile,
      addToast,
      navigate,
    ],
  );

  const isSubmitting =
    ["signing", "submitting", "confirming"].includes(txStatus) ||
    isTransactionPending;

  return (
    <form
      ref={formRef}
      onSubmit={handleSubmit}
      noValidate
      className="space-y-6 max-w-lg mx-auto"
    >
      <TransactionRestoredNotice
        restored={txRestored}
        onDismiss={resetTransactionGuard}
      />
      {hasDraft && (
        <DraftRestoreBanner
          savedAt={draftSavedAt}
          onRestore={restoreDraft}
          onDiscard={discardRegisterDraft}
        />
      )}

      {/* Error summary — rendered above all fields; auto-focuses on mount */}
      <ErrorSummary errors={errorSummaryItems} />

      {resumed && (
        <p
          className="text-sm text-gray-800 dark:text-gray-200"
          data-testid="onboarding-resume-notice"
        >
          Welcome back — we saved your progress, so you can pick up where you
          left off.
        </p>
      )}

      {/* Wallet-connection recovery: registration cannot be signed without one (#1345) */}
      {(walletPrompt || (!connected && walletError)) && (
        <WalletRecoveryBanner
          walletError={walletError}
          connecting={connecting}
          onConnect={connect}
        />
      )}

      {/* Username */}
      <UsernameField
        value={form.username}
        error={errors.username}
        disabled={isSubmitting}
        checking={checking}
        available={available}
        availabilityError={availabilityError}
        onChange={handleChange("username")}
        onBlur={handleBlur("username")}
        onSelectSuggestion={(s) => setForm((prev) => ({ ...prev, username: s }))}
      />

      {/* Display Name */}
      <Input
        label="Display Name"
        placeholder="Your Name"
        value={form.displayName}
        onChange={handleChange("displayName")}
        onBlur={() => {
          handleBlur("displayName")();
          if (form.displayName.trim()) trackStep("profile_details");
        }}
        error={errors.displayName}
        disabled={isSubmitting}
        maxLength={64}
        required
      />

      {/* Bio */}
      <Textarea
        label="Bio"
        placeholder="Tell supporters about yourself…"
        value={form.bio}
        onChange={handleChange("bio")}
        onBlur={handleBlur("bio")}
        error={errors.bio}
        disabled={isSubmitting}
        maxLength={MAX_BIO_LENGTH}
        warnAt={240}
        rows={4}
      />

      {/* X Handle */}
      <Input
        label="X (Twitter) Handle (optional)"
        placeholder="@yourhandle"
        value={form.xHandle}
        onChange={handleChange("xHandle")}
        onBlur={handleBlur("xHandle")}
        error={errors.xHandle}
        helperText="Must start with @ and use 4-15 letters, numbers, or underscores."
        disabled={isSubmitting}
      />

      {/* Image URL */}
      <Input
        label="Profile Image URL (optional)"
        placeholder="https://example.com/avatar.png"
        type="url"
        value={form.imageUrl}
        onChange={handleChange("imageUrl")}
        error={errors.imageUrl}
        disabled={isSubmitting}
      />

      {/* Transaction status */}
      {txStatus !== "idle" && (
        <TransactionStatus
          status={txStatus}
          txHash={txHash}
          errorMessage={txError}
          onRetry={() => setTxStatus("idle")}
        />
      )}

      <Button
        type="submit"
        variant="primary"
        size="lg"
        disabled={
          isSubmitting ||
          txStatus === "success" ||
          checking ||
          available === false
        }
        className="w-full"
      >
        {isSubmitting ? "Registering…" : "Register Profile"}
      </Button>
    </form>
  );
};

export default RegisterForm;
