import AchievementGallery from "@/features/achievements/AchievementGallery";
import StreakDisplay from "@/features/achievements/StreakDisplay";
import Card from "@/components/ui/Card";
import { deriveAchievements } from "@/hooks/useAchievements";

interface TipCreatorAchievementsProps {
  totalTipsCount: number;
  streak?: number;
}

const TipCreatorAchievements = ({
  totalTipsCount,
  streak = 0,
}: TipCreatorAchievementsProps) => (
  <section
    role="region"
    aria-labelledby="creator-achievements-heading"
    className="space-y-6"
  >
    <h2
      id="creator-achievements-heading"
      className="text-2xl font-black uppercase tracking-tight"
    >
      Creator Achievements
    </h2>
    {streak > 0 && (
      <Card padding="lg" className="border-4 shadow-brutalist">
        <h3 className="mb-4 text-lg font-black uppercase">Streak</h3>
        <StreakDisplay current={streak} longest={streak} />
      </Card>
    )}
    <Card padding="lg" className="border-4 shadow-brutalist">
      <AchievementGallery
        unlockedIds={deriveAchievements(totalTipsCount, streak)}
      />
    </Card>
  </section>
);

export default TipCreatorAchievements;
