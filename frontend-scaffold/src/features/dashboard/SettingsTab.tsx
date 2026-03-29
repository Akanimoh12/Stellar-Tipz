import React, { useState } from "react";
import { Link } from "react-router-dom";
import {
  Bell,
  Copy,
  Pencil,
  QrCode,
  Share2,
  AlertTriangle,
} from "lucide-react";

import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import type { Profile } from "@/types";

const TIP_DOMAIN = import.meta.env.VITE_APP_URL || window.location.origin;

interface SettingsTabProps {
  profile: Profile;
}

const SettingsTab: React.FC<SettingsTabProps> = ({ profile }) => {
  const tipUrl = `${TIP_DOMAIN}/@${profile.username}`;
  const [tipCopied, setTipCopied] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);

  const copyTipUrl = async () => {
    try {
      await navigator.clipboard.writeText(tipUrl);
      setTipCopied(true);
      setTimeout(() => setTipCopied(false), 2000);
    } catch {
      /* ignore */
    }
  };

  const copyForShare = async () => {
    try {
      await navigator.clipboard.writeText(tipUrl);
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 2000);
    } catch {
      /* ignore */
    }
  };

  const shareOnX = () => {
    const text = encodeURIComponent("Send me tips on Stellar Tipz!");
    const url = encodeURIComponent(tipUrl);
    window.open(
      `https://twitter.com/intent/tweet?text=${text}&url=${url}`,
      "_blank",
      "width=550,height=420",
    );
  };

  return (
    <div className="space-y-6">
      <Card className="space-y-4" padding="lg">
        <h2 className="text-xl font-black uppercase">Profile</h2>
        <p className="text-sm font-bold text-gray-600">
          Update your public creator details and linked socials.
        </p>
        <div className="grid gap-2 border-2 border-black bg-off-white p-4 text-sm">
          <div className="flex justify-between gap-4 border-b border-gray-200 pb-2">
            <span className="font-bold uppercase text-gray-500">Username</span>
            <span className="font-black">@{profile.username}</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="font-bold uppercase text-gray-500">Display name</span>
            <span className="font-black">{profile.displayName || "—"}</span>
          </div>
        </div>
        <Link to="/profile/edit">
          <Button variant="outline" size="sm" icon={<Pencil size={16} />}>
            Edit Profile
          </Button>
        </Link>
      </Card>

      <Card className="space-y-4" padding="lg">
        <h2 className="text-xl font-black uppercase">Tip Link</h2>
        <p className="text-sm font-bold text-gray-600">
          Your public URL for receiving tips.
        </p>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
          <div className="min-w-0 flex-1 border-2 border-black bg-white px-3 py-2 font-mono text-sm font-bold break-all">
            {tipUrl}
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="shrink-0 sm:self-start"
            icon={<Copy size={16} />}
            onClick={() => void copyTipUrl()}
          >
            {tipCopied ? "Copied!" : "Copy"}
          </Button>
        </div>
        <div>
          <p className="mb-2 text-xs font-black uppercase tracking-[0.2em] text-gray-500">
            QR code
          </p>
          <div className="flex h-36 w-36 flex-col items-center justify-center border-3 border-black bg-gray-100">
            <QrCode size={40} className="text-gray-400" aria-hidden />
            <p className="mt-2 px-2 text-center text-[10px] font-bold uppercase text-gray-500">
              QR coming soon
            </p>
          </div>
        </div>
      </Card>

      <Card className="space-y-4" padding="lg">
        <h2 className="text-xl font-black uppercase flex items-center gap-2">
          <Bell size={20} aria-hidden />
          Notifications
        </h2>
        <p className="text-sm font-bold text-gray-600">
          Preferences will connect to email and push once available.
        </p>
        <ul className="space-y-3">
          {[
            { id: "tips", label: "Notify me when I receive a tip" },
            { id: "weekly", label: "Weekly summary email" },
            { id: "product", label: "Product updates from Tipz" },
          ].map((item) => (
            <li
              key={item.id}
              className="flex items-center justify-between gap-4 border-2 border-black px-3 py-2"
            >
              <label
                htmlFor={`settings-notify-${item.id}`}
                className="text-sm font-bold"
              >
                {item.label}
              </label>
              <input
                id={`settings-notify-${item.id}`}
                type="checkbox"
                disabled
                className="h-4 w-4 cursor-not-allowed border-2 border-black accent-black opacity-60"
                title="Coming soon"
              />
            </li>
          ))}
        </ul>
      </Card>

      <Card className="space-y-4" padding="lg">
        <h2 className="text-xl font-black uppercase flex items-center gap-2">
          <Share2 size={20} aria-hidden />
          Share
        </h2>
        <p className="text-sm font-bold text-gray-600">
          Spread your tip page on X or copy the link anywhere.
        </p>
        <div className="flex flex-wrap gap-3">
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={shareOnX}
          >
            Share on X
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            icon={<Copy size={16} />}
            onClick={() => void copyForShare()}
          >
            {shareCopied ? "Copied!" : "Copy link"}
          </Button>
        </div>
      </Card>

      <Card
        className="space-y-4 border-red-600 bg-red-50"
        padding="lg"
      >
        <h2 className="text-xl font-black uppercase text-red-800 flex items-center gap-2">
          <AlertTriangle size={22} aria-hidden />
          Danger Zone
        </h2>
        <p className="text-sm font-bold text-red-900/90">
          Deregistering removes your creator profile from Tipz. There is no
          on-chain deregister call in the scaffold yet — this action will be
          wired after the contract supports it.
        </p>
        <Button type="button" variant="outline" size="sm" disabled>
          Deregister / deactivate
        </Button>
      </Card>
    </div>
  );
};

export default SettingsTab;
