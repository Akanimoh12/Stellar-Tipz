import { withSpan, addSpanAttributes, isTracingActive, injectContext } from './tracing.js';
import { SpanStatusCode } from '@opentelemetry/api';
import { SEMATTRS_HTTP_METHOD, SEMATTRS_HTTP_URL, SEMATTRS_HTTP_STATUS_CODE, SEMATTRS_NETWORK_PEER_ADDRESS } from '@opentelemetry/semantic-conventions';

export interface TracedFetchOptions extends RequestInit {
  /** Operation name for the span (defaults to HTTP method + URL) */
  operationName?: string;
  /** Service name for the span (e.g., 'ipfs', 'x-api') */
  serviceName?: string;
  /** Whether to record request/response body (for debugging) */
  recordBody?: boolean;
}

/**
 * Wraps fetch with OpenTelemetry tracing.
 * Creates a span for the outbound HTTP request with appropriate attributes.
 */
export async function tracedFetch(
  url: string,
  options: TracedFetchOptions = {},
): Promise<Response> {
  const { operationName, serviceName = 'http', recordBody = false, ...fetchOptions } = options;
  const method = fetchOptions.method ?? 'GET';
  const spanName = operationName ?? `http.${serviceName}.${method}`;

  return withSpan(
    spanName,
    async (span) => {
      if (span) {
        span.setAttributes({
          [SEMATTRS_HTTP_METHOD]: method,
          [SEMATTRS_HTTP_URL]: url,
          [SEMATTRS_NETWORK_PEER_ADDRESS]: new URL(url).origin,
          'http.service_name': serviceName,
        });

        if (recordBody && fetchOptions.body) {
          const bodyStr = typeof fetchOptions.body === 'string'
            ? fetchOptions.body
            : fetchOptions.body instanceof FormData
              ? '[FormData]'
              : fetchOptions.body instanceof URLSearchParams
                ? '[URLSearchParams]'
                : JSON.stringify(fetchOptions.body);
          span.setAttribute('http.request.body', bodyStr.slice(0, 1000));
        }
      }

      let response: Response;
      try {
        response = await fetch(url, fetchOptions);
      } catch (err) {
        if (span) {
          span.setStatus({
            code: SpanStatusCode.ERROR,
            message: err instanceof Error ? err.message : String(err),
          });
          span.recordException(err as Error);
        }
        throw err;
      }

      if (span) {
        span.setAttribute(SEMATTRS_HTTP_STATUS_CODE, response.status);
        if (response.status >= 400) {
          span.setStatus({
            code: SpanStatusCode.ERROR,
            message: `HTTP ${response.status}`,
          });
        } else {
          span.setStatus({ code: SpanStatusCode.OK });
        }

        if (recordBody) {
          const contentType = response.headers.get('content-type');
          if (contentType?.includes('json')) {
            const clonedResponse = response.clone();
            try {
              const body = await clonedResponse.json();
              span.setAttribute('http.response.body', JSON.stringify(body).slice(0, 1000));
            } catch {
              // Ignore parse errors
            }
          }
        }
      }

      return response;
    },
    { kind: 2 }, // SpanKind.CLIENT
  );
}

/**
 * Creates a traced fetch function for a specific service.
 * Useful for creating service-specific fetch wrappers.
 */
export function createTracedFetch(serviceName: string) {
  return async (url: string, options: TracedFetchOptions = {}): Promise<Response> => {
    return tracedFetch(url, { ...options, serviceName });
  };
}

/**
 * Simple wrapper that adds trace headers to outbound requests.
 * Use this when you need to manually propagate trace context.
 */
export function addTraceHeaders(headers: HeadersInit = {}): HeadersInit {
  const carrier: Record<string, string> = {};
  const h = new Headers(headers);

  // Inject trace context into headers
  if (isTracingActive()) {
    injectContext(carrier);
  }

  for (const [key, value] of Object.entries(carrier)) {
    h.set(key, value);
  }

  return h;
}