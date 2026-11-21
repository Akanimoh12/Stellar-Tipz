import { z } from 'zod';
import { parseCorsOrigins } from '../cors.js';

export const serverEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(4000),
  API_BASE_PATH: z.string().default('/api/v1'),
  /**
   * Comma-separated list of allowed CORS origins.
   * Validated as absolute http(s) origins. A wildcard ("*") is rejected because
   * the API always runs with credentials enabled, and localhost entries are
   * rejected in production. Invalid configuration fails at startup (issue #078).
   */
  CORS_ORIGIN: z
    .string()
    .default('http://localhost:5173')
    .transform((raw) => raw.split(',').map((entry) => entry.trim()).filter((entry) => entry.length > 0))
    .pipe(
      z.array(z.string()).superRefine((origins, ctx) => {
        try {
          parseCorsOrigins(origins.join(','));
        } catch (e) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: (e as Error).message,
          });
        }
      }),
    ),
  /** Optional CSP violation report endpoint (report-uri). When set, CSP header includes this URL. */
  CSP_REPORT_URI: z.string().url().optional(),
  /** Payload limits (issue #077) */
  JSON_BODY_LIMIT: z.string().default('100kb'),
  MULTER_FILE_SIZE_LIMIT: z.coerce.number().int().positive().default(5 * 1024 * 1024),
  MULTER_FILES_LIMIT: z.coerce.number().int().positive().default(1),
  MULTER_FIELDS_LIMIT: z.coerce.number().int().positive().default(10),
  REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;
