export type { Profile } from "./contract";

/** Form data for creating or updating a profile. */
export interface ProfileFormData {
  username: string;
  displayName: string;
  bio: string;
  imageUrl: string;
  xHandle: string;
}
