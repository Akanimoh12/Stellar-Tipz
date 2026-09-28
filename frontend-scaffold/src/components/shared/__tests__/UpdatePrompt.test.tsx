/**
 * #1312 — Tests for UpdatePrompt component.
 */

import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import UpdatePrompt from '../UpdatePrompt';
import { notifyUpdateAvailable, skipWaiting } from '@/services/serviceWorker';

vi.mock('@/services/serviceWorker', async () => {
  const actual = await vi.importActual<typeof import('@/services/serviceWorker')>('@/services/serviceWorker');
  return {
    ...actual,
    skipWaiting: vi.fn(),
  };
});

describe('UpdatePrompt Component (#1312)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders nothing when no update is available', () => {
    const { container } = render(<UpdatePrompt />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders normal update prompt when update is available', () => {
    render(<UpdatePrompt />);

    act(() => {
      notifyUpdateAvailable({ isCritical: false, version: '2.1.0' });
    });

    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.getByText(/update available/i)).toBeInTheDocument();

    const reloadBtn = screen.getByRole('button', { name: /reload now/i });
    expect(reloadBtn).toBeInTheDocument();

    fireEvent.click(reloadBtn);
    expect(skipWaiting).toHaveBeenCalledTimes(1);
  });

  it('renders critical update alert when critical version gate is triggered', () => {
    render(<UpdatePrompt />);

    act(() => {
      notifyUpdateAvailable({ isCritical: true, version: '3.0.0', minRequiredVersion: '3.0.0' });
    });

    expect(screen.getByText(/critical update required/i)).toBeInTheDocument();
    const reloadBtn = screen.getByRole('button', { name: /reload now/i });
    fireEvent.click(reloadBtn);
    expect(skipWaiting).toHaveBeenCalledTimes(1);
  });
});
