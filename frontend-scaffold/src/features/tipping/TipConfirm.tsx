import React from "react";
import type { Profile } from "../../types";
import { TipConfirmationModal } from "./TipConfirmationModal";

interface TipConfirmProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  creator: Profile;
  amount: string;
  message: string;
  submitting?: boolean;
}

const TipConfirm: React.FC<TipConfirmProps> = (props) => (
  <TipConfirmationModal {...props} />
);

export default TipConfirm;
