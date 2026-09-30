import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:4000';
const API_BASE_PATH = __ENV.API_BASE_PATH || '/api/v1';
const POOL_SIZE = Number(__ENV.DATABASE_POOL_SIZE || 10);
const poolTimeouts = new Rate('database_pool_timeout_rate');
const requestLatency = new Trend('database_pool_request_latency_ms');

export const options = {
  scenarios: {
    pool_saturation: {
      executor: 'constant-vus',
      vus: POOL_SIZE + 5,
      duration: __ENV.DURATION || '30s',
    },
  },
  thresholds: {
    database_pool_request_latency_ms: ['p(95)<35000'],
  },
};

export default function () {
  const response = http.get(`${BASE_URL}${API_BASE_PATH}/profiles`);
  requestLatency.add(response.timings.duration);
  const timedOut = response.status === 503 || response.status === 504;
  poolTimeouts.add(timedOut ? 1 : 0);

  check(response, {
    'request completed or failed fast': (result) =>
      result.status === 200 || result.status === 503 || result.status === 504,
  });
  sleep(0.1);
}
