import React from "react";
import { Github, Globe, Twitter } from "lucide-react";

import Avatar from "../../components/ui/Avatar";
import type { Profile } from "../../types/contract";
import type { ProfileFormData } from "../../types/profile";

export const THEME_COLORS: Record<string, { bg: string; accent: string; label: string }> = {
  default: { bg: "bg-white", accent: "bg-yellow-100", label: "Default" },
  ocean:   { bg: "bg-blue-50", accent: "bg-blue-200", label: "Ocean" },
  forest:  { bg: "bg-green-50", accent: "bg-green-200", label: "Forest" },
  sunset:  { bg: "bg-orange-50", accent: "bg-orange-200", label: "Sunset" },
  midnight:{ bg: "bg-gray-900 text-white", accent: "bg-gray-700", label: "Midnight" },
};

export type ThemeKey = keyof typeof THEME_COLORS;

function renderMarkdown(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/`(.+?)`/g, "<code>$1</code>")
    .replace(/\n/g, "<br />");
}

interface ProfilePreviewProps {
  profile: Profile;
  form: ProfileFormData & {
    bannerUrl?: string;
    themeKey?: ThemeKey;
    githubHandle?: string;
    websiteUrl?: string;
  };
}

const ProfilePreview: React.FC<ProfilePreviewProps> = ({ profile, form }) => {
  const themeKey: ThemeKey = (form.themeKey as ThemeKey) ?? "default";
  const theme = THEME_COLORS[themeKey] ?? THEME_COLORS.default;
  const isMidnight = themeKey === "midnight";

  const bannerSrc = form.bannerUrl || null;
  const displayName = form.displayName || profile.displayName;
  const bio = form.bio || profile.bio;
  const xHandle = form.xHandle || profile.xHandle;
  const imageUrl = form.imageUrl || profile.imageUrl;
  const githubHandle = form.githubHandle ?? "";
  const websiteUrl = form.websiteUrl ?? "";

  return (
    <div
      className={`w-full overflow-hidden border-4 border-black shadow-brutalist ${theme.bg}`}
      aria-label="Profile preview"
    >
      {/* Banner */}
      <div className={`relative h-28 w-full ${theme.accent}`}>
        {bannerSrc && (
          <img
            src={bannerSrc}
            alt="Profile banner"
            className="absolute inset-0 h-full w-full object-cover"
          />
        )}
        {/* Avatar overlapping banner */}
        <div className="absolute -bottom-8 left-5">
          <Avatar
            address={profile.owner}
            alt={displayName}
            fallback={displayName}
            size="xl"
            className="border-4 border-black"
            src={imageUrl || undefined}
          />
        </div>
      </div>

      <div className="px-5 pt-12 pb-5 space-y-3">
        <div>
          <p className={`text-lg font-black uppercase leading-tight ${isMidnight ? "text-white" : "text-black"}`}>
            {displayName}
          </p>
          <p className={`text-xs font-bold ${isMidnight ? "text-gray-400" : "text-gray-500"}`}>
            @{profile.username}
          </p>
        </div>

        {bio && (
          <p
            className={`text-sm leading-relaxed ${isMidnight ? "text-gray-300" : "text-gray-700"}`}
            dangerouslySetInnerHTML={{ __html: renderMarkdown(bio) }}
          />
        )}

        {/* Social links */}
        <div className="flex flex-wrap gap-3 pt-1">
          {xHandle && (
            <span className={`inline-flex items-center gap-1.5 text-xs font-bold ${isMidnight ? "text-gray-300" : "text-gray-600"}`}>
              <Twitter size={13} />@{xHandle.replace(/^@/, "")}
            </span>
          )}
          {githubHandle && (
            <span className={`inline-flex items-center gap-1.5 text-xs font-bold ${isMidnight ? "text-gray-300" : "text-gray-600"}`}>
              <Github size={13} />{githubHandle.replace(/^@/, "")}
            </span>
          )}
          {websiteUrl && (
            <span className={`inline-flex items-center gap-1.5 text-xs font-bold ${isMidnight ? "text-gray-300" : "text-gray-600"}`}>
              <Globe size={13} />{websiteUrl.replace(/^https?:\/\//, "").replace(/\/$/, "")}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

export default ProfilePreview;
