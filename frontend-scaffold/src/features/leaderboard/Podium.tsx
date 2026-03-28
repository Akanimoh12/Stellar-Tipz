import React from "react";
import { motion } from "framer-motion";
import { Crown, Medal, Award } from "lucide-react";
import { Link } from "react-router-dom";

import AmountDisplay from "../../components/shared/AmountDisplay";
import Avatar from "../../components/ui/Avatar";
import Badge from "../../components/ui/Badge";
import { getCreditTier, type LeaderboardEntry } from "../../types";

interface PodiumProps {
  creators: LeaderboardEntry[];
}

const podiumSlots = [
  {
    rank: 2,
    badgeLabel: "Silver",
    icon: <Medal size={18} />,
    badgeClass: "bg-gray-200",
    shellClass: "md:mt-10",
    delay: 0.12,
  },
  {
    rank: 1,
    badgeLabel: "Gold",
    icon: <Crown size={18} />,
    badgeClass: "bg-yellow-300",
    shellClass: "md:-mt-6",
    delay: 0,
  },
  {
    rank: 3,
    badgeLabel: "Bronze",
    icon: <Award size={18} />,
    badgeClass: "bg-orange-300",
    shellClass: "md:mt-16",
    delay: 0.2,
  },
] as const;

const Podium: React.FC<PodiumProps> = ({ creators }) => {
  const topThree = creators.slice(0, 3);
  const ordered = [topThree[1], topThree[0], topThree[2]].filter(
    (entry): entry is LeaderboardEntry => Boolean(entry)
  );

  return (
    <section className="grid gap-4 md:grid-cols-3 md:items-end">
      {ordered.map((creator, index) => {
        const slot = podiumSlots[index];
        const tier = getCreditTier(creator.creditScore);

        return (
          <motion.div
            key={creator.address}
            initial={{ opacity: 0, y: 36, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.35, delay: slot.delay }}
            className={slot.shellClass}
          >
            <Link
              to={`/@${creator.username}`}
              className="block h-full border-[4px] border-black bg-white p-6 transition-transform duration-200 hover:-translate-x-1 hover:-translate-y-1"
              style={{ boxShadow: "8px 8px 0px 0px rgba(0,0,0,1)" }}
            >
              <div className="flex items-start justify-between gap-4">
                <span
                  className={`inline-flex items-center gap-2 border-[3px] border-black px-3 py-2 text-sm font-black uppercase ${slot.badgeClass}`}
                >
                  {slot.icon}
                  #{slot.rank}
                </span>
                <Badge tier={tier} />
              </div>

              <div className="mt-5 flex flex-col items-center text-center">
                <Avatar
                  address={creator.address}
                  alt={creator.username}
                  fallback={creator.username}
                  size="xl"
                />
                <p className="mt-4 text-2xl font-black uppercase">
                  {creator.username}
                </p>
                <p className="mt-2 text-sm font-bold uppercase tracking-[0.2em] text-gray-500">
                  {slot.badgeLabel} podium
                </p>
              </div>

              <div className="mt-6 grid gap-3">
                <div className="border-[3px] border-black bg-[#fff6cf] p-3">
                  <p className="text-xs font-black uppercase tracking-[0.2em] text-gray-500">
                    Total tips
                  </p>
                  <AmountDisplay
                    amount={creator.totalTipsReceived}
                    className="mt-2 block text-xl"
                  />
                </div>
                <div className="border-[3px] border-black bg-[#f5f5f5] p-3">
                  <p className="text-xs font-black uppercase tracking-[0.2em] text-gray-500">
                    Credit score
                  </p>
                  <p className="mt-2 text-2xl font-black">
                    {creator.creditScore}
                  </p>
                </div>
              </div>
            </Link>
          </motion.div>
        );
      })}
    </section>
  );
};

export default Podium;
