import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { axe, toHaveNoViolations } from 'jest-axe';
import CreatorSearch from '../CreatorSearch';
import type { Profile } from '@/types';

expect.extend(toHaveNoViolations);

const mockGetProfile = vi.fn();
const mockGetProfileByUsername = vi.fn();

vi.mock('@/hooks/useContract', () => ({
  useContract: () => ({
    getProfile: mockGetProfile,
    getProfileByUsername: mockGetProfileByUsername,
  }),
}));

const mockProfile: Profile = {
  owner: 'GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFDAGORAC12345678901234',
  username: 'stellar_creator',
  displayName: 'Stellar Creator',
  bio: 'Creator bio',
  imageUrl: 'https://example.com/avatar.png',
  xHandle: 'creator',
  xFollowers: 100,
  xEngagementAvg: 5,
  creditScore: 750,
  totalTipsReceived: '10000000',
  totalTipsCount: 15,
  balance: '5000000',
  registeredAt: 1600000000,
  updatedAt: 1600000000,
};

describe('CreatorSearch', () => {
  const onSelect = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const advanceDebounceAndFlush = async (ms = 300) => {
    act(() => {
      vi.advanceTimersByTime(ms);
    });
    await act(async () => {
      await Promise.resolve();
    });
  };

  describe('rendering', () => {
    it('renders input with default placeholder and search icon', () => {
      render(<CreatorSearch onSelect={onSelect} />);

      const input = screen.getByPlaceholderText(
        'Search by username or Stellar address...',
      );
      expect(input).toBeInTheDocument();
      expect(input).toHaveValue('');
    });

    it('renders input with custom placeholder', () => {
      render(
        <CreatorSearch
          onSelect={onSelect}
          placeholder="Custom search placeholder..."
        />,
      );

      expect(
        screen.getByPlaceholderText('Custom search placeholder...'),
      ).toBeInTheDocument();
    });

    it('does not display dropdown initially', () => {
      render(<CreatorSearch onSelect={onSelect} />);

      expect(screen.queryByText('Searching...')).not.toBeInTheDocument();
      expect(screen.queryByText('No results found')).not.toBeInTheDocument();
    });
  });

  describe('search interactions and behavior', () => {
    it('debounces search by 300ms before calling getProfileByUsername', async () => {
      mockGetProfileByUsername.mockResolvedValue(mockProfile);
      render(<CreatorSearch onSelect={onSelect} />);

      const input = screen.getByRole('textbox');
      fireEvent.change(input, { target: { value: 'stellar_creator' } });

      // Before 300ms, no search should be executed
      expect(mockGetProfileByUsername).not.toHaveBeenCalled();

      // Advance by 300ms and resolve promises
      await advanceDebounceAndFlush(300);

      expect(mockGetProfileByUsername).toHaveBeenCalledTimes(1);
      expect(mockGetProfileByUsername).toHaveBeenCalledWith('stellar_creator');
      expect(screen.getByText('Stellar Creator')).toBeInTheDocument();
      expect(screen.getByText(/@stellar_creator/)).toBeInTheDocument();
    });

    it('searches by Stellar address when query is a 56-char string starting with G', async () => {
      const stellarAddress =
        'GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFDAGORAC12345678901234';
      mockGetProfile.mockResolvedValue(mockProfile);
      render(<CreatorSearch onSelect={onSelect} />);

      const input = screen.getByRole('textbox');
      fireEvent.change(input, { target: { value: stellarAddress } });

      await advanceDebounceAndFlush(300);

      expect(mockGetProfile).toHaveBeenCalledTimes(1);
      expect(mockGetProfile).toHaveBeenCalledWith(stellarAddress);
      expect(mockGetProfileByUsername).not.toHaveBeenCalled();
      expect(screen.getByText('Stellar Creator')).toBeInTheDocument();
    });

    it('displays loading indicator while searching', async () => {
      let resolveSearch: (val: Profile) => void;
      mockGetProfileByUsername.mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveSearch = resolve;
          }),
      );

      render(<CreatorSearch onSelect={onSelect} />);

      const input = screen.getByRole('textbox');
      fireEvent.change(input, { target: { value: 'stellar' } });

      act(() => {
        vi.advanceTimersByTime(300);
      });

      expect(screen.getByText('Searching...')).toBeInTheDocument();

      await act(async () => {
        resolveSearch!(mockProfile);
      });

      expect(screen.queryByText('Searching...')).not.toBeInTheDocument();
      expect(screen.getByText('Stellar Creator')).toBeInTheDocument();
    });

    it('displays "No results found" when profile lookup returns null or fails', async () => {
      mockGetProfileByUsername.mockRejectedValue(new Error('User not found'));
      render(<CreatorSearch onSelect={onSelect} />);

      const input = screen.getByRole('textbox');
      fireEvent.change(input, { target: { value: 'nonexistent' } });

      await advanceDebounceAndFlush(300);

      expect(screen.getByText('No results found')).toBeInTheDocument();
    });

    it('renders profile username as fallback when displayName is empty', async () => {
      const profileNoDisplayName: Profile = {
        ...mockProfile,
        displayName: '',
        username: 'anonymous_creator',
      };
      mockGetProfileByUsername.mockResolvedValue(profileNoDisplayName);

      render(<CreatorSearch onSelect={onSelect} />);

      const input = screen.getByRole('textbox');
      fireEvent.change(input, { target: { value: 'anonymous_creator' } });

      await advanceDebounceAndFlush(300);

      expect(
        screen.getAllByText('anonymous_creator').length,
      ).toBeGreaterThanOrEqual(1);
    });

    it('calls onSelect and resets query and dropdown when clicking a result', async () => {
      mockGetProfileByUsername.mockResolvedValue(mockProfile);
      render(<CreatorSearch onSelect={onSelect} />);

      const input = screen.getByRole('textbox');
      fireEvent.change(input, { target: { value: 'stellar_creator' } });

      await advanceDebounceAndFlush(300);

      const resultButton = screen.getByRole('button', {
        name: /stellar creator/i,
      });
      fireEvent.click(resultButton);

      expect(onSelect).toHaveBeenCalledTimes(1);
      expect(onSelect).toHaveBeenCalledWith(mockProfile);

      // Input should be cleared and dropdown closed
      expect(input).toHaveValue('');
      expect(screen.queryByText('Stellar Creator')).not.toBeInTheDocument();
    });

    it('clears results and closes dropdown when input is cleared or whitespace', async () => {
      mockGetProfileByUsername.mockResolvedValue(mockProfile);
      render(<CreatorSearch onSelect={onSelect} />);

      const input = screen.getByRole('textbox');
      fireEvent.change(input, { target: { value: 'stellar' } });
      await advanceDebounceAndFlush(300);

      expect(screen.getByText('Stellar Creator')).toBeInTheDocument();

      // Clear input
      fireEvent.change(input, { target: { value: '' } });

      expect(screen.queryByText('Stellar Creator')).not.toBeInTheDocument();
      expect(mockGetProfileByUsername).toHaveBeenCalledTimes(1); // not called again
    });

    it('closes dropdown when clicking outside', async () => {
      mockGetProfileByUsername.mockResolvedValue(mockProfile);
      render(
        <div>
          <CreatorSearch onSelect={onSelect} />
          <div data-testid="outside">Outside area</div>
        </div>,
      );

      const input = screen.getByRole('textbox');
      fireEvent.change(input, { target: { value: 'stellar' } });
      await advanceDebounceAndFlush(300);

      expect(screen.getByText('Stellar Creator')).toBeInTheDocument();

      fireEvent.mouseDown(screen.getByTestId('outside'));

      expect(screen.queryByText('Stellar Creator')).not.toBeInTheDocument();
    });

    it('re-opens dropdown on focus if query is not empty', async () => {
      mockGetProfileByUsername.mockResolvedValue(mockProfile);
      render(
        <div>
          <CreatorSearch onSelect={onSelect} />
          <div data-testid="outside">Outside</div>
        </div>,
      );

      const input = screen.getByRole('textbox');
      fireEvent.change(input, { target: { value: 'stellar' } });
      await advanceDebounceAndFlush(300);

      expect(screen.getByText('Stellar Creator')).toBeInTheDocument();

      // Click outside to close
      fireEvent.mouseDown(screen.getByTestId('outside'));
      expect(screen.queryByText('Stellar Creator')).not.toBeInTheDocument();

      // Focus input again
      fireEvent.focus(input);
      expect(screen.getByText('Stellar Creator')).toBeInTheDocument();
    });
  });

  describe('accessibility', () => {
    it('has accessible input and search results', async () => {
      mockGetProfileByUsername.mockResolvedValue(mockProfile);
      const { container } = render(<CreatorSearch onSelect={onSelect} />);

      const input = screen.getByRole('textbox');
      fireEvent.change(input, { target: { value: 'stellar' } });
      await advanceDebounceAndFlush(300);

      const resultButton = screen.getByRole('button', {
        name: /stellar creator/i,
      });
      expect(resultButton).toBeInTheDocument();

      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });
  });
});
