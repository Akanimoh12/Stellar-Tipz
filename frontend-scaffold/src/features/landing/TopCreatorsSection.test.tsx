import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BrowserRouter } from 'react-router-dom';
import TopCreatorsSection from './TopCreatorsSection';
import * as hooks from '@/hooks';

// Mock the hooks
vi.mock('@/hooks', () => ({
    useContract: vi.fn(),
}));

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
    const actual = await vi.importActual('react-router-dom');
    return {
        ...actual,
        useNavigate: () => mockNavigate,
    };
});

const mockLeaderboardData = [
    { address: 'G1', username: 'user1', totalTipsReceived: '100', creditScore: 500 },
    { address: 'G2', username: 'user2', totalTipsReceived: '200', creditScore: 600 },
    { address: 'G3', username: 'user3', totalTipsReceived: '300', creditScore: 700 },
    { address: 'G4', username: 'user4', totalTipsReceived: '400', creditScore: 800 },
    { address: 'G5', username: 'user5', totalTipsReceived: '500', creditScore: 900 },
];

describe('TopCreatorsSection', () => {
    const mockGetLeaderboard = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(hooks.useContract).mockReturnValue({
            getLeaderboard: mockGetLeaderboard,
        } as unknown as ReturnType<typeof hooks.useContract>);
    });

    const renderComponent = () =>
        render(
            <BrowserRouter>
                <TopCreatorsSection />
            </BrowserRouter>
        );

    it('renders loading state with 5 skeletons', () => {
        mockGetLeaderboard.mockReturnValue(new Promise(() => { })); // Never resolves
        renderComponent();

        const skeletons = screen.getAllByTestId('skeleton-rect');
        expect(skeletons).toHaveLength(5);
        expect(screen.getByText(/View Full Leaderboard/i)).toBeInTheDocument();
    });

    it('renders empty state when no creators exist', async () => {
        mockGetLeaderboard.mockResolvedValue([]);
        renderComponent();

        await waitFor(() => {
            expect(screen.getByText(/No creators yet/i)).toBeInTheDocument();
        });
        expect(screen.queryByTestId('profile-card')).not.toBeInTheDocument();
        expect(screen.getByText(/Top Creators/i)).toBeInTheDocument();
        expect(screen.getByText(/View Full Leaderboard/i)).toBeInTheDocument();
    });

    it('renders top 5 creators when data is available', async () => {
        mockGetLeaderboard.mockResolvedValue(mockLeaderboardData);
        renderComponent();

        await waitFor(() => {
            expect(screen.getAllByText(/@user/i)).toHaveLength(5);
        });

        mockLeaderboardData.forEach((creator) => {
            expect(screen.getByText(`@${creator.username}`)).toBeInTheDocument();
        });

        expect(screen.getByText(/Top Creators/i)).toBeInTheDocument();
        expect(screen.getByText(/View Full Leaderboard/i)).toBeInTheDocument();
    });

    it('handles error state gracefully', async () => {
        mockGetLeaderboard.mockRejectedValue(new Error('Fetch failed'));
        renderComponent();

        await waitFor(() => {
            expect(screen.getByText(/Could not load top creators/i)).toBeInTheDocument();
        });
    });

    it('navigates to leaderboard on link click', async () => {
        mockGetLeaderboard.mockResolvedValue(mockLeaderboardData);
        renderComponent();

        await waitFor(() => {
            screen.getByText(/View Full Leaderboard/i).click();
        });
        expect(mockNavigate).toHaveBeenCalledWith('/leaderboard');
    });
});
