import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, Lock, Eye } from "lucide-react";

import Input from "@/components/ui/Input";
import OptimizedImage from "@/components/ui/optimizedImage";
import Textarea from "@/components/ui/Textarea";
import Button from "@/components/ui/Button";
import TransactionStatus from "@/components/shared/TransactionStatus";
import ImageCropper from "@/components/shared/ImageCropper";
import DraftRestoreBanner from "@/components/shared/DraftRestoreBanner";
import type { ErrorSummaryItem } from "@/components/shared/ErrorSummary";
import { useToastStore } from "@/store/toastStore";
import { useProfileStore } from "@/store/profileStore";
import { useProfileUpdate } from "@/hooks/useProfileUpdate";
import type { Profile } from "@/types/contract";
import type { ProfileFormData } from "@/types/profile";
import ProfilePreview from "./ProfilePreview";
import { THEME_COLORS } from "./profileThemes";
import { renderMarkdown } from "@/helpers/markdown";
import { useFormAutosave } from "@/hooks/useFormAutosave";
import { useLiveRegion } from "@/lib/liveRegion";
import {
  MAX_BIO_LENGTH,
  validateBio,
  validateDisplayName,
  validateXHandle,
} from "@/helpers/validation";

type TxStatus =
  | "idle"
  | "signing"
  | "submitting"
  | "confirming"
  | "success"
  | "error";

interface FormErrors {
  displayName?: string;
  bio?: string;
  imageUrl?: string;
  xHandle?: string;
  githubHandle?: string;
  websiteUrl?: string;
  bannerUrl?: string;
}

const MAX_BANNER_BYTES = 5 * 1024 * 1024; // 5 MB

function validate(data: ProfileFormData): FormErrors {
  const errors: FormErrors = {};

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

  if (data.imageUrl && !isValidUrl(data.imageUrl)) {
    errors.imageUrl = "Please enter a valid URL.";
  }

  if (data.websiteUrl && !isValidUrl(data.websiteUrl)) {
    errors.websiteUrl = "Please enter a valid URL (include https://).";
  }

  return errors;
}

function isValidUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

// ── Conflict dialog ───────────────────────────────────────────────────────────

interface ConflictDialogProps {
  conflictProfile: Profile;
  onAcceptServer: () => void;
  onRetryOwn: () => void;
}

const ConflictDialog: React.FC<ConflictDialogProps> = ({
  conflictProfile,
  onAcceptServer,
  onRetryOwn,
}) => (
  <div
    role="dialog"
    aria-modal="true"
    aria-labelledby="conflict-dialog-title"
    aria-describedby="conflict-dialog-desc"
    className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
  >
    <div className="bg-white border-4 border-black shadow-[8px_8px_0_black] max-w-md w-full p-6 space-y-4">
      <div className="flex items-center gap-2">
        <AlertTriangle size={20} className="text-yellow-600 shrink-0" />
        <h2 id="conflict-dialog-title" className="text-lg font-black uppercase">
          Profile updated elsewhere
        </h2>
      </div>
      <p id="conflict-dialog-desc" className="text-sm leading-relaxed">
        Another device saved a newer version of your profile while this update
        was in progress.
      </p>
      <div className="text-sm border-2 border-black p-3 bg-gray-50 space-y-1">
        <p className="font-bold uppercase text-xs tracking-wide mb-1">
          Server version
        </p>
        <p>
          <span className="font-semibold">Name:</span>{" "}
          {conflictProfile.displayName}
        </p>
        <p>
          <span className="font-semibold">Bio:</span>{" "}
          {conflictProfile.bio || <em className="text-gray-400">empty</em>}
        </p>
      </div>
      <p className="text-xs text-gray-600">
        Your edits are preserved — you can retry after reviewing the server
        version.
      </p>
      <div className="flex gap-3 pt-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="flex-1"
          onClick={onAcceptServer}
        >
          Use server version
        </Button>
        <Button
          type="button"
          variant="primary"
          size="sm"
          className="flex-1"
          onClick={onRetryOwn}
        >
          Keep my edits
        </Button>
      </div>
    </div>
  </div>
);

// ── Pending banner ─────────────────────────────────────────────────────────────

const PendingBanner: React.FC<{ status: "pending" | "confirming" }> = ({
  status,
}) => (
  <div
    role="status"
    aria-live="polite"
    data-testid="optimistic-pending-banner"
    className="flex items-center gap-3 border-2 border-black bg-yellow-50 px-4 py-3 text-sm font-bold"
  >
    <span
      className="inline-block h-3 w-3 rounded-full bg-yellow-500 animate-pulse shrink-0"
      aria-hidden="true"
    />
    {status === "pending"
      ? "Applying changes…"
      : "Waiting for on-chain confirmation…"}
  </div>
);

