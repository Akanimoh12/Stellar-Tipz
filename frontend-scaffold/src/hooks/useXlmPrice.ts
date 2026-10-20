import { useState, useEffect, useCallback, useRef } from "react";

const XLM_PRICE_API = "https://api.coingecko.com/api/v3/simple/price?ids=stellar&vs_currencies=usd";
const PRICE_CACHE_MS = 5 * 60 * 1000;

let cachedPrice: number | null = null;
let cacheTimestamp = 0;

export const useXlmPrice = () => {
  const [price, setPrice] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const fetchPrice = useCallback(async () => {
    const isFresh = cachedPrice !== null && Date.now() - cacheTimestamp < PRICE_CACHE_MS;
    if (isFresh) {
      setPrice(cachedPrice);
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    try {
      const response = await fetch(XLM_PRICE_API, { signal: controller.signal });
      if (!response.ok) throw new Error("Failed to fetch XLM price");
      const data = await response.json();
      const usdPrice = typeof data?.stellar?.usd === "number" ? data.stellar.usd : null;

      if (usdPrice === null || !Number.isFinite(usdPrice)) {
        cachedPrice = null;
        cacheTimestamp = 0;
        setPrice(null);
        return;
      }

      cachedPrice = usdPrice;
      cacheTimestamp = Date.now();
      setPrice(usdPrice);
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        cachedPrice = null;
        cacheTimestamp = 0;
        setPrice(null);
      }
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    fetchPrice();
    return () => {
      abortRef.current?.abort();
    };
  }, [fetchPrice]);

  return { price, loading, refetch: fetchPrice };
};
