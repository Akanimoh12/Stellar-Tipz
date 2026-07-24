import { describe, expect, it } from 'vitest';
import { buildTestApp } from './helpers/app.js';

describe('GET /health', () => {
  it('returns ok status', async () => {
    const agent = buildTestApp();
    const res = await agent.get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });
});
