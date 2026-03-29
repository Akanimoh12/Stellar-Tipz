export const hasPositiveBalance = (balance?: string | null): boolean => {
  if (!balance) {
    return false;
  }

  try {
    return BigInt(balance) > 0n;
  } catch {
    return false;
  }
};
