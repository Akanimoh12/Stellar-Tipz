import React from "react";
import { Keyboard } from "lucide-react";
import Modal from "@/components/ui/Modal";
import { getModifierKey } from "@/hooks/useKeyboardShortcuts";

interface ShortcutRowProps {
  keys: string[];
  description: string;
  joiner?: "plus" | "then";
}

const ShortcutRow: React.FC<ShortcutRowProps> = ({
  keys,
  description,
  joiner = "plus",
}) => (
  <div className="flex items-center justify-between gap-4 border-b-2 border-black py-3 last:border-b-0">
    <span className="text-sm font-medium text-gray-700">{description}</span>
    <div className="flex shrink-0 items-center gap-1">
      {keys.map((k, i) => (
        <React.Fragment key={k}>
          {i > 0 && (
            <span className="text-xs font-bold text-gray-700 dark:text-gray-300">
              {joiner === "then" ? "then" : "+"}
            </span>
          )}
          <kbd className="inline-flex items-center justify-center border-2 border-black bg-white px-2 py-0.5 font-mono text-xs font-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
            {k}
          </kbd>
        </React.Fragment>
      ))}
    </div>
  </div>
);

interface ShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const ShortcutsModal: React.FC<ShortcutsModalProps> = ({ isOpen, onClose }) => {
  const mod = getModifierKey();

  const sections: { heading: string; shortcuts: ShortcutRowProps[] }[] = [
    {
      heading: "Navigation",
      shortcuts: [
        { keys: [mod, "K"], description: "Quick search creators" },
        { keys: ["G", "H"], joiner: "then", description: "Go to Home" },
        { keys: ["G", "L"], joiner: "then", description: "Go to Leaderboard" },
        { keys: ["G", "D"], joiner: "then", description: "Go to Dashboard" },
      ],
    },
    {
      heading: "Tip page",
      shortcuts: [{ keys: ["T"], description: "Open tip form" }],
    },
    {
      heading: "General",
      shortcuts: [
        { keys: [mod, "/"], description: "Show this shortcuts help" },
        { keys: ["Esc"], description: "Close any open modal" },
      ],
    },
  ];

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Keyboard shortcuts">
      <div className="space-y-6">
        {sections.map((section) => (
          <div key={section.heading}>
            <p className="mb-2 text-xs font-black uppercase tracking-[0.2em] text-gray-800 dark:text-gray-200">
              {section.heading}
            </p>
            <div className="border-2 border-black bg-white px-4">
              {section.shortcuts.map((s) => (
                <ShortcutRow
                  key={s.description}
                  keys={s.keys}
                  joiner={s.joiner}
                  description={s.description}
                />
              ))}
            </div>
          </div>
        ))}

        <p className="flex items-center gap-2 text-xs font-medium text-gray-800 dark:text-gray-200">
          <Keyboard size={13} />
          Shortcuts are disabled while typing in input fields.
        </p>
      </div>
    </Modal>
  );
};

export default ShortcutsModal;
