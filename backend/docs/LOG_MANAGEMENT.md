# Log aggregation and retention

Stellar Tipz emits one JSON Pino event per line from the **API**, **indexer**,
and **jobs** processes. Production containers must send those stdout events to
the central OTLP-compatible logging backend through the OpenTelemetry Collector
configuration in [`../observability/otel-collector/logs.yml`](../observability/otel-collector/logs.yml).

This is a required production dependency: local container logs are not an
incident archive and must not be treated as one.

## Deploying the collector

For Docker hosts, run the collector next to the application using
[`../observability/otel-collector/docker-compose.logs.yml`](../observability/otel-collector/docker-compose.logs.yml).
The deployment platform injects these values from its secret manager:

| Variable | Purpose | Rules |
| --- | --- | --- |
| `LOGS_BACKEND_OTLP_ENDPOINT` | HTTPS OTLP logs endpoint for the approved central backend | Must be reachable from every production host. |
| `LOGS_BACKEND_OTLP_HEADERS` | `Authorization` header value for that endpoint | Secret; never commit it or place it in `.env.example`. |

For Kubernetes, deploy the same collector config as a DaemonSet with the pod
log directory mounted read-only. Every API, indexer, and jobs workload must use
the standard JSON container logger; do not add a file-only Pino transport.

The collector does a **second**, destination-side redaction pass for tokens,
credentials, emails, and full Stellar addresses. Source-side Pino redaction is
still mandatory. The two layers protect against both unsafe application logs
and a misconfigured destination pipeline.

## Retention policy

The central logging backend is configured with the following retention periods.
Changing a period requires approval from the security owner and the operations
owner; changing a backend default is not sufficient unless the actual bucket or
index policy is also updated.

| Log class | Examples | Retention | Reason |
| --- | --- | ---: | --- |
| Application operational logs | API, indexer, jobs Pino events | 30 days | Incident investigation and service debugging. |
| Security/audit events | auth failures, admin actions, access denials | 180 days | Security investigation and accountability. |
| Aggregation pipeline logs | OpenTelemetry Collector health and delivery failures | 30 days | Diagnose lost or delayed log delivery. |
| PII-redaction verification evidence | scheduled query output and reviewer sign-off | 90 days | Demonstrates the destination was checked, without retaining raw PII. |

No raw request or response bodies, access tokens, cookies, private keys, or
full Stellar addresses may be retained. The expiry policy must delete data from
both searchable indexes and object-storage/archive tiers.

## Search and correlation

The log backend must index these Pino fields as searchable fields (not only
full-text):

| Field | Source | Use |
| --- | --- | --- |
| `req.id` / `requestId` | `x-request-id` middleware | Trace one client request across API logs. |
| `userId` | authenticated service logs where applicable | Investigate a user-impacting incident. |
| `trace_id` | OpenTelemetry/Pino mixin | Join a log event to a distributed trace. |
| `service.name` / container name | deployment metadata | Limit a query to API, indexer, or jobs. |

`x-request-id` is returned to clients in every API response. On-call should ask
for it first, then pivot to `trace_id` if a request crossed services.

## Monitoring log volume and delivery

Prometheus must scrape the collector's loopback `:8888/metrics` endpoint. Add
these alerts in the production monitoring system:

| Signal | Alert condition | Response |
| --- | --- | --- |
| `otelcol_exporter_send_failed_log_records` | Increase for 10 minutes | Check endpoint credentials, collector queue, and backend availability. |
| `otelcol_exporter_queue_size / otelcol_exporter_queue_capacity` | Above 80% for 10 minutes | Scale the collector or reduce noisy logs before records are dropped. |
| `sum(rate(otelcol_exporter_sent_log_records[5m]))` | Above the agreed service budget for 15 minutes | Investigate a noisy release and estimate backend cost impact. |
| `sum(rate(otelcol_exporter_sent_log_records[5m]))` | Near zero while API traffic is non-zero for 10 minutes | Treat as a logging delivery outage. |

Operations reviews the daily log-record rate and estimated ingestion cost. A
new high-cardinality field or verbose debug logging must include a cost review.

## Destination-side redaction verification

Run this after each collector or backend routing change, before promotion, and
at least monthly in production:

1. Send a synthetic log event containing the approved test markers
   `pii-check@example.invalid`, a fake 56-character `G…` Stellar address, and
   `token=destination-redaction-check`.
2. Query the **central backend**, not the container or collector stdout, by its
   request ID. The raw email, full address, and token value must be absent; the
   redacted markers must be present.
3. Query the last 24 hours for known secret field names (`authorization`,
   `cookie`, `password`, `token`, `secret`, and `apiKey`) and sample results.
4. Record the query link, timestamp, environment, and reviewer in the security
   runbook. Store only redacted evidence.
5. If any raw PII appears, stop forwarding the affected stream, rotate exposed
   credentials where applicable, follow `docs/INCIDENT_RESPONSE.md`, and do
   not restore ingestion until the check passes.

The collector config is deliberately tested in CI for the required second
redaction layer; CI cannot prove a vendor-side retention policy, so the
production verification above remains mandatory.
