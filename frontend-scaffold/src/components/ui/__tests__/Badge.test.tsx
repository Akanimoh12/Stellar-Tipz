import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import Badge from '../Badge';
import { getTierFromScore } from '@/helpers/badge';

describe('Badge Component', () => {
  it('renders bronze tier correctly', () => {
    render(<Badge tier="bronze" />);
    expect(screen.getByText('Bronze')).toBeDefined();
    expect(screen.getByText('🥉')).toBeDefined();
    expect(screen.getByText('Bronze').parentElement).toHaveClass('bg-orange-100');
  });

  it('renders silver tier correctly', () => {
    render(<Badge tier="silver" />);
    expect(screen.getByText('Silver')).toBeDefined();
    expect(screen.getByText('🥈')).toBeDefined();
    expect(screen.getByText('Silver').parentElement).toHaveClass('bg-gray-100');
  });

  it('renders gold tier correctly', () => {
    render(<Badge tier="gold" />);
    expect(screen.getByText('Gold')).toBeDefined();
    expect(screen.getByText('🥇')).toBeDefined();
    expect(screen.getByText('Gold').parentElement).toHaveClass('bg-yellow-100');
  });

  it('renders diamond tier correctly', () => {
    render(<Badge tier="diamond" />);
    expect(screen.getByText('Diamond')).toBeDefined();
    expect(screen.getByText('💎')).toBeDefined();
    expect(screen.getByText('Diamond').parentElement).toHaveClass('bg-blue-100');
  });

  it('displays score when provided', () => {
    render(<Badge tier="gold" score={500} />);
    expect(screen.getByText('(500)')).toBeDefined();
  });

  it('does not display score when not provided', () => {
    render(<Badge tier="gold" />);
    expect(screen.queryByText('(')).toBeNull();
  });

  it('applies custom className', () => {
    const { container } = render(<Badge tier="bronze" className="test-class" />);
    expect(container.firstChild).toHaveClass('test-class');
  });
});

describe('getTierFromScore utility', () => {
  it('returns correctly for various scores', () => {
    expect(getTierFromScore(100)).toBe('bronze');
    expect(getTierFromScore(400)).toBe('bronze');
    expect(getTierFromScore(401)).toBe('silver');
    expect(getTierFromScore(700)).toBe('silver');
    expect(getTierFromScore(701)).toBe('gold');
    expect(getTierFromScore(900)).toBe('gold');
    expect(getTierFromScore(901)).toBe('diamond');
    expect(getTierFromScore(1500)).toBe('diamond');
  });
});
