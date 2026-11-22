# External uptime monitoring

This is the production monitoring-as-code stack for issue #1361. It uses the
official Checkly Terraform provider because probes run from external public
locations rather than from the application network.

## What it monitors

| Signal | Implementation | Alert behaviour |
| --- | --- | --- |
| Frontend availability and a real visitor path | Playwright loads the landing page, then the public leaderboard | Probed every 5 minutes from US East, EU West and Singapore; pages only when at least half of regions fail after cross-region retries. |
| API dependency readiness | `GET /health/ready` | Probed every 2 minutes from the same three regions; checks database, Redis, RPC and indexer readiness rather than a shallow `200` response. |
| TLS expiry and validity | Checkly alert channel's SSL monitoring | Sends the on-call mailbox an advance warning 30 days before expiry, plus normal TLS failures. |
| Public communication | Checkly public status page | Incident automation updates the API or frontend service and notifies subscribers. |

The 5-minute initial escalation and 30-minute reminders match the SEV1/SEV2
expectations in `docs/INCIDENT_RESPONSE.md`. The `on_call_email` value must
name the real rotation owner before production traffic is enabled.

## Deploy

1. Create a Checkly account and API key with permission to manage checks,
   alert channels and status pages.
2. Set secrets in the operator shell or Terraform Cloud:

   ```bash
   export TF_VAR_checkly_api_key='…'
   export TF_VAR_checkly_account_id='…'
   export TF_VAR_frontend_url='https://your-frontend.example'
   export TF_VAR_api_url='https://api.your-frontend.example'
   export TF_VAR_on_call_email='oncall@example.com'
   export TF_VAR_status_page_domain='status.your-frontend.example' # optional
   ```

3. Apply the reviewed plan:

   ```bash
   cd monitoring/checkly
   terraform init
   terraform fmt -check
   terraform validate
   terraform plan -out=monitoring.tfplan
   terraform apply monitoring.tfplan
   ```

4. Verify the generated status page from a logged-out browser, subscribe a test
   address, and perform one controlled failure. Record the result in the
   incident log before relying on it for a real incident.

Do not put Checkly keys, page recipients, or Terraform state in this repository.
Use a remote encrypted Terraform state backend with locking when more than one
operator can apply this stack.
