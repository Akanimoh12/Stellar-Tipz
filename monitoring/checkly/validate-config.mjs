import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = new URL('.', import.meta.url).pathname;
const [main, flow, readme] = await Promise.all([
  readFile(resolve(root, 'main.tf'), 'utf8'),
  readFile(resolve(root, 'scripts/frontend-user-flow.spec.js'), 'utf8'),
  readFile(resolve(root, 'README.md'), 'utf8'),
]);

const required = [
  'us-east-1',
  'eu-west-1',
  'ap-southeast-1',
  'ssl_expiry_threshold = 30',
  'checkly_status_page',
  'checkly_status_page_service',
  'checkly_check" "frontend_user_flow',
  'checkly_check" "api_readiness',
  'same_region          = false',
  'notify_subscribers = true',
];

for (const value of required) {
  if (!main.includes(value)) throw new Error(`Monitoring config is missing: ${value}`);
}
for (const value of ['getByRole(\'main\')', 'leaderboard', 'top creators']) {
  if (!flow.includes(value)) throw new Error(`User-flow probe is missing: ${value}`);
}
if (!readme.includes('terraform apply monitoring.tfplan')) {
  throw new Error('Monitoring deployment runbook is missing the reviewed apply step.');
}

console.log('Checkly monitoring configuration has the required production controls.');
