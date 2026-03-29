export type BadgeTier = 'bronze' | 'silver' | 'gold' | 'diamond';

/**
 * Maps a numeric credit score to a membership tier.
 * 
 * @param score - Credit score (0-1000)
 * @returns {BadgeTier} The determined tier
 */
export const getTierFromScore = (score: number | string): BadgeTier => {
  const numericScore = typeof score === 'string' ? parseFloat(score) : score;
  
  if (numericScore >= 901) return 'diamond';
  if (numericScore >= 701) return 'gold';
  if (numericScore >= 401) return 'silver';
  return 'bronze';
};