// ── Main component ─────────────────────────────────────────────────────────────

interface EditProfileFormProps {
  profile: Profile;
  onDirtyChange?: (dirty: boolean) => void;
}

const EditProfileForm: React.FC<EditProfileFormProps> = ({
  profile,
  onDirtyChange,
}) => {
  const {
    updateStatus,
    savedEdits,
    updateError,
    conflictProfile,
    clearSavedEdits,
  } = useProfileStore();

  const { submitUpdate, resetError, resolveConflict } = useProfileUpdate();

  const [form, setForm] = useState<ProfileFormData>(() => ({
    // If we have savedEdits from a previous failed attempt, restore them.
    username: profile.username,
    displayName: savedEdits?.displayName ?? profile.displayName,
    bio: savedEdits?.bio ?? profile.bio,
    imageUrl: savedEdits?.imageUrl ?? profile.imageUrl,
    xHandle: savedEdits?.xHandle ?? profile.xHandle,
    bannerUrl: savedEdits?.bannerUrl ?? "",
    themeKey: savedEdits?.themeKey ?? "default",
    githubHandle: savedEdits?.githubHandle ?? "",
    websiteUrl: savedEdits?.websiteUrl ?? "",
  }));

  const [errors, setErrors] = useState<FormErrors>({});
  const [txStatus, setTxStatus] = useState<TxStatus>("idle");
  const [txHash, setTxHash] = useState<string | undefined>(undefined);
  const [showBioPreview, setShowBioPreview] = useState(false);
  const [showProfilePreview, setShowProfilePreview] = useState(false);
  // Error summary — populated on submit failure, cleared on success.
  const [errorSummaryItems, setErrorSummaryItems] = useState<ErrorSummaryItem[]>([]);

  const { addToast } = useToastStore();
  const navigate = useNavigate();

  // ── Draft autosave ────────────────────────────────────────────────────────

  const {
    hasDraft,
    draftSavedAt,
    restoreDraft,
    discardDraft: discardEditDraft,
    clearSaved: clearEditDraft,
  } = useFormAutosave({
    storageKey: "tipz_edit_profile_form",
    data: {
      displayName: form.displayName,
      bio: form.bio,
      xHandle: form.xHandle,
      githubHandle: form.githubHandle ?? "",
      websiteUrl: form.websiteUrl ?? "",
      themeKey: form.themeKey ?? "default",
    },
    excludeFields: ["imageUrl", "bannerUrl"],
    onRestore: (saved) => {
      setForm((prev) => ({
        ...prev,
        displayName:
          typeof saved.displayName === "string"
            ? saved.displayName
            : prev.displayName,
        bio: typeof saved.bio === "string" ? saved.bio : prev.bio,
        xHandle:
          typeof saved.xHandle === "string" ? saved.xHandle : prev.xHandle,
        githubHandle:
          typeof saved.githubHandle === "string"
            ? saved.githubHandle
            : prev.githubHandle,
        websiteUrl:
          typeof saved.websiteUrl === "string"
            ? saved.websiteUrl
            : prev.websiteUrl,
        themeKey:
          typeof saved.themeKey === "string" ? saved.themeKey : prev.themeKey,
      }));
    },
  });

  const { announce } = useLiveRegion();

  useEffect(() => {
    if (hasDraft) {
      announce("Restored saved form draft");
    }
  }, [hasDraft, announce]);

  useEffect(() => {
    const isDirty =
      form.displayName !== profile.displayName ||
      form.bio !== profile.bio ||
      form.imageUrl !== profile.imageUrl ||
      form.xHandle !== profile.xHandle ||
      !!form.bannerUrl ||
      form.themeKey !== "default" ||
      !!form.githubHandle ||
      !!form.websiteUrl;
    onDirtyChange?.(isDirty);
  }, [form, profile, onDirtyChange]);

  // ── When savedEdits arrive after a rollback, restore them into the form ───

  useEffect(() => {
    if (updateStatus === "error" && savedEdits) {
      setForm((prev) => ({
        ...prev,
        displayName: savedEdits.displayName ?? prev.displayName,
        bio: savedEdits.bio ?? prev.bio,
        imageUrl: savedEdits.imageUrl ?? prev.imageUrl,
        xHandle: savedEdits.xHandle ?? prev.xHandle,
        bannerUrl: savedEdits.bannerUrl ?? prev.bannerUrl,
        themeKey: savedEdits.themeKey ?? prev.themeKey,
        githubHandle: savedEdits.githubHandle ?? prev.githubHandle,
        websiteUrl: savedEdits.websiteUrl ?? prev.websiteUrl,
      }));
    }
  }, [updateStatus, savedEdits]);

  // ── Field handlers ────────────────────────────────────────────────────────

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

      if (errors[field as keyof FormErrors]) {
        setErrors((prev) => ({ ...prev, [field]: undefined }));
      }
    };

  const handleBannerCrop = (dataUrl: string) => {
    setForm((prev) => ({ ...prev, bannerUrl: dataUrl }));
  };

  const handleBannerError = (msg: string) => {
    setErrors((prev) => ({ ...prev, bannerUrl: msg }));
  };

  const handleAvatarCrop = (dataUrl: string) => {
    setForm((prev) => ({ ...prev, imageUrl: dataUrl }));
  };

  const handleBlur = (field: keyof ProfileFormData) => () => {
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

  // ── Submit ────────────────────────────────────────────────────────────────

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Submit guard: block while a tx is already in-flight.
    if (updateStatus === "pending" || updateStatus === "confirming") return;

    const trimmedForm: ProfileFormData = {
      ...form,
      username: form.username.trim(),
      displayName: form.displayName.trim(),
      bio: form.bio.trim(),
      imageUrl: form.imageUrl.trim(),
      xHandle: form.xHandle.trim(),
      githubHandle: form.githubHandle?.trim(),
      websiteUrl: form.websiteUrl?.trim(),
    };

    const validationErrors = validate(trimmedForm);
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);

      // Build ordered error summary (matches DOM field order).
      const fieldOrder: Array<{ key: keyof FormErrors; label: string; fieldId: string }> = [
        { key: "displayName", label: "Display Name", fieldId: "display-name" },
        { key: "bio",         label: "Bio",          fieldId: "bio" },
        { key: "xHandle",     label: "X Handle",     fieldId: "x-(twitter)-handle-(optional)" },
        { key: "githubHandle",label: "GitHub Handle",fieldId: "github-handle-(optional)" },
        { key: "websiteUrl",  label: "Website URL",  fieldId: "website-url-(optional)" },
        { key: "imageUrl",    label: "Profile Image URL", fieldId: "profile-image-url-(optional)" },
      ];
      const summary = fieldOrder
        .filter(({ key }) => validationErrors[key as keyof FormErrors])
        .map(({ key, label, fieldId }) => ({
          fieldId,
          label,
          message: validationErrors[key as keyof FormErrors]!,
        }));
      setErrorSummaryItems(summary);

      // Focus the first invalid field directly.
      const firstId = summary[0]?.fieldId;
      if (firstId) {
        const el = document.getElementById(firstId);
        el?.focus();
      }
      return;
    }
    setErrorSummaryItems([]);

    // Compute the diff against the canonical (or optimistic) profile.
    const data: Partial<ProfileFormData> = {};
    if (trimmedForm.displayName !== profile.displayName)
      data.displayName = trimmedForm.displayName;
    if (trimmedForm.bio !== profile.bio) data.bio = trimmedForm.bio;
    if (trimmedForm.imageUrl !== profile.imageUrl)
      data.imageUrl = trimmedForm.imageUrl;
    if (trimmedForm.xHandle !== profile.xHandle)
      data.xHandle = trimmedForm.xHandle;
    if (form.bannerUrl) data.bannerUrl = form.bannerUrl;
    if (form.themeKey && form.themeKey !== "default")
      data.themeKey = form.themeKey;
    if (trimmedForm.githubHandle)
      data.githubHandle = trimmedForm.githubHandle.replace(/^@/, "");
    if (trimmedForm.websiteUrl) data.websiteUrl = trimmedForm.websiteUrl;

    if (Object.keys(data).length === 0) {
      addToast({
        message: "No changes to save.",
        type: "info",
        duration: 3000,
      });
      return;
    }

    setTxStatus("signing");
    setTxHash(undefined);

    try {
      const hash = await submitUpdate(data, trimmedForm);
      setTxHash(hash);
      setTxStatus("success");
      clearEditDraft();
      clearSavedEdits();

      addToast({
        message: "Profile updated successfully!",
        type: "success",
        duration: 5000,
      });
      setTimeout(() => navigate("/profile"), 1500);
    } catch (err) {
      // updateStatus will be 'error' (set by rollbackUpdate inside hook).
      // Local txStatus mirrors that for the TransactionStatus widget.
      setTxStatus("error");
    }
  };

  // ── Conflict handlers ─────────────────────────────────────────────────────

  const handleAcceptServer = () => {
    resolveConflict();
    setTxStatus("idle");
    // Reload form from the server version that resolveConflict will commit.
    if (conflictProfile) {
      setForm((prev) => ({
        ...prev,
        displayName: conflictProfile.displayName,
        bio: conflictProfile.bio,
        imageUrl: conflictProfile.imageUrl,
        xHandle: conflictProfile.xHandle,
      }));
    }
  };

  const handleRetryOwn = () => {
    // Keep savedEdits in the form, just dismiss the conflict banner.
    resolveConflict();
    setTxStatus("idle");
  };

  // ── Derived state ─────────────────────────────────────────────────────────

  const isPending =
    updateStatus === "pending" || updateStatus === "confirming";
  const isInFlight =
    isPending || ["signing", "submitting", "confirming"].includes(txStatus);

  return (
    <>
      {/* Conflict modal (rendered outside the form so it sits on top) */}
      {updateStatus === "conflict" && conflictProfile && (
        <ConflictDialog
          conflictProfile={conflictProfile}
          onAcceptServer={handleAcceptServer}
          onRetryOwn={handleRetryOwn}
        />
      )}

      <form
        onSubmit={handleSubmit}
        noValidate
        className="space-y-8 max-w-lg mx-auto"
      >
        {/* Draft restore banner */}
        {hasDraft && (
          <DraftRestoreBanner
            savedAt={draftSavedAt}
            onRestore={restoreDraft}
            onDiscard={discardEditDraft}
          />
        )}

        {/* Optimistic/confirming pending banner */}
        {isPending && (
          <PendingBanner
            status={updateStatus as "pending" | "confirming"}
          />
        )}

        {/* Rollback error banner (distinct from tx widget) */}
        {updateStatus === "error" && updateError && (
          <div
            role="alert"
            data-testid="rollback-error-banner"
            className="flex items-start gap-3 border-2 border-red-600 bg-red-50 px-4 py-3 text-sm"
          >
            <AlertTriangle
              size={18}
              className="text-red-600 shrink-0 mt-0.5"
              aria-hidden="true"
            />
            <div className="flex-1 space-y-1">
              <p className="font-bold text-red-700">Update failed</p>
              <p className="text-red-600">{updateError}</p>
              <p className="text-xs text-red-500">
                Your edits have been preserved — review and resubmit when
                ready.
              </p>
            </div>
            <button
              type="button"
              aria-label="Dismiss error"
              className="text-red-400 hover:text-red-600 font-black text-lg leading-none"
              onClick={() => {
                resetError();
                setTxStatus("idle");
              }}
            >
              ×
            </button>
          </div>
        )}

        {/* Username (read-only) */}
        <div>
          <label className="block text-sm font-bold uppercase tracking-wide mb-2">
            Username
          </label>
          <div className="relative">
            <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-700 dark:text-gray-300">
              <Lock size={18} />
            </div>
            <input
              value={form.username}
              disabled
              className="w-full px-4 py-3 pl-12 border-2 border-black bg-gray-100 text-black font-medium opacity-75 cursor-not-allowed focus:outline-none"
            />
          </div>
          <p className="mt-1 text-xs text-gray-800 dark:text-gray-200">
            Username cannot be changed after registration.
          </p>
        </div>

        {/* Display Name */}
        <Input
          label="Display Name"
          placeholder="Your Name"
          value={form.displayName}
          onChange={handleChange("displayName")}
          error={errors.displayName}
          disabled={isInFlight}
          maxLength={64}
          required
        />

        {/* Bio with Markdown preview */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="block text-sm font-bold uppercase tracking-wide">
              Bio
            </label>
            <button
              type="button"
              onClick={() => setShowBioPreview((v) => !v)}
              className="flex items-center gap-1 text-xs font-black uppercase hover:underline"
            >
              <Eye size={13} />
              {showBioPreview ? "Edit" : "Preview"}
            </button>
          </div>

          {showBioPreview ? (
            <div
              className="min-h-[6rem] w-full border-2 border-black bg-gray-50 p-3 text-sm leading-relaxed"
              dangerouslySetInnerHTML={{
                __html: renderMarkdown(form.bio || "No bio yet."),
              }}
            />
          ) : (
            <Textarea
              placeholder="Tell supporters about yourself… (Markdown supported: **bold**, *italic*, `code`)"
              value={form.bio}
              onChange={handleChange("bio")}
              onBlur={handleBlur("bio")}
              error={errors.bio}
              disabled={isInFlight}
              maxLength={MAX_BIO_LENGTH}
              warnAt={240}
              rows={4}
            />
          )}
          <p className="text-xs text-gray-500">
            {form.bio.trim().length}/{MAX_BIO_LENGTH} · Markdown supported
          </p>
        </div>

        {/* Color theme */}
        <div className="space-y-2">
          <label className="block text-sm font-bold uppercase tracking-wide">
            Profile theme
          </label>
          <div className="flex flex-wrap gap-2">
            {Object.entries(THEME_COLORS).map(([key, theme]) => (
              <button
                key={key}
                type="button"
                disabled={isInFlight}
                onClick={() =>
                  setForm((prev) => ({ ...prev, themeKey: key }))
                }
                className={`px-3 py-1.5 text-xs font-black uppercase border-2 border-black transition-colors ${
                  form.themeKey === key
                    ? "bg-black text-white"
                    : "bg-white hover:bg-gray-100"
                }`}
              >
                {theme.label}
              </button>
            ))}
          </div>
        </div>

        {/* Banner image */}
        <div className="space-y-2">
          <ImageCropper
            label="Banner / Cover Image (max 5 MB)"
            maxSizeBytes={MAX_BANNER_BYTES}
            onCrop={handleBannerCrop}
            onError={handleBannerError}
          />
          {errors.bannerUrl && (
            <p role="alert" className="text-xs font-bold text-red-600">
              {errors.bannerUrl}
            </p>
          )}
          {form.bannerUrl && (
            <OptimizedImage
              src={form.bannerUrl}
              alt="Banner preview"
              width={640}
              height={80}
              sizes="(max-width: 640px) 100vw, 640px"
              loading="lazy"
              decoding="async"
              className="h-20 w-full object-cover border-2 border-black"
            />
          )}
        </div>

        {/* Avatar upload */}
        <ImageCropper
          label="Avatar (max 5 MB)"
          maxSizeBytes={MAX_BANNER_BYTES}
          onCrop={handleAvatarCrop}
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
          disabled={isInFlight}
        />

        {/* GitHub */}
        <Input
          label="GitHub Handle (optional)"
          placeholder="@yourgithub"
          value={form.githubHandle ?? ""}
          onChange={handleChange("githubHandle")}
          error={errors.githubHandle}
          disabled={isInFlight}
        />

        {/* Website */}
        <Input
          label="Website URL (optional)"
          placeholder="https://yoursite.com"
          type="url"
          value={form.websiteUrl ?? ""}
          onChange={handleChange("websiteUrl")}
          error={errors.websiteUrl}
          disabled={isInFlight}
        />

        {/* Profile Image URL */}
        <Input
          label="Profile Image URL (optional)"
          placeholder="https://example.com/avatar.png"
          type="url"
          value={form.imageUrl}
          onChange={handleChange("imageUrl")}
          error={errors.imageUrl}
          disabled={isInFlight}
        />

        {/* Profile preview toggle */}
        <div className="space-y-3">
          <button
            type="button"
            onClick={() => setShowProfilePreview((v) => !v)}
            className="flex items-center gap-2 text-sm font-black uppercase border-2 border-black px-4 py-2 hover:bg-gray-100 transition-colors"
          >
            <Eye size={16} />
            {showProfilePreview ? "Hide preview" : "Preview profile"}
          </button>

          {showProfilePreview && (
            <div className="space-y-2">
              <p className="text-xs font-black uppercase tracking-widest text-gray-500">
                Profile preview
              </p>
              <ProfilePreview profile={profile} form={form} />
            </div>
          )}
        </div>

        {/* Transaction status widget */}
        {txStatus !== "idle" && (
          <TransactionStatus
            status={txStatus}
            txHash={txHash}
            errorMessage={
              txStatus === "error"
                ? updateError ?? "Update failed. Please try again."
                : undefined
            }
            onRetry={() => {
              setTxStatus("idle");
              resetError();
            }}
          />
        )}

        <div className="flex gap-3 pt-2">
          <Button
            type="button"
            variant="outline"
            size="lg"
            disabled={isInFlight}
            className="flex-1"
            onClick={() => navigate("/profile")}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            size="lg"
            disabled={isInFlight || txStatus === "success"}
            aria-disabled={isInFlight || txStatus === "success"}
            className="flex-1"
          >
            {isInFlight ? "Updating…" : "Save Changes"}
          </Button>
        </div>
      </form>
    </>
  );
};

export default EditProfileForm;
