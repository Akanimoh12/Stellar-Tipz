import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

const here = path.dirname(fileURLToPath(import.meta.url));
const backend = path.resolve(here, '../../../');
const collectorPath = path.join(backend, 'observability/otel-collector/logs.yml');
const guidePath = path.join(backend, 'docs/LOG_MANAGEMENT.md');

describe('log aggregation assets (issue #1362)', () => {
  it('ships Pino container logs through a centrally configured OTLP collector', () => {
    const config = parse(readFileSync(collectorPath, 'utf8')) as Record<string, any>;

    expect(config.receivers['filelog/docker'].include).toContain('/var/lib/docker/containers/*/*-json.log');
    expect(config.receivers['filelog/docker'].operators).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'parse_docker_json', type: 'json_parser' }),
        expect.objectContaining({ id: 'parse_pino_json', type: 'json_parser' }),
      ]),
    );
    expect(config.exporters['otlphttp/logs_backend'].endpoint).toContain('LOGS_BACKEND_OTLP_ENDPOINT');
    expect(config.service.pipelines['logs/stellar_tipz'].exporters).toContain('otlphttp/logs_backend');
  });

  it('applies destination-side redaction before export', () => {
    const config = parse(readFileSync(collectorPath, 'utf8')) as Record<string, any>;
    const statements = config.processors['transform/destination_redaction'].log_statements[0].statements.join('\n');

    expect(statements).toContain('[REDACTED]');
    expect(statements).toContain('[REDACTED_EMAIL]');
    expect(statements).toContain('[REDACTED_STELLAR_ADDRESS]');
    expect(statements).toContain("delete_key(attributes, 'token')");
    expect(config.service.pipelines['logs/stellar_tipz'].processors).toContain('transform/destination_redaction');
  });

  it('documents retention, searchable correlation fields, volume monitoring, and destination checks', () => {
    const guide = readFileSync(guidePath, 'utf8');

    expect(guide).toContain('30 days');
    expect(guide).toContain('180 days');
    expect(guide).toContain('`req.id` / `requestId`');
    expect(guide).toContain('`userId`');
    expect(guide).toContain('`trace_id`');
    expect(guide).toContain('otelcol_exporter_sent_log_records');
    expect(guide).toContain('Destination-side redaction verification');
  });
});
