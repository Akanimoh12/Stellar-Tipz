export type BadgeTier = 'new' | 'bronze' | 'silver' | 'gold' | 'diamond';

/**
 * Maps a numeric credit score to a membership tier based on the Stellar Tipz credit system.
 *
 * Tiers:
 * - New: 0-400 points (Entry Level)
 * - Bronze: 401-700 points (Established)
 * - Silver: 701-900 points (Growing presence)
 * - Gold: 901-1000 points (Strong community)
 * - Diamond: 1000+ points (Elite)
 *
 * @param score - Credit score (0-1000+ based on X metrics)
 * @returns {BadgeTier} The determined tier
 */
export const getTierFromScore = (score: number | string): BadgeTier => {
  const numericScore = typeof score === 'string' ? parseFloat(score) : score;

  if (numericScore >= 901) return 'diamond';
  if (numericScore >= 701) return 'gold';
  if (numericScore >= 401) return 'silver';
  if (numericScore >= 1) return 'bronze';
  return 'new';
};

/**
 * Get tier color configuration for consistent styling
 */
export const getTierColors = (tier: BadgeTier) => {
  const colors = {
    new: { bg: '#9ca3af', text: '#ffffff' },      // Gray
    bronze: { bg: '#cd7f32', text: '#ffffff' },   // Bronze
    silver: { bg: '#c0c0c0', text: '#000000' },   // Silver
    gold: { bg: '#ffd700', text: '#000000' },     // Gold
    diamond: { bg: '#b9f2ff', text: '#000000' },  // Diamond/Blue
  };

  return colors[tier];
};