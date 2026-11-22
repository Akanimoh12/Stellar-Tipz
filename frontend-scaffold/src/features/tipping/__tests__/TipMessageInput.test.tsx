import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import TipMessageInput from '../TipMessageInput';

describe('TipMessageInput character counter', () => {
  it('displays full remaining characters when empty', () => {
    render(<TipMessageInput message="" onChange={vi.fn()} maxLength={280} />);
    expect(screen.getByTestId('tip-char-counter')).toHaveTextContent('280 characters remaining');
  });

  it('updates remaining characters and uses singular form at 1 remaining', () => {
    const { rerender } = render(
      <TipMessageInput message="Hello" onChange={vi.fn()} maxLength={280} />,
    );
    expect(screen.getByTestId('tip-char-counter')).toHaveTextContent('275 characters remaining');

    rerender(<TipMessageInput message={'a'.repeat(279)} onChange={vi.fn()} maxLength={280} />);
    expect(screen.getByTestId('tip-char-counter')).toHaveTextContent('1 character remaining');
    expect(screen.getByTestId('tip-char-counter').className).toContain('text-amber-700');

    rerender(<TipMessageInput message={'a'.repeat(280)} onChange={vi.fn()} maxLength={280} />);
    expect(screen.getByTestId('tip-char-counter')).toHaveTextContent('0 characters remaining');
    expect(screen.getByTestId('tip-char-counter').className).toContain('text-red-600');
  });

  it('calls onChange for input within maxLength and ignores overflow', () => {
    const onChange = vi.fn();
    render(<TipMessageInput message="" onChange={onChange} maxLength={10} />);

    const textarea = screen.getByRole('textbox');
    fireEvent.change(textarea, { target: { value: '12345' } });
    expect(onChange).toHaveBeenCalledWith('12345');

    onChange.mockClear();
    fireEvent.change(textarea, { target: { value: '12345678901' } });
    expect(onChange).not.toHaveBeenCalled();
  });
});
