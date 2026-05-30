import React, { useMemo } from "react";
import { Link } from "react-router-dom";
import Badge from "../ui/Badge";
import { getTierFromScore } from "@/helpers/badge";
import Tooltip from "../ui/Tooltip";

interface CreditBadgeProps {
  score: number;
  showScore?: boolean;
  className?: string;
  clickable?: boolean;
}

const CreditBadge: React.FC<CreditBadgeProps> = ({
  score,
  showScore = true,
  className,
  clickable = false,
}) => {
  const tier = useMemo(() => getTierFromScore(score), [score]);
  const badge = useMemo(
    () => (
      <Badge
        tier={tier}
        score={showScore ? score : undefined}
        className={`${clickable ? "cursor-pointer" : ""} ${className ?? ""}`}
      />
    ),
    [className, clickable, score, showScore, tier],
  );

  return (
    <Tooltip content={`Credit Score: ${score}/100 • Tier: ${tier}`}>
      {clickable ? (
        <Link
          to="/docs/credit-score"
          className="inline-flex"
          aria-label="Learn about credit scores"
        >
          {badge}
        </Link>
      ) : (
        badge
      )}
    </Tooltip>
  );
};

export default React.memo(CreditBadge);
