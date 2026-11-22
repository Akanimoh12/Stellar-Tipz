/**
 * Validation logic for RegisterForm.
 *
 * Extracted into its own module so it can be unit-tested independently of
 * the React component and reused by any future multi-step registration flow.
 */

import {
  validateBio,
  validateDisplayName,
  validateUsername,
  validateXHandle,
} from "@/helpers/validation";
import { ProfileFormData } from "@/types/profile";
import type { ErrorSummaryItem } from "@/components/shared/ErrorSummary";

export interface FormErrors {
  username?: string;
  displayName?: string;
  bio?: string;
  imageUrl?: string;
  xHandle?: string;
}

/**
 * Validate all fields in the registration form.
 *
 * @param data       Trimmed form data.
 * @param available  Whether the chosen username is available (null = unknown).
 * @param checking   True while the availability check is in-flight.
 */
export function validateRegistrationForm(
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

/** Canonical DOM field order used to build the error summary and auto-focus. */
const FIELD_ORDER: Array<{ key: keyof FormErrors; label: string; fieldId: string }> = [
  { key: "username",    label: "Username",              fieldId: "username" },
  { key: "displayName", label: "Display Name",          fieldId: "display-name" },
  { key: "bio",         label: "Bio",                   fieldId: "bio" },
  { key: "xHandle",     label: "X Handle",              fieldId: "x-(twitter)-handle-(optional)" },
  { key: "imageUrl",    label: "Profile Image URL",     fieldId: "profile-image-url-(optional)" },
];

/** Convert a FormErrors object into an ordered ErrorSummary list. */
export function buildErrorSummary(errors: FormErrors): ErrorSummaryItem[] {
  return FIELD_ORDER
    .filter(({ key }) => errors[key])
    .map(({ key, label, fieldId }) => ({
      fieldId,
      label,
      message: errors[key]!,
    }));
}
