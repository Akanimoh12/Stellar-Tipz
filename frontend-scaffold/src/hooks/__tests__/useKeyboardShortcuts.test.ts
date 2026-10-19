import { renderHook } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  useKeyboardShortcuts,
  formatShortcut,
  getModifierKey,
  KeyboardShortcut,
} from '../useKeyboardShortcuts';

describe('useKeyboardShortcuts (#1517)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('loading and initialization', () => {
    it('registers keydown event listener on window on mount', () => {
      const addEventListenerSpy = vi.spyOn(window, 'addEventListener');
      renderHook(() => useKeyboardShortcuts([]));

      expect(addEventListenerSpy).toHaveBeenCalledWith('keydown', expect.any(Function));
    });

    it('updates internal shortcuts ref when shortcuts prop updates without re-attaching listeners unnecessarily', () => {
      const action1 = vi.fn();
      const action2 = vi.fn();

      const initialShortcuts: KeyboardShortcut[] = [
        { key: 'a', description: 'Action A', action: action1 },
      ];

      const { rerender } = renderHook(
        ({ shortcuts }) => useKeyboardShortcuts(shortcuts),
        { initialProps: { shortcuts: initialShortcuts } }
      );

      // Trigger 'a'
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }));
      expect(action1).toHaveBeenCalledTimes(1);

      // Update shortcuts
      const updatedShortcuts: KeyboardShortcut[] = [
        { key: 'b', description: 'Action B', action: action2 },
      ];
      rerender({ shortcuts: updatedShortcuts });

      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'b' }));
      expect(action2).toHaveBeenCalledTimes(1);
    });
  });

  describe('success path - key matching and execution', () => {
    it('triggers shortcut action on exact key match and prevents default', () => {
      const action = vi.fn();
      const shortcuts: KeyboardShortcut[] = [
        { key: 'k', description: 'Open search', action },
      ];

      renderHook(() => useKeyboardShortcuts(shortcuts));

      const event = new KeyboardEvent('keydown', { key: 'k', cancelable: true });
      const preventDefaultSpy = vi.spyOn(event, 'preventDefault');

      window.dispatchEvent(event);

      expect(action).toHaveBeenCalledTimes(1);
      expect(preventDefaultSpy).toHaveBeenCalled();
    });

    it('matches keys case-insensitively', () => {
      const action = vi.fn();
      const shortcuts: KeyboardShortcut[] = [
        { key: 'k', description: 'Search', action },
      ];

      renderHook(() => useKeyboardShortcuts(shortcuts));

      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'K' }));
      expect(action).toHaveBeenCalledTimes(1);
    });

    it('handles normalized keys such as Esc / Escape', () => {
      const action = vi.fn();
      const shortcuts: KeyboardShortcut[] = [
        { key: 'Escape', description: 'Close modal', action },
      ];

      renderHook(() => useKeyboardShortcuts(shortcuts));

      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Esc' }));
      expect(action).toHaveBeenCalledTimes(1);
    });

    it('triggers action when modifier keys (ctrl, meta, shift, alt) match', () => {
      const actionCtrl = vi.fn();
      const actionShiftAlt = vi.fn();

      const shortcuts: KeyboardShortcut[] = [
        { key: 'k', ctrl: true, description: 'Ctrl+K', action: actionCtrl },
        { key: 'p', shift: true, alt: true, description: 'Shift+Alt+P', action: actionShiftAlt },
      ];

      renderHook(() => useKeyboardShortcuts(shortcuts));

      // Ctrl + k
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }));
      expect(actionCtrl).toHaveBeenCalledTimes(1);

      // Shift + Alt + p
      window.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'p', shiftKey: true, altKey: true })
      );
      expect(actionShiftAlt).toHaveBeenCalledTimes(1);
    });

    it('treats Cmd and Ctrl as interchangeable when either ctrl or meta is configured', () => {
      const action = vi.fn();
      const shortcuts: KeyboardShortcut[] = [
        { key: 's', meta: true, description: 'Save', action },
      ];

      renderHook(() => useKeyboardShortcuts(shortcuts));

      // With ctrlKey instead of metaKey
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 's', ctrlKey: true }));
      expect(action).toHaveBeenCalledTimes(1);
    });

    it('does not trigger action when modifier keys do not match', () => {
      const action = vi.fn();
      const shortcuts: KeyboardShortcut[] = [
        { key: 'k', ctrl: true, description: 'Ctrl+K', action },
      ];

      renderHook(() => useKeyboardShortcuts(shortcuts));

      // Missing ctrlKey
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: false }));
      expect(action).not.toHaveBeenCalled();

      // Extra unrequested shiftKey
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, shiftKey: true }));
      expect(action).not.toHaveBeenCalled();
    });
  });

  describe('sequential shortcut combinations', () => {
    it('executes action when full sequence is typed within time limit', () => {
      const action = vi.fn();
      const shortcuts: KeyboardShortcut[] = [
        {
          key: '',
          sequence: ['g', 'h'],
          description: 'Go Home',
          action,
        },
      ];

      renderHook(() => useKeyboardShortcuts(shortcuts));

      // Type first key 'g'
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'g' }));
      expect(action).not.toHaveBeenCalled();

      // Advance 400ms (within 1000ms limit)
      vi.advanceTimersByTime(400);

      // Type second key 'h'
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'h' }));
      expect(action).toHaveBeenCalledTimes(1);
    });

    it('resets sequence and does not trigger action if sequence times out', () => {
      const action = vi.fn();
      const shortcuts: KeyboardShortcut[] = [
        {
          key: '',
          sequence: ['g', 'h'],
          description: 'Go Home',
          action,
        },
      ];

      renderHook(() => useKeyboardShortcuts(shortcuts));

      // Type 'g'
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'g' }));

      // Advance past 1000ms timeout
      vi.advanceTimersByTime(1100);

      // Type 'h'
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'h' }));
      expect(action).not.toHaveBeenCalled();
    });

    it('resets sequence when wrong key is pressed or Escape is pressed', () => {
      const action = vi.fn();
      const shortcuts: KeyboardShortcut[] = [
        {
          key: '',
          sequence: ['g', 'h'],
          description: 'Go Home',
          action,
        },
      ];

      renderHook(() => useKeyboardShortcuts(shortcuts));

      // Type 'g', then wrong key 'x'
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'g' }));
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'x' }));
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'h' }));
      expect(action).not.toHaveBeenCalled();

      // Type 'g', then Escape
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'g' }));
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'h' }));
      expect(action).not.toHaveBeenCalled();
    });
  });

  describe('input field handling', () => {
    it('ignores shortcuts when typing inside input, textarea, or contenteditable elements', () => {
      const action = vi.fn();
      const shortcuts: KeyboardShortcut[] = [
        { key: 'j', description: 'Next item', action },
      ];

      renderHook(() => useKeyboardShortcuts(shortcuts));

      // Create input element and focus it
      const input = document.createElement('input');
      document.body.appendChild(input);
      input.focus();

      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'j' }));
      expect(action).not.toHaveBeenCalled();

      input.remove();
    });

    it('executes shortcut when allowInInput is true even if focused on an input', () => {
      const action = vi.fn();
      const shortcuts: KeyboardShortcut[] = [
        { key: 'Escape', description: 'Dismiss', action, allowInInput: true },
      ];

      renderHook(() => useKeyboardShortcuts(shortcuts));

      const textarea = document.createElement('textarea');
      document.body.appendChild(textarea);
      textarea.focus();

      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      expect(action).toHaveBeenCalledTimes(1);

      textarea.remove();
    });
  });

  describe('error handling', () => {
    it('catches or handles errors thrown by action without unbinding listeners', () => {
      const failingAction = vi.fn().mockImplementation(() => {
        throw new Error('Action failed');
      });
      const successAction = vi.fn();

      const shortcuts: KeyboardShortcut[] = [
        { key: 'x', description: 'Throws', action: failingAction },
        { key: 'y', description: 'Succeeds', action: successAction },
      ];

      renderHook(() => useKeyboardShortcuts(shortcuts));

      // Trigger failing action - throws
      expect(() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'x' }));
      }).toThrow('Action failed');

      // Next keypress still works
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'y' }));
      expect(successAction).toHaveBeenCalledTimes(1);
    });
  });

  describe('cleanup path', () => {
    it('removes keydown event listener on unmount', () => {
      const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener');
      const { unmount } = renderHook(() => useKeyboardShortcuts([]));

      unmount();

      expect(removeEventListenerSpy).toHaveBeenCalledWith('keydown', expect.any(Function));
    });

    it('clears pending sequence timeouts on unmount', () => {
      const clearTimeoutSpy = vi.spyOn(window, 'clearTimeout');
      const shortcuts: KeyboardShortcut[] = [
        { key: '', sequence: ['g', 'h'], description: 'Home', action: vi.fn() },
      ];

      const { unmount } = renderHook(() => useKeyboardShortcuts(shortcuts));

      // Trigger first key to schedule sequence timeout
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'g' }));

      unmount();

      expect(clearTimeoutSpy).toHaveBeenCalled();
    });

    it('does not trigger actions after unmount', () => {
      const action = vi.fn();
      const shortcuts: KeyboardShortcut[] = [
        { key: 'a', description: 'Action', action },
      ];

      const { unmount } = renderHook(() => useKeyboardShortcuts(shortcuts));
      unmount();

      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }));
      expect(action).not.toHaveBeenCalled();
    });
  });

  describe('formatShortcut and getModifierKey helpers', () => {
    it('returns platform modifier key', () => {
      const mod = getModifierKey();
      expect(['Cmd', 'Ctrl']).toContain(mod);
    });

    it('formats single key and multi-modifier shortcuts correctly', () => {
      const mod = getModifierKey();

      expect(
        formatShortcut({ key: 'k', meta: true, description: '', action: vi.fn() })
      ).toBe(`${mod} + K`);

      expect(
        formatShortcut({ key: 'p', shift: true, alt: true, description: '', action: vi.fn() })
      ).toBe('Shift + Alt + P');

      expect(
        formatShortcut({ key: 'Escape', description: '', action: vi.fn() })
      ).toBe('Escape');
    });
  });
});
