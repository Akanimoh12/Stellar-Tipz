/** @jsxImportSource react */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { vi, beforeEach, afterEach, describe, it, expect } from 'vitest';
import ErrorBoundary from '../ErrorBoundary';

// Mock console methods to avoid test output pollution
const originalConsoleError = console.error;
const originalConsoleGroup = console.group;
const originalConsoleGroupEnd = console.groupEnd;
const originalConsoleLog = console.log;

beforeEach(() => {
  console.error = vi.fn();
  console.group = vi.fn();
  console.groupEnd = vi.fn();
  console.log = vi.fn();
});

afterEach(() => {
  console.error = originalConsoleError;
  console.group = originalConsoleGroup;
  console.groupEnd = originalConsoleGroupEnd;
  console.log = originalConsoleLog;
});

// Mock useNavigate
vi.mock('react-router-dom', async (importOriginal) => {
  const mod = await importOriginal() as any;
  return {
    ...mod,
    useNavigate: () => vi.fn(),
  };
});

describe('ErrorBoundary', () => {
  it('renders children when no error', () => {
    render(
      <BrowserRouter>
        <ErrorBoundary>
          <div>Content</div>
        </ErrorBoundary>
      </BrowserRouter>
    );
    expect(screen.getByText('Content')).toBeInTheDocument();
  });

  it('catches and displays error UI', () => {
    const ThrowError = () => { 
      throw new Error('Test error'); 
    };
    
    render(
      <BrowserRouter>
        <ErrorBoundary>
          <ThrowError />
        </ErrorBoundary>
      </BrowserRouter>
    );
    
    expect(screen.getByText('Unexpected Error')).toBeInTheDocument();
    expect(screen.getByText('Try Again')).toBeInTheDocument();
    expect(screen.getByText('Go Home')).toBeInTheDocument();
  });

  it('recovers on Try Again click', async () => {
    let shouldThrow = true;
    const Component = () => {
      if (shouldThrow) throw new Error('Test error');
      return <div>Recovered</div>;
    };
    
    const { rerender } = render(
      <BrowserRouter>
        <ErrorBoundary>
          <Component />
        </ErrorBoundary>
      </BrowserRouter>
    );
    
    // Should show error UI
    expect(screen.getByText('Unexpected Error')).toBeInTheDocument();
    
    // Fix the error condition
    shouldThrow = false;
    
    // Click Try Again
    const tryAgainButton = screen.getByText('Try Again');
    fireEvent.click(tryAgainButton);
    
    // Should recover and show content
    await waitFor(() => {
      expect(screen.getByText('Recovered')).toBeInTheDocument();
    });
  });

  it('navigates home on Go Home click', async () => {
    // This test verifies the Go Home button exists and is clickable
    // The actual navigation is handled by useNavigate hook
    const ThrowError = () => { 
      throw new Error('Test error'); 
    };
    
    render(
      <BrowserRouter>
        <ErrorBoundary>
          <ThrowError />
        </ErrorBoundary>
      </BrowserRouter>
    );
    
    const goHomeButton = screen.getByText('Go Home');
    expect(goHomeButton).toBeInTheDocument();
    
    // Click the button - should not throw error
    fireEvent.click(goHomeButton);
  });

  it('shows error details in development mode', () => {
    // Mock development mode
    const originalDevMode = import.meta.env.DEV;
    Object.defineProperty(import.meta, 'env', {
      value: { DEV: true },
      writable: true,
    });

    const ThrowError = () => { 
      throw new Error('Test error'); 
    };
    
    render(
      <BrowserRouter>
        <ErrorBoundary>
          <ThrowError />
        </ErrorBoundary>
      </BrowserRouter>
    );
    
    // Should show error details button in dev mode
    expect(screen.getByText('Error Details')).toBeInTheDocument();
    
    // Click to show details
    const errorDetailsButton = screen.getByText('Error Details');
    fireEvent.click(errorDetailsButton);
    
    // Should show error information
    expect(screen.getByText('Error:')).toBeInTheDocument();
    expect(screen.getByText('Test error')).toBeInTheDocument();
    
    // Restore original dev mode
    Object.defineProperty(import.meta, 'env', {
      value: { DEV: originalDevMode },
      writable: true,
    });
  });

  it('logs error details to console', () => {
    const ThrowError = () => { 
      throw new Error('Test error'); 
    };
    
    render(
      <BrowserRouter>
        <ErrorBoundary>
          <ThrowError />
        </ErrorBoundary>
      </BrowserRouter>
    );
    
    expect(console.error).toHaveBeenCalledWith('ErrorBoundary caught an error:', expect.any(Error));
    expect(console.group).toHaveBeenCalledWith('Error Boundary Error Details');
    expect(console.groupEnd).toHaveBeenCalled();
  });

  it('calls reportError hook when error occurs', () => {
    const ThrowError = () => { 
      throw new Error('Test error'); 
    };
    
    render(
      <BrowserRouter>
        <ErrorBoundary>
          <ThrowError />
        </ErrorBoundary>
      </BrowserRouter>
    );
    
    expect(console.log).toHaveBeenCalledWith(
      'Error reporting hook - would send to analytics:',
      expect.objectContaining({
        error: 'Test error',
        timestamp: expect.any(String),
      })
    );
  });

  it('respects custom fallback prop', () => {
    const ThrowError = () => { 
      throw new Error('Test error'); 
    };
    
    const customFallback = <div>Custom error UI</div>;
    
    render(
      <BrowserRouter>
        <ErrorBoundary fallback={customFallback}>
          <ThrowError />
        </ErrorBoundary>
      </BrowserRouter>
    );
    
    expect(screen.getByText('Custom error UI')).toBeInTheDocument();
    expect(screen.queryByText(/something went wrong/i)).not.toBeInTheDocument();
  });

  it('calls onReset prop when provided', () => {
    const mockOnReset = vi.fn();
    let shouldThrow = true;
    const Component = () => {
      if (shouldThrow) throw new Error('Test error');
      return <div>Content</div>;
    };
    
    render(
      <BrowserRouter>
        <ErrorBoundary onReset={mockOnReset}>
          <Component />
        </ErrorBoundary>
      </BrowserRouter>
    );
    
    // Fix the error condition
    shouldThrow = false;
    
    // Click Try Again
    const tryAgainButton = screen.getByText('Try Again');
    fireEvent.click(tryAgainButton);
    
    expect(mockOnReset).toHaveBeenCalled();
  });
});
