import React from "react";
import Textarea from "../../components/ui/Textarea";

interface TipMessageInputProps {
  message: string;
  onChange: (message: string) => void;
  maxLength?: number;
  disabled?: boolean;
}

const TipMessageInput: React.FC<TipMessageInputProps> = ({
  message,
  onChange,
  // Keep this default aligned with contracts/tipz/src/types.rs::MAX_MESSAGE_LENGTH.
  maxLength = 280,
  disabled = false,
}) => {
  const handleChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = event.target.value;
    if (newValue.length <= maxLength) {
      onChange(newValue);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-xs font-black uppercase tracking-[0.2em] text-gray-600">
          Message (Optional)
        </label>
        <span className={`text-[10px] font-bold ${message.length >= maxLength ? 'text-red-600' : 'text-gray-700 dark:text-gray-300'}`}>
          {message.length}/{maxLength}
        </span>
      </div>
      <Textarea
        placeholder="Say why you are supporting this creator..."
        value={message}
        onChange={handleChange}
        maxLength={maxLength}
        disabled={disabled}
        rows={3}
        className="resize-none"
      />
    </div>
  );
};

export default TipMessageInput;
