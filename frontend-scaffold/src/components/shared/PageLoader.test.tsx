import { render, screen, act } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import PageLoader from './PageLoader';

describe('PageLoader', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('shows loading spinner initially', () => {
        render(
            <BrowserRouter>
                <PageLoader />
            </BrowserRouter>
        );
        expect(screen.getByRole('status')).toBeInTheDocument();
        expect(screen.getByText(/loading/i)).toBeInTheDocument();
    });

    it('shows error after timeout', async () => {
        render(
            <BrowserRouter>
                <PageLoader />
            </BrowserRouter>
        );

        act(() => {
            vi.advanceTimersByTime(10000);
        });

        expect(screen.getByText(/taking longer/i)).toBeInTheDocument();
    });

    it('provides Go Home button on timeout', async () => {
        render(
            <BrowserRouter>
                <PageLoader />
            </BrowserRouter>
        );

        act(() => {
            vi.advanceTimersByTime(10000);
        });

        expect(screen.getByRole('link', { name: /home/i })).toBeInTheDocument();
    });

    it('provides Retry button on timeout', async () => {
        render(
            <BrowserRouter>
                <PageLoader />
            </BrowserRouter>
        );

        act(() => {
            vi.advanceTimersByTime(10000);
        });

        expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
    });
});
