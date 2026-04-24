import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import TipReceipt from './TipReceipt';
import TipResult from './TipResult';

// Mock html2canvas
vi.mock('html2canvas', () => {
  return {
    default: vi.fn().mockResolvedValue({
      toDataURL: vi.fn().mockReturnValue('data:image/png;base64,mock'),
    }),
  };
});

// Mock qrcode.react
vi.mock('qrcode.react', () => {
  return {
    QRCodeSVG: () => <svg data-testid="mock-qr-code" />,
  };
});

// Mock useWallet
vi.mock('../../hooks/useWallet', () => ({
  useWallet: () => ({
    publicKey: 'GABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890',
  }),
}));

describe('Tip receipt', () => {
  it('shows receipt after successful tip', () => {
    // We render TipResult with success state and txHash
    render(
      <TipResult 
        status="success" 
        txHash="abc123def456" 
        amount="5" 
        creator={{ username: 'testuser', displayName: 'Test User', owner: 'G123', bio: '', xFollowers: 0, xEngagementAvg: 0, creditScore: 50, totalTipsReceived: '5', totalTipsCount: 1, balance: '5', registeredAt: 0, updatedAt: 0, imageUrl: '', xHandle: '' }} 
      />
    );
    
    // Check if receipt text is in document
    expect(screen.getByText(/TIPZ RECEIPT/i)).toBeInTheDocument();
    expect(screen.getByText(/Transaction Hash/i)).toBeInTheDocument();
    expect(screen.getByText(/abc123def456/i)).toBeInTheDocument();
  });

  it('has download button', () => {
    render(<TipReceipt txHash="abc123" />);
    expect(screen.getByRole('button', { name: /download/i })).toBeInTheDocument();
  });

  it('links to block explorer', () => {
    render(<TipReceipt txHash="abc123" />);
    // The view on explorer button is wrapped in a link
    const link = screen.getByRole('link', { name: /view on explorer/i });
    expect(link).toHaveAttribute('href', expect.stringContaining('stellar.expert'));
    expect(link).toHaveAttribute('href', expect.stringContaining('abc123'));
  });
});
