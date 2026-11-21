import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { axe, toHaveNoViolations } from 'jest-axe';
import FeatureGate from '../FeatureGate';
import { useFeatureFlag } from '@/hooks/useFeatureFlag';

expect.extend(toHaveNoViolations);

vi.mock('@/hooks/useFeatureFlag');
const mockUseFeatureFlag = vi.mocked(useFeatureFlag);

describe('FeatureGate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('enabled feature state', () => {
    it('renders children when the feature flag is enabled', () => {
      mockUseFeatureFlag.mockReturnValue(true);

      render(
        <FeatureGate flag="new-feature">
          <div>Protected Content</div>
        </FeatureGate>,
      );

      expect(screen.getByText('Protected Content')).toBeInTheDocument();
      expect(mockUseFeatureFlag).toHaveBeenCalledWith('new-feature', false);
    });

    it('does not render fallback content when flag is enabled', () => {
      mockUseFeatureFlag.mockReturnValue(true);

      render(
        <FeatureGate
          flag="new-feature"
          fallback={<div>Fallback Content</div>}
        >
          <div>Protected Content</div>
        </FeatureGate>,
      );

      expect(screen.getByText('Protected Content')).toBeInTheDocument();
      expect(screen.queryByText('Fallback Content')).not.toBeInTheDocument();
    });

    it('renders interactive children and supports user interactions', async () => {
      mockUseFeatureFlag.mockReturnValue(true);
      const handleClick = vi.fn();
      const user = userEvent.setup();

      render(
        <FeatureGate flag="interactive-feature">
          <button type="button" onClick={handleClick}>
            Click Protected Action
          </button>
        </FeatureGate>,
      );

      const button = screen.getByRole('button', {
        name: /click protected action/i,
      });
      expect(button).toBeInTheDocument();
      await user.click(button);
      expect(handleClick).toHaveBeenCalledTimes(1);
    });
  });

  describe('disabled feature state', () => {
    it('renders null / nothing when flag is disabled and no fallback is provided', () => {
      mockUseFeatureFlag.mockReturnValue(false);

      const { container } = render(
        <FeatureGate flag="disabled-feature">
          <div>Protected Content</div>
        </FeatureGate>,
      );

      expect(container.firstChild).toBeNull();
      expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
    });

    it('renders fallback content when flag is disabled and fallback is provided', () => {
      mockUseFeatureFlag.mockReturnValue(false);

      render(
        <FeatureGate
          flag="disabled-feature"
          fallback={<div>Alternative Content</div>}
        >
          <div>Protected Content</div>
        </FeatureGate>,
      );

      expect(screen.getByText('Alternative Content')).toBeInTheDocument();
      expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
    });

    it('renders interactive fallback elements and supports user interactions', async () => {
      mockUseFeatureFlag.mockReturnValue(false);
      const handleFallbackClick = vi.fn();
      const user = userEvent.setup();

      render(
        <FeatureGate
          flag="disabled-feature"
          fallback={
            <button type="button" onClick={handleFallbackClick}>
              Request Access
            </button>
          }
        >
          <div>Protected Content</div>
        </FeatureGate>,
      );

      const button = screen.getByRole('button', { name: /request access/i });
      expect(button).toBeInTheDocument();
      await user.click(button);
      expect(handleFallbackClick).toHaveBeenCalledTimes(1);
    });
  });

  describe('defaultValue handling', () => {
    it('passes default false when defaultValue is not specified', () => {
      mockUseFeatureFlag.mockReturnValue(false);

      render(
        <FeatureGate flag="default-flag">
          <div>Content</div>
        </FeatureGate>,
      );

      expect(mockUseFeatureFlag).toHaveBeenCalledWith('default-flag', false);
    });

    it('passes custom defaultValue when specified', () => {
      mockUseFeatureFlag.mockReturnValue(true);

      render(
        <FeatureGate flag="default-true-flag" defaultValue={true}>
          <div>Default Enabled Content</div>
        </FeatureGate>,
      );

      expect(mockUseFeatureFlag).toHaveBeenCalledWith('default-true-flag', true);
      expect(screen.getByText('Default Enabled Content')).toBeInTheDocument();
    });
  });

  describe('dynamic flag updates', () => {
    it('switches between children and fallback when flag value changes', () => {
      mockUseFeatureFlag.mockReturnValue(false);

      const { rerender } = render(
        <FeatureGate
          flag="dynamic-flag"
          fallback={<div>Feature Disabled</div>}
        >
          <div>Feature Enabled</div>
        </FeatureGate>,
      );

      expect(screen.getByText('Feature Disabled')).toBeInTheDocument();
      expect(screen.queryByText('Feature Enabled')).not.toBeInTheDocument();

      // Simulate flag being enabled
      mockUseFeatureFlag.mockReturnValue(true);
      rerender(
        <FeatureGate
          flag="dynamic-flag"
          fallback={<div>Feature Disabled</div>}
        >
          <div>Feature Enabled</div>
        </FeatureGate>,
      );

      expect(screen.getByText('Feature Enabled')).toBeInTheDocument();
      expect(screen.queryByText('Feature Disabled')).not.toBeInTheDocument();
    });
  });

  describe('accessibility attributes', () => {
    it('has no accessibility violations when feature is enabled', async () => {
      mockUseFeatureFlag.mockReturnValue(true);

      const { container } = render(
        <FeatureGate flag="a11y-feature">
          <main>
            <h1>Feature Title</h1>
            <p>Feature Description</p>
          </main>
        </FeatureGate>,
      );

      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('has no accessibility violations when feature is disabled with fallback', async () => {
      mockUseFeatureFlag.mockReturnValue(false);

      const { container } = render(
        <FeatureGate
          flag="a11y-feature"
          fallback={
            <div role="status">
              <p>This feature is currently unavailable.</p>
            </div>
          }
        >
          <div>Feature Content</div>
        </FeatureGate>,
      );

      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });
  });
});
