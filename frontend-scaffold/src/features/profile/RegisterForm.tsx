import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Input from '@/components/ui/Input';
import Textarea from '@/components/ui/Textarea';
import Button from '@/components/ui/Button';
import TransactionStatus from '@/components/shared/TransactionStatus';
import {
  validateBio,
  validateDisplayName,
  validateUsername,
} from '@/helpers/validation';
import { useContract, useUsernameCheck } from '@/hooks';
import { useToastStore } from '@/store/toastStore';
import { ProfileFormData } from '@/types/profile';
import { categorizeError, ERRORS } from '@/helpers/error';

type TxStatus = 'idle' | 'signing' | 'submitting' | 'confirming' | 'success' | 'error';

interface FormErrors {
  username?: string;
  displayName?: string;
  bio?: string;
  imageUrl?: string;
  xHandle?: string;
}

function validate(data: ProfileFormData, available: boolean | null, checking: boolean): FormErrors {
  const errors: FormErrors = {};

  const usernameValidation = validateUsername(data.username);
  if (!usernameValidation.valid) {
    errors.username = usernameValidation.error;
  } else if (!checking && available === false) {
    errors.username = 'Username is already taken';
  } else if (checking) {
    errors.username = 'Please wait for username availability check';
  }

  const displayNameValidation = validateDisplayName(data.displayName);
  if (!displayNameValidation.valid) {
    errors.displayName = displayNameValidation.error;
  }

  const bioValidation = validateBio(data.bio);
  if (!bioValidation.valid) {
    errors.bio = bioValidation.error;
  }

  return errors;
}

const RegisterForm: React.FC = () => {
  const [form, setForm] = useState<ProfileFormData>({
    username: '',
    displayName: '',
    bio: '',
    imageUrl: '',
    xHandle: '',
  });
  const [errors, setErrors] = useState<FormErrors>({});
  const [txStatus, setTxStatus] = useState<TxStatus>('idle');
  const [txHash, setTxHash] = useState<string | undefined>(undefined);
  const [txError, setTxError] = useState<string | undefined>(undefined);

  const { registerProfile } = useContract();
  const { addToast } = useToastStore();
  const navigate = useNavigate();
  
  // Username availability check
  const { available, checking, error: availabilityError } = useUsernameCheck(form.username);

  const handleChange =
    (field: keyof ProfileFormData) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setForm((prev) => ({ ...prev, [field]: e.target.value }));
      if (errors[field]) {
        setErrors((prev) => ({ ...prev, [field]: undefined }));
      }
    };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const validationErrors = validate(form, available, checking);
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    try {
      setTxStatus('signing');
      setTxError(undefined);
      setTxHash(undefined);

      const formData: ProfileFormData = {
        ...form,
        username: form.username.trim().toLowerCase(),
        displayName: form.displayName.trim(),
        bio: form.bio.trim(),
        imageUrl: form.imageUrl.trim(),
        xHandle: form.xHandle.trim().replace(/^@/, ''),
      };

      setTxStatus('submitting');
      const hash = await registerProfile(formData);

      setTxStatus('confirming');
      setTxHash(hash);

      setTxStatus('success');
      addToast({ message: 'Profile registered successfully!', type: 'success', duration: 5000 });

      setTimeout(() => navigate('/profile'), 1500);
    } catch (err) {
      const category = categorizeError(err);
      setTxStatus('error');
      setTxError(category === 'network' ? ERRORS.NETWORK : ERRORS.CONTRACT);
    }
  };

  const isSubmitting = ['signing', 'submitting', 'confirming'].includes(txStatus);

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-lg mx-auto">
      {/* Username */}
      <div>
        <div className="relative">
          <Input
            label="Username"
            placeholder="your_handle"
            value={form.username}
            onChange={handleChange('username')}
            error={errors.username}
            disabled={isSubmitting}
            maxLength={32}
            required
          />
          {/* Availability indicator */}
          {form.username && !errors.username && (
            <div className="absolute right-3 top-9 flex items-center">
              {checking && (
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-gray-300 border-t-blue-600"></div>
              )}
              {!checking && available === true && (
                <div className="text-green-500">
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                </div>
              )}
              {!checking && available === false && (
                <div className="text-red-500">
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                </div>
              )}
            </div>
          )}
        </div>
        <p className="mt-1 text-xs text-gray-500">
          Your profile will be at tipz.app/@{form.username || 'username'}
        </p>
        {/* Availability status */}
        {form.username && !errors.username && (
          <div className="mt-1">
            {checking && (
              <p className="text-xs text-gray-500">Checking availability...</p>
            )}
            {!checking && available === true && (
              <p className="text-xs text-green-600">Username is available!</p>
            )}
            {!checking && available === false && (
              <p className="text-xs text-red-600">Username is taken</p>
            )}
            {availabilityError && (
              <p className="text-xs text-yellow-600">{availabilityError}</p>
            )}
          </div>
        )}
      </div>

      {/* Display Name */}
      <Input
        label="Display Name"
        placeholder="Your Name"
        value={form.displayName}
        onChange={handleChange('displayName')}
        error={errors.displayName}
        disabled={isSubmitting}
        maxLength={64}
        required
      />

      {/* Bio */}
      <Textarea
        label="Bio"
        placeholder="Tell supporters about yourself…"
        value={form.bio}
        onChange={handleChange('bio')}
        error={errors.bio}
        disabled={isSubmitting}
        maxLength={280}
        rows={4}
      />

      {/* X Handle */}
      <Input
        label="X (Twitter) Handle (optional)"
        placeholder="@yourhandle"
        value={form.xHandle}
        onChange={handleChange('xHandle')}
        error={errors.xHandle}
        disabled={isSubmitting}
      />

      {/* Image URL */}
      <Input
        label="Profile Image URL (optional)"
        placeholder="https://example.com/avatar.png"
        type="url"
        value={form.imageUrl}
        onChange={handleChange('imageUrl')}
        error={errors.imageUrl}
        disabled={isSubmitting}
      />

      {/* Transaction status */}
      {txStatus !== 'idle' && (
        <TransactionStatus
          status={txStatus}
          txHash={txHash}
          errorMessage={txError}
          onRetry={() => setTxStatus('idle')}
        />
      )}

      <Button
        type="submit"
        variant="primary"
        size="lg"
        disabled={isSubmitting || txStatus === 'success' || checking || available === false}
        className="w-full"
      >
        {isSubmitting ? 'Registering…' : 'Register Profile'}
      </Button>
    </form>
  );
};

export default RegisterForm;
