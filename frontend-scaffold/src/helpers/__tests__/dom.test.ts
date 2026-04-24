import { describe, expect, it, vi } from 'vitest';

import { copyContent } from '../dom';

describe('dom helper', () => {
  it('copies text to clipboard', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await copyContent('tipz');

    expect(writeText).toHaveBeenCalledWith('tipz');
    expect(logSpy).toHaveBeenCalledWith('Content copied to clipboard');

    logSpy.mockRestore();
  });

  it('handles clipboard failures', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('denied'));
    Object.assign(navigator, { clipboard: { writeText } });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await copyContent('tipz');

    expect(writeText).toHaveBeenCalledWith('tipz');
    expect(errorSpy).toHaveBeenCalled();

    errorSpy.mockRestore();
  });
});
