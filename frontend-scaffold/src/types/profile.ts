export type { Profile } from "./contract";

/** Form data for creating or updating a profile. */
export interface ProfileFormData {
  username: string;
  displayName: string;
  bio: string;
  imageUrl: string;
  xHandle: string;
  /** Optional banner / cover image URL or data-URL (from cropper) */
  bannerUrl?: string;
  /** Profile colour theme key */
  themeKey?: string;
  /** GitHub username (without @) */
  githubHandle?: string;
  /** Creator website URL */
  websiteUrl?: string;
}
