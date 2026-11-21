import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ErrorState from '../ErrorState';

vi.mock('@/i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('ErrorState', () => {
  it('shows support-safe technical details on demand without exposing raw errors in production', () => {
    vi.stubEnv('DEV', false);
    render(
      <MemoryRouter>
        <ErrorState
          error={new Error('internal stack detail')}
          errorData={{
            category: 'contract',
            message: 'Your balance is too low. Add funds and try again.',
            retryable: false,
            technicalDetails: 'Contract error code: #14',
          }}
        />
      </MemoryRouter>,
    );

    expect(screen.getByText('Your balance is too low. Add funds and try again.')).toBeInTheDocument();
    expect(screen.queryByText('Contract error code: #14')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /common\.errorDetails/i }));

    expect(screen.getByText('Contract error code: #14')).toBeInTheDocument();
    expect(screen.queryByText('internal stack detail')).not.toBeInTheDocument();
  });
});
