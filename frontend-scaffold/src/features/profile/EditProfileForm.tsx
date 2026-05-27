import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Lock, Eye } from "lucide-react";

import Input from "@/components/ui/Input";
import Textarea from "@/components/ui/Textarea";
import Button from "@/components/ui/Button";
import TransactionStatus from "@/components/shared/TransactionStatus";
import ImageCropper from "@/components/shared/ImageCropper";
import { useContract } from "@/hooks";
import { useToastStore } from "@/store/toastStore";
import type { Profile } from "@/types/contract";
import type { ProfileFormData } from "@/types/profile";
import ProfilePreview from "./ProfilePreview";
import { THEME_COLORS } from "./profileThemes";

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

  if (!data.displayName.trim() || data.displayName.length > 64) {
    errors.displayName =
      "Display name is required and must be 1–64 characters.";
  }

  if (data.bio && data.bio.length > 280) {
    errors.bio = "Bio must be 280 characters or fewer.";
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

function renderMarkdown(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/`(.+?)`/g, "<code class='bg-gray-100 px-1 rounded font-mono text-xs'>$1</code>")
    .replace(/\n/g, "<br />");
}

interface EditProfileFormProps {
  profile: Profile;
  onDirtyChange?: (dirty: boolean) => void;
}

const EditProfileForm: React.FC<EditProfileFormProps> = ({
  profile,
  onDirtyChange,
}) => {
  const [form, setForm] = useState<ProfileFormData>({
    username: profile.username,
    displayName: profile.displayName,
    bio: profile.bio,
    imageUrl: profile.imageUrl,
    xHandle: profile.xHandle,
    bannerUrl: "",
    themeKey: "default",
    githubHandle: "",
    websiteUrl: "",
  });
  const [errors, setErrors] = useState<FormErrors>({});
  const [txStatus, setTxStatus] = useState<TxStatus>("idle");
  const [txHash, setTxHash] = useState<string | undefined>(undefined);
  const [txError, setTxError] = useState<string | undefined>(undefined);
  const [showBioPreview, setShowBioPreview] = useState(false);
  const [showProfilePreview, setShowProfilePreview] = useState(false);

  const { updateProfile } = useContract();
  const { addToast } = useToastStore();
  const navigate = useNavigate();

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

  const handleChange =
    (field: keyof ProfileFormData) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setForm((prev) => ({ ...prev, [field]: e.target.value }));
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const validationErrors = validate(form);
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    try {
      setTxStatus("signing");
      setTxError(undefined);
      setTxHash(undefined);

      const data: Partial<ProfileFormData> = {};

      if (form.displayName.trim() !== profile.displayName)
        data.displayName = form.displayName.trim();
      if (form.bio.trim() !== profile.bio)
        data.bio = form.bio.trim();
      if (form.imageUrl.trim() !== profile.imageUrl)
        data.imageUrl = form.imageUrl.trim();
      const xHandleFormatted = form.xHandle.trim().replace(/^@/, "");
      if (xHandleFormatted !== profile.xHandle)
        data.xHandle = xHandleFormatted;
      if (form.bannerUrl) data.bannerUrl = form.bannerUrl;
      if (form.themeKey && form.themeKey !== "default") data.themeKey = form.themeKey;
      if (form.githubHandle) data.githubHandle = form.githubHandle.trim().replace(/^@/, "");
      if (form.websiteUrl) data.websiteUrl = form.websiteUrl.trim();

      if (Object.keys(data).length === 0) {
        addToast({ message: "No changes to save.", type: "info", duration: 3000 });
        setTxStatus("idle");
        return;
      }

      setTxStatus("submitting");
      const hash = await updateProfile(data);

      setTxStatus("confirming");
      setTxHash(hash);
      setTxStatus("success");

      addToast({ message: "Profile updated successfully!", type: "success", duration: 5000 });
      setTimeout(() => navigate("/profile"), 1500);
    } catch (err) {
      setTxStatus("error");
      setTxError(
        err instanceof Error ? err.message : "Update failed. Please try again.",
      );
    }
  };

  const isSubmitting = ["signing", "submitting", "confirming"].includes(txStatus);

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-8 max-w-lg mx-auto">
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
        disabled={isSubmitting}
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
            dangerouslySetInnerHTML={{ __html: renderMarkdown(form.bio || "No bio yet.") }}
          />
        ) : (
          <Textarea
            placeholder="Tell supporters about yourself… (Markdown supported: **bold**, *italic*, `code`)"
            value={form.bio}
            onChange={handleChange("bio")}
            error={errors.bio}
            disabled={isSubmitting}
            maxLength={280}
            rows={4}
          />
        )}
        <p className="text-xs text-gray-500">
          {form.bio.length}/280 · Markdown supported
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
              onClick={() => setForm((prev) => ({ ...prev, themeKey: key }))}
              className={`px-3 py-1.5 text-xs font-black uppercase border-2 border-black transition-colors ${
                form.themeKey === key ? "bg-black text-white" : "bg-white hover:bg-gray-100"
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
          <p role="alert" className="text-xs font-bold text-red-600">{errors.bannerUrl}</p>
        )}
        {form.bannerUrl && (
          <img
            src={form.bannerUrl}
            alt="Banner preview"
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
        error={errors.xHandle}
        disabled={isSubmitting}
      />

      {/* GitHub */}
      <Input
        label="GitHub Handle (optional)"
        placeholder="@yourgithub"
        value={form.githubHandle ?? ""}
        onChange={handleChange("githubHandle")}
        error={errors.githubHandle}
        disabled={isSubmitting}
      />

      {/* Website */}
      <Input
        label="Website URL (optional)"
        placeholder="https://yoursite.com"
        type="url"
        value={form.websiteUrl ?? ""}
        onChange={handleChange("websiteUrl")}
        error={errors.websiteUrl}
        disabled={isSubmitting}
      />

      {/* Profile Image URL */}
      <Input
        label="Profile Image URL (optional)"
        placeholder="https://example.com/avatar.png"
        type="url"
        value={form.imageUrl}
        onChange={handleChange("imageUrl")}
        error={errors.imageUrl}
        disabled={isSubmitting}
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

      {/* Transaction status */}
      {txStatus !== "idle" && (
        <TransactionStatus
          status={txStatus}
          txHash={txHash}
          errorMessage={txError}
          onRetry={() => setTxStatus("idle")}
        />
      )}

      <div className="flex gap-3 pt-2">
        <Button
          type="button"
          variant="outline"
          size="lg"
          disabled={isSubmitting}
          className="flex-1"
          onClick={() => navigate("/profile")}
        >
          Cancel
        </Button>
        <Button
          type="submit"
          variant="primary"
          size="lg"
          disabled={isSubmitting || txStatus === "success"}
          className="flex-1"
        >
          {isSubmitting ? "Updating…" : "Save Changes"}
        </Button>
      </div>
    </form>
  );
};

export default EditProfileForm;
