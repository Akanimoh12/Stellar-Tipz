import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route, useNavigate } from 'react-router-dom';
import ScrollToTop from '../ScrollToTop';

const NavigationButtons = () => {
  const navigate = useNavigate();

  return (
    <>
      <button onClick={() => navigate('/leaderboard')}>Go leaderboard</button>
      <button onClick={() => navigate('/#features')}>Go features</button>
      <button onClick={() => navigate('/#nonexistent')}>Go missing hash</button>
    </>
  );
};

describe('ScrollToTop', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'scrollTo', {
      writable: true,
      value: vi.fn(),
    });
  });

  it('scrolls to top on route change', async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={['/']}>
        <ScrollToTop />
        <NavigationButtons />
        <Routes>
          <Route
            path="/"
            element={<section id="features">Features Section</section>}
          />
          <Route path="/leaderboard" element={<div>Leaderboard</div>} />
        </Routes>
      </MemoryRouter>
    );

    vi.mocked(window.scrollTo).mockClear();
    await user.click(screen.getByRole('button', { name: /go leaderboard/i }));

    expect(window.scrollTo).toHaveBeenCalledWith({
      top: 0,
      left: 0,
      behavior: 'smooth',
    });
  });

  it('scrolls to element on hash navigation', async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={['/']}>
        <ScrollToTop />
        <NavigationButtons />
        <Routes>
          <Route
            path="/"
            element={<section id="features">Features Section</section>}
          />
          <Route path="/leaderboard" element={<div>Leaderboard</div>} />
        </Routes>
      </MemoryRouter>
    );

    const featuresEl = document.getElementById('features');
    expect(featuresEl).toBeTruthy();

    const scrollIntoView = vi.fn();
    Object.defineProperty(featuresEl as HTMLElement, 'scrollIntoView', {
      writable: true,
      value: scrollIntoView,
    });

    vi.mocked(window.scrollTo).mockClear();
    await user.click(screen.getByRole('button', { name: /go features/i }));

    expect(scrollIntoView).toHaveBeenCalledWith({
      behavior: 'smooth',
      block: 'start',
    });
    expect(window.scrollTo).not.toHaveBeenCalled();
  });

  it('ignores non-existent hash targets', async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={['/']}>
        <ScrollToTop />
        <NavigationButtons />
        <Routes>
          <Route
            path="/"
            element={<section id="features">Features Section</section>}
          />
          <Route path="/leaderboard" element={<div>Leaderboard</div>} />
        </Routes>
      </MemoryRouter>
    );

    vi.mocked(window.scrollTo).mockClear();

    await user.click(screen.getByRole('button', { name: /go missing hash/i }));

    expect(window.scrollTo).not.toHaveBeenCalled();
  });
});
