import React, { useState, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import Input from "@/components/ui/Input";
import Textarea from "@/components/ui/Textarea";
import Button from "@/components/ui/Button";
import TransactionStatus from "@/components/shared/TransactionStatus";
import DraftRestoreBanner from "@/components/shared/DraftRestoreBanner";
import TransactionRestoredNotice from "@/components/shared/TransactionRestoredNotice";
import ErrorSummary, { ErrorSummaryItem } from "@/components/shared/ErrorSummary";
import {
  MAX_BIO_LENGTH,
  validateBio,
  validateDisplayName,
  validateUsername,
  validateXHandle,
} from "@/helpers/validation";
import { useContract, useUsernameCheck, useTransactionGuard } from "@/hooks";
import { useToastStore } from "@/store/toastStore";
import { ProfileFormData } from "@/types/profile";
import { categorizeError, ERRORS } from "@/helpers/error";
import { useFormAutosave } from "@/hooks/useFormAutosave";
import { useOnboardingProgress } from "@/hooks/useOnboardingProgress";
import { useWallet } from "@/hooks/useWallet";
import { analytics } from "@/services/analytics";

type TxStatus =
  | "idle"
  | "signing"
  | "submitting"
  | "confirming"
  | "success"
  | "error";

interface FormErrors {
  username?: string;
  displayName?: string;
  bio?: string;
  imageUrl?: string;
  xHandle?: string;
}

function validate(
  data: ProfileFormData,
  available: boolean | null,
  checking: boolean,
): FormErrors {
  const errors: FormErrors = {};

  const usernameValidation = validateUsername(data.username);
  if (!usernameValidation.valid) {
    errors.username = usernameValidation.error;
  } else if (!checking && available === false) {
    errors.username = "Username is already taken";
  } else if (checking) {
    errors.username = "Please wait for username availability check";
  }

  const displayNameValidation = validateDisplayName(data.displayName);
  if (!displayNameValidation.valid) {
    errors.displayName = displayNameValidation.error;
  }

  const bioValidation = validateBio(data.bio);
  if (!bioValidation.valid) {
    errors.bio = bioValidation.error;
  }

  if (data.xHandle.trim()) {
    const xHandleValidation = validateXHandle(data.xHandle);
    if (!xHandleValidation.valid) {
      errors.xHandle = xHandleValidation.error;
    }
  }

  return errors;
}

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

      const validationErrors = validate(trimmedForm, available, checking);
      if (Object.keys(validationErrors).length > 0) {
        analytics.trackEvent("onboarding_step_failed", {
          step: "register",
          failed_fields: Object.keys(validationErrors).join(","),
        });
        setErrors(validationErrors);

        // Build the ordered error summary (field order matches DOM order).
        const fieldOrder: Array<{ key: keyof FormErrors; label: string; fieldId: string }> = [
          { key: "username",    label: "Username",     fieldId: "username" },
          { key: "displayName", label: "Display Name", fieldId: "display-name" },
          { key: "bio",         label: "Bio",          fieldId: "bio" },
          { key: "xHandle",     label: "X Handle",     fieldId: "x-(twitter)-handle-(optional)" },
          { key: "imageUrl",    label: "Profile Image URL", fieldId: "profile-image-url-(optional)" },
        ];
        const summary: ErrorSummaryItem[] = fieldOrder
          .filter(({ key }) => validationErrors[key])
          .map(({ key, label, fieldId }) => ({
            fieldId,
            label,
            message: validationErrors[key]!,
          }));
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
        <div
          role="alert"
          data-testid="wallet-recovery"
          className="rounded-md border-2 border-amber-500 bg-amber-50 p-4"
        >
          <p className="text-sm font-bold text-gray-900">
            Your profile is ready, but a wallet is needed to finish registering.
          </p>
          <p className="mt-1 text-sm text-gray-800">
            {walletError
              ? `We couldn't reach your wallet: ${walletError}.`
              : "Registration is confirmed on the Stellar network, so a connected wallet has to approve the transaction."}{" "}
            Your details are saved — reconnect the same wallet and press
            Register again, and nothing has to be retyped.
          </p>
          <Button
            type="button"
            variant="primary"
            size="md"
            className="mt-3 w-full sm:w-auto"
            disabled={connecting}
            onClick={() => {
              analytics.trackEvent("onboarding_wallet_reconnect_attempted", {
                step: "wallet",
              });
              void connect().catch(() => {
                analytics.trackEvent("onboarding_wallet_reconnect_failed", {
                  step: "wallet",
                });
              });
            }}
          >
            {connecting ? "Reconnecting…" : "Reconnect wallet"}
          </Button>
        </div>
      )}

      {/* Username */}
      <div>
        <div className="relative">
          <Input
            label="Username"
            placeholder="your_handle"
            value={form.username}
            onChange={handleChange("username")}
            error={errors.username}
            disabled={isSubmitting}
            maxLength={32}
            required
          />
          {/* Availability indicator */}
          {form.username && !errors.username && (
            <div className="absolute right-3 top-9 flex items-center">
              {checking && (
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-gray-300 border-t-blue-600"></div>
              )}
              {!checking && available === true && (
                <div
                  className="text-green-500"
                  data-testid="username-available"
                >
                  <svg
                    className="w-5 h-5"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                      clipRule="evenodd"
                    />
                  </svg>
                </div>
              )}
              {!checking && available === false && (
                <div className="text-red-500" data-testid="username-taken">
                  <svg
                    className="w-5 h-5"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                      clipRule="evenodd"
                    />
                  </svg>
                </div>
              )}
            </div>
          )}
        </div>
        <p className="mt-1 text-xs text-gray-800 dark:text-gray-200">
          Your profile will be at{" "}
          {import.meta.env.VITE_APP_URL || window.location.origin}/@
          {form.username || "username"}
        </p>
        {/* Availability status */}
        {form.username && !errors.username && (
          <div className="mt-1">
            {checking && (
              <p className="text-xs text-gray-800 dark:text-gray-200">
                Checking availability...
              </p>
            )}
            {!checking && available === true && (
              <p className="text-xs text-green-600">Username is available!</p>
            )}
            {!checking && available === false && (
              <p className="text-xs text-red-600">
                Username is taken. Try:{" "}
                {[
                  `${form.username}1`,
                  `${form.username}_`,
                  `${form.username}x`,
                ].map((s, i) => (
                  <button
                    key={i}
                    type="button"
                    className="underline ml-1"
                    onClick={() =>
                      setForm((prev: typeof form) => ({ ...prev, username: s }))
                    }
                  >
                    {s}
                  </button>
                ))}
              </p>
            )}
            {availabilityError && (
              <p className="text-xs text-yellow-600">{availabilityError}</p>
            )}
          </div>
        )}
      </div>

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
