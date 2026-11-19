import { logger } from "../services/logger";
import { useAdminContract } from "./contract/admin";
import { useContractCore } from "./contract/core";
import { useProfileContract } from "./contract/profile";
import { useSubscriptionsContract } from "./contract/subscriptions";
import { useTipsContract } from "./contract/tips";

/**
 * Hook providing typed methods for all Tipz contract operations.
 *
 * The implementation is split by domain under `hooks/contract/`:
 * - `profile.ts`       — profile reads/writes, domains, credit tier
 * - `tips.ts`          — tip reads/writes, min-tip config, streaks
 * - `subscriptions.ts` — create/cancel/execute/read subscriptions
 * - `admin.ts`         — platform stats and leaderboard
 *
 * Every slice shares a single `loading` flag through `useContractCore`,
 * so the public API of this hook is unchanged.
 */
export const useContract = () => {
  const core = useContractCore();

  const profile = useProfileContract(core);
  const tips = useTipsContract(core);
  const subscriptions = useSubscriptionsContract(core);
  const admin = useAdminContract(core);

  // Warn once in development when contract ID is not configured
  if (!core.contractId) {
    logger.warn(
      "[hooks/useContract]",
      "VITE_CONTRACT_ID is not set — contract calls will be skipped.",
    );
  }

  return {
    loading: core.loading,
    ...profile,
    ...tips,
    ...subscriptions,
    ...admin,
  };
};
