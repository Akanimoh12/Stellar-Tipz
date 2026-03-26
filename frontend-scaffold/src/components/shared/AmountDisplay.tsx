import React from "react";
import BigNumber from "bignumber.js";
import { stroopToXlm } from "../../helpers/format";

interface AmountDisplayProps {
  amount: string;
  className?: string;
}

const AmountDisplay: React.FC<AmountDisplayProps> = ({
  amount,
  className = "",
}) => {
  const xlmAmount = stroopToXlm(new BigNumber(amount)).toFormat();

  return (
    <span className={`font-black tabular-nums ${className}`}>
      {xlmAmount} XLM
    </span>
  );
};

export default AmountDisplay;
