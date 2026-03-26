import React from "react";
import { Link } from "react-router-dom";
import Badge, { getTierFromScore } from "../ui/Badge";
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
  const tier = getTierFromScore(score);
  const badge = (
    <Badge
      tier={tier}
      score={showScore ? score : undefined}
      className={`${clickable ? "cursor-pointer" : ""} ${className ?? ""}`}
    />
  );

  return (
    <Tooltip content={`Credit Score: ${score}/1000 • Tier: ${tier}`}>
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

export default CreditBadge;
