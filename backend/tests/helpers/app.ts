import request, { type Agent } from 'supertest';
import { createApp } from '../../src/app.js';

/**
 * Returns a Supertest agent wired to a fresh Express app instance.
 * Use this in every module test instead of instantiating createApp() directly
 * so the setup stays DRY and the app config is always in sync with production.
 *
 * @example
 * const agent = buildTestApp();
 * const res = await agent.get('/health');
 */
export function buildTestApp(): Agent {
  return request.agent(createApp());
}
