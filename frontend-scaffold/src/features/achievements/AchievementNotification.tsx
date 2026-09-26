import React, { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import { Achievement } from "@/hooks/useAchievements";
import ShareButton from "@/components/shared/ShareButton";
import { createAchievementShareData } from "@/helpers/sharing";
import { useProfile } from "@/hooks/useProfile";

interface AchievementNotificationProps {
  achievement: Achievement | null;
  onDismiss: () => void;
  /** Auto-dismiss after ms (default: 4000) */
  autoDismissMs?: number;
}

/**
 * Animated toast-style notification shown when an achievement is unlocked.
 */
const AchievementNotification: React.FC<AchievementNotificationProps> = ({
  achievement,
  onDismiss,
  autoDismissMs = 4000,
}) => {
  const { profile } = useProfile();

  useEffect(() => {
    if (!achievement) return;
    const timer = setTimeout(onDismiss, autoDismissMs);
    return () => clearTimeout(timer);
  }, [achievement, onDismiss, autoDismissMs]);

  return (
    <AnimatePresence>
      {achievement && (
        <motion.div
          key={achievement.id}
          initial={{ opacity: 0, y: 80, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 80, scale: 0.9 }}
          transition={{ type: "spring", stiffness: 400, damping: 28 }}
          role="status"
          aria-live="polite"
          aria-label={`Achievement unlocked: ${achievement.label}`}
          className="fixed bottom-safe right-safe z-50 flex max-w-xs items-start gap-4 border-4 border-black bg-yellow-300 p-4 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]"
        >
          {/* Emoji */}
          <span className="text-3xl leading-none" aria-hidden="true">
            {achievement.emoji}
          </span>

          {/* Text */}
          <div className="flex-1 min-w-0">
            <p className="text-xs font-black uppercase tracking-widest text-black">
              Achievement Unlocked
            </p>
            <p className="mt-0.5 text-base font-black uppercase text-black">
              {achievement.label}
            </p>
            <p className="mt-1 text-xs font-bold text-gray-800">
              {achievement.description}
            </p>
            {profile && (
              <div className="mt-2">
                <ShareButton
                  type="achievement"
                  data={createAchievementShareData(achievement.label, profile.username)}
                  variant="icon"
                  size="sm"
                />
              </div>
            )}
          </div>

          {/* Dismiss */}
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Dismiss achievement notification"
            className="shrink-0 border-2 border-black bg-black p-1 text-white hover:bg-gray-800"
          >
            <X size={14} />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default AchievementNotification;
