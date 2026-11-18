import type { ProfileFormData } from "@/types/profile";
import {
  validateBio,
  validateDisplayName,
  validateXHandle,
} from "@/helpers/validation";

export interface FormErrors {
  displayName?: string;
  bio?: string;
  imageUrl?: string;
  xHandle?: string;
  githubHandle?: string;
  websiteUrl?: string;
  bannerUrl?: string;
}

const isValidUrl = (url: string) => {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
};

export function validateProfileForm(data: ProfileFormData): FormErrors {
  const errors: FormErrors = {};
  const displayName = validateDisplayName(data.displayName);
  if (!displayName.valid) errors.displayName = displayName.error;
  const bio = validateBio(data.bio);
  if (!bio.valid) errors.bio = bio.error;
  if (data.xHandle.trim()) {
    const xHandle = validateXHandle(data.xHandle);
    if (!xHandle.valid) errors.xHandle = xHandle.error;
  }
  if (data.imageUrl && !isValidUrl(data.imageUrl))
    errors.imageUrl = "Please enter a valid URL.";
  if (data.websiteUrl && !isValidUrl(data.websiteUrl))
    errors.websiteUrl = "Please enter a valid URL (include https://).";
  return errors;
}
