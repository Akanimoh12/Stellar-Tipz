import React, { useMemo } from "react";
import BigNumber from "bignumber.js";
import { formatXlmDisplay, stroopToXlmBigNumber } from "../../helpers/format";

interface AmountDisplayProps {
  amount: string;
  className?: string;
}

const AmountDisplay: React.FC<AmountDisplayProps> = ({
  amount,
  className = "",
}) => {
  const xlmAmount = useMemo(
    () => formatXlmDisplay(stroopToXlmBigNumber(new BigNumber(amount))),
    [amount],
  );

  return (
    <span className={`font-black tabular-nums ${className}`}>
      {xlmAmount} XLM
    </span>
  );
};

export default React.memo(AmountDisplay);
