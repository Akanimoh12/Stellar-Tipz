import React from "react";
import { Search, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import type { Profile } from "@/types";
import CreatorSearch from "./CreatorSearch";
import Modal from "../ui/Modal";

interface QuickSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const QuickSearchModal: React.FC<QuickSearchModalProps> = ({
  isOpen,
  onClose,
}) => {
  const navigate = useNavigate();

  const handleSelect = (profile: Profile) => {
    onClose();
    navigate(`/@${profile.username}`);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      ariaLabelledBy="quick-search-title"
      closeOnBackdropClick={true}
      className="items-start pt-[15vh]"
      customContent={true}
    >
      <div className="w-full max-w-lg border-[3px] border-black bg-white" style={{ boxShadow: "6px 6px 0px 0px rgba(0,0,0,1)" }}>
        {/* Header */}
        <div className="flex items-center justify-between border-b-[3px] border-black px-4 py-3">
          <div className="flex items-center gap-2">
            <Search size={16} className="text-gray-800 dark:text-gray-200" />
            <h2 id="quick-search-title" className="text-xs font-black uppercase tracking-[0.2em] text-gray-800 dark:text-gray-200">
              Quick search
            </h2>
          </div>
          <button
            onClick={onClose}
            className="inline-flex items-center justify-center border-2 border-black p-1 hover:bg-black hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black"
            aria-label="Close search"
          >
            <X size={14} />
          </button>
        </div>

        {/* Search input */}
        <div className="p-4">
          <CreatorSearch
            onSelect={handleSelect}
            placeholder="Search by username or Stellar address…"
          />
        </div>

        {/* Footer hint */}
        <div className="border-t-2 border-black px-4 py-2">
          <p className="text-xs font-medium text-gray-700 dark:text-gray-300">
            Press{" "}
            <kbd className="border border-gray-300 px-1 font-mono text-xs">
              Esc
            </kbd>{" "}
            to close
          </p>
        </div>
      </div>
    </Modal>
  );
};

export default QuickSearchModal;
