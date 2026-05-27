import React, { useState } from 'react';
import { Calendar, Clock, X, AlertCircle } from 'lucide-react';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';

interface ScheduleTipProps {
  creatorUsername: string;
  creatorAddress: string;
  onSchedule: (deliverAt: number, message: string) => Promise<void>;
  onCancel: () => void;
  isLoading?: boolean;
}

/**
 * ScheduleTip component for scheduling tips for future delivery.
 * Allows users to set a delivery date/time for their tip.
 */
const ScheduleTip: React.FC<ScheduleTipProps> = ({
  creatorUsername,
  creatorAddress,
  onSchedule,
  onCancel,
  isLoading = false
}) => {
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedTime, setSelectedTime] = useState('12:00');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  // Get minimum date (tomorrow)
  const getMinDate = () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow.toISOString().split('T')[0];
  };

  // Get maximum date (1 year from now)
  const getMaxDate = () => {
    const maxDate = new Date();
    maxDate.setFullYear(maxDate.getFullYear() + 1);
    return maxDate.toISOString().split('T')[0];
  };

  // Calculate timestamp from date and time
  const calculateTimestamp = (): number => {
    if (!selectedDate || !selectedTime) return 0;
    const dateTimeString = `${selectedDate}T${selectedTime}:00`;
    return Math.floor(new Date(dateTimeString).getTime() / 1000);
  };

  // Format timestamp for display
  const formatTimestamp = (timestamp: number): string => {
    return new Date(timestamp * 1000).toLocaleString(undefined, {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const handleSubmit = async () => {
    setError('');

    if (!selectedDate) {
      setError('Please select a delivery date');
      return;
    }

    if (!selectedTime) {
      setError('Please select a delivery time');
      return;
    }

    const timestamp = calculateTimestamp();
    const now = Math.floor(Date.now() / 1000);

    if (timestamp <= now) {
      setError('Delivery time must be in the future');
      return;
    }

    if (message.length > 280) {
      setError('Message must be 280 characters or less');
      return;
    }

    try {
      await onSchedule(timestamp, message);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to schedule tip');
    }
  };

  const scheduledTimestamp = calculateTimestamp();

  return (
    <Card className="border-4 shadow-brutalist" padding="lg">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Calendar className="text-amber-500" size={24} />
            <h2 className="text-xl font-black uppercase tracking-tight">
              Schedule Tip
            </h2>
          </div>
          <button
            onClick={onCancel}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            aria-label="Cancel"
          >
            <X size={20} />
          </button>
        </div>

        {/* Recipient Info */}
        <div className="bg-gray-50 border-2 border-black p-4">
          <p className="text-sm font-bold text-gray-600 uppercase tracking-wide">
            Sending to
          </p>
          <p className="text-lg font-black">@{creatorUsername}</p>
        </div>

        {/* Date Selection */}
        <div className="space-y-2">
          <label className="text-sm font-black uppercase tracking-wide flex items-center gap-2">
            <Calendar size={16} />
            Delivery Date
          </label>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => {
              setSelectedDate(e.target.value);
              setError('');
            }}
            min={getMinDate()}
            max={getMaxDate()}
            className="w-full px-4 py-3 border-2 border-black font-bold focus:outline-none focus:ring-2 focus:ring-black"
          />
        </div>

        {/* Time Selection */}
        <div className="space-y-2">
          <label className="text-sm font-black uppercase tracking-wide flex items-center gap-2">
            <Clock size={16} />
            Delivery Time
          </label>
          <input
            type="time"
            value={selectedTime}
            onChange={(e) => {
              setSelectedTime(e.target.value);
              setError('');
            }}
            className="w-full px-4 py-3 border-2 border-black font-bold focus:outline-none focus:ring-2 focus:ring-black"
          />
        </div>

        {/* Message */}
        <div className="space-y-2">
          <label className="text-sm font-black uppercase tracking-wide">
            Message (Optional)
          </label>
          <textarea
            value={message}
            onChange={(e) => {
              setMessage(e.target.value);
              setError('');
            }}
            placeholder="Add a message for the recipient..."
            maxLength={280}
            rows={3}
            className="w-full px-4 py-3 border-2 border-black font-bold resize-none focus:outline-none focus:ring-2 focus:ring-black"
          />
          <p className="text-xs font-bold text-gray-500 text-right">
            {message.length}/280 characters
          </p>
        </div>

        {/* Scheduled Time Preview */}
        {scheduledTimestamp > 0 && (
          <div className="bg-amber-50 border-2 border-amber-200 p-4">
            <p className="text-sm font-bold text-amber-800 uppercase tracking-wide">
              Scheduled for:
            </p>
            <p className="text-lg font-black text-amber-900">
              {formatTimestamp(scheduledTimestamp)}
            </p>
          </div>
        )}

        {/* Info Box */}
        <div className="bg-blue-50 border-2 border-blue-200 p-4 flex gap-3">
          <AlertCircle className="text-blue-500 flex-shrink-0" size={20} />
          <div className="space-y-1">
            <p className="text-sm font-bold text-blue-800">
              How scheduled tips work:
            </p>
            <ul className="text-xs font-bold text-blue-700 space-y-1 list-disc list-inside">
              <li>Funds are locked in the contract until delivery</li>
              <li>You can cancel before delivery (1% cancellation fee)</li>
              <li>Tip will be delivered automatically at the scheduled time</li>
              <li>Recipient will be notified when tip is delivered</li>
            </ul>
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="bg-red-50 border-2 border-red-200 p-4">
            <p className="text-sm font-bold text-red-700">{error}</p>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-4">
          <Button
            onClick={onCancel}
            variant="outline"
            className="flex-1"
            disabled={isLoading}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            variant="primary"
            className="flex-1"
            disabled={isLoading || !selectedDate || !selectedTime}
          >
            {isLoading ? 'Scheduling...' : 'Schedule Tip'}
          </Button>
        </div>
      </div>
    </Card>
  );
};

export default ScheduleTip;