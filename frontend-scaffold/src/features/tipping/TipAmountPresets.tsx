import React, { useMemo, useRef, useState, useEffect } from "react";

import { useBalance } from "@/hooks/useBalance";
import { useWalletStore } from "@/store/walletStore";

const DEFAULT_PRESETS = [1, 5, 10, 25, 50, 100];
const LAST_AMOUNT_KEY = "tipz_last_amount";

interface TipAmountPresetsProps {
  value?: string;
  onChange?: (amount: number | string) => void;
  presets?: number[];
  balance?: number;
}

const TipAmountPresets: React.FC<TipAmountPresetsProps> = ({
  value,
  onChange,
  presets = DEFAULT_PRESETS,
  balance,
}) => {
  const { publicKey } = useWalletStore();
  const { balance: walletBalance } = useBalance(publicKey);
  const inputRef = useRef<HTMLInputElement>(null);

  const availableBalance = useMemo(() => {
    if (typeof balance === "number") return balance;
    return walletBalance ? Number(walletBalance) : undefined;
  }, [balance, walletBalance]);

  // Restore last used amount on first render if no external value supplied
  const [internalValue, setInternalValue] = useState<string>(() => {
    if (value !== undefined) return String(value);
    try {
      return localStorage.getItem(LAST_AMOUNT_KEY) ?? String(DEFAULT_PRESETS[1]);
    } catch {
      return String(DEFAULT_PRESETS[1]);
    }
  });

  const [isCustom, setIsCustom] = useState<boolean>(() => {
    const initial = value ?? internalValue;
    return !DEFAULT_PRESETS.map(String).includes(String(initial));
  });

  // Keep internalValue in sync when the parent drives the value prop
  useEffect(() => {
    if (value !== undefined) {
      setInternalValue(String(value));
      setIsCustom(!DEFAULT_PRESETS.map(String).includes(String(value)));
    }
  }, [value]);

  const currentValue = value !== undefined ? String(value) : internalValue;

  const handlePresetClick = (preset: number) => {
    setIsCustom(false);
    setInternalValue(String(preset));
    try {
      localStorage.setItem(LAST_AMOUNT_KEY, String(preset));
    } catch {
      // ignore storage errors
    }
    onChange?.(preset);
  };

  const handleCustomClick = () => {
    setIsCustom(true);
    // Clear value so user can type freely
    if (DEFAULT_PRESETS.map(String).includes(currentValue)) {
      setInternalValue("");
      onChange?.("");
    }
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const next = e.target.value;
    setInternalValue(next);
    try {
      if (next) localStorage.setItem(LAST_AMOUNT_KEY, next);
    } catch {
      // ignore
    }
    onChange?.(next);
  };

  return (
    <div className="space-y-2">
      <p className="text-xs font-black uppercase tracking-[0.2em] text-gray-800 dark:text-gray-200">
        Quick amount
      </p>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
        {presets.map((preset) => {
          const isSelected = !isCustom && Number(currentValue) === preset;
          const disabled =
            typeof availableBalance === "number" && preset > availableBalance;

          return (
            <button
              key={preset}
              type="button"
              aria-pressed={isSelected}
              disabled={disabled}
              onClick={() => handlePresetClick(preset)}
              className={`min-h-11 border-2 border-black px-2 text-sm font-black uppercase transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2 ${
                isSelected ? "bg-black text-white selected" : "bg-white text-black"
              } ${
                disabled
                  ? "cursor-not-allowed opacity-40"
                  : "hover:-translate-x-0.5 hover:-translate-y-0.5"
              }`}
            >
              {preset} XLM
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-pressed={isCustom}
          onClick={handleCustomClick}
          className={`min-h-11 border-2 border-black px-3 text-sm font-black uppercase transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2 ${
            isCustom ? "bg-black text-white selected" : "bg-white text-black hover:-translate-x-0.5 hover:-translate-y-0.5"
          }`}
        >
          Custom
        </button>

        <input
          ref={inputRef}
          type="text"
          inputMode="decimal"
          aria-label="Tip amount"
          placeholder="0.0"
          value={isCustom ? (currentValue === "" || !DEFAULT_PRESETS.map(String).includes(currentValue) ? currentValue : "") : currentValue}
          readOnly={!isCustom}
          onChange={handleInputChange}
          onFocus={() => {
            if (!isCustom) handleCustomClick();
          }}
          className={`min-h-11 flex-1 border-2 border-black bg-white px-3 text-sm font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black ${
            isCustom ? "focus:outline-none" : "cursor-pointer text-gray-700"
          }`}
        />
      </div>
    </div>
  );
};

export default TipAmountPresets;
