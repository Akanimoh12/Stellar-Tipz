terraform {
  required_version = ">= 1.6.0"

  required_providers {
    checkly = {
      source  = "checkly/checkly"
      version = "1.7.1"
    }
  }
}

provider "checkly" {
  api_key    = var.checkly_api_key
  account_id = var.checkly_account_id
}

locals {
  # One Americas, Europe, and Asia-Pacific probe. A failure must be observed
  # from more than one place before it pages, which suppresses local outages.
  public_locations = ["us-east-1", "eu-west-1", "ap-southeast-1"]
}

resource "checkly_alert_channel" "on_call" {
  email {
    address = var.on_call_email
  }

  send_failure         = true
  send_recovery        = true
  send_degraded        = true
  ssl_expiry           = true
  ssl_expiry_threshold = 30
}

resource "checkly_status_page_service" "frontend" {
  name = "Stellar Tipz Web App"
}

resource "checkly_status_page_service" "api" {
  name = "Stellar Tipz API"
}

resource "checkly_status_page" "public" {
  name          = "Stellar Tipz Status"
  url           = var.status_page_slug
  custom_domain = var.status_page_domain
  default_theme = "AUTO"
  redirect_to   = var.frontend_url

  card {
    name = "Customer services"

    service_attachment {
      service_id = checkly_status_page_service.frontend.id
    }

    service_attachment {
      service_id = checkly_status_page_service.api.id
    }
  }
}

resource "checkly_check" "frontend_user_flow" {
  name      = "Production frontend: landing to leaderboard"
  type      = "BROWSER"
  activated = true
  frequency = 5
  locations = local.public_locations
  runtime_id = "2023.02"
  script = replace(
    file("${path.module}/scripts/frontend-user-flow.spec.js"),
    "__FRONTEND_URL__",
    jsonencode(var.frontend_url),
  )

  # A regional blip is retried from another location before a page is sent.
  retry_strategy {
    type                 = "FIXED"
    base_backoff_seconds = 30
    max_duration_seconds = 180
    max_retries          = 2
    same_region          = false
  }

  alert_settings {
    escalation_type = "TIME_BASED"

    time_based_escalation {
      minutes_failing_threshold = 5
    }

    reminders {
      amount   = 100000
      interval = 30
    }

    parallel_run_failure_threshold {
      enabled    = true
      percentage = 50
    }
  }

  alert_channel_subscription {
    channel_id = checkly_alert_channel.on_call.id
    activated  = true
  }

  trigger_incident {
    name               = "Frontend availability incident"
    description        = "The monitored landing-to-leaderboard user flow is failing from multiple external locations."
    severity           = "MAJOR"
    service_id         = checkly_status_page_service.frontend.id
    notify_subscribers = true
  }
}

resource "checkly_check" "api_readiness" {
  name                      = "Production API: readiness"
  type                      = "API"
  activated                 = true
  frequency                 = 2
  locations                 = local.public_locations
  degraded_response_time    = 3000
  max_response_time         = 10000
  use_global_alert_settings = false

  request {
    url              = "${trimsuffix(var.api_url, "/")}/health/ready"
    follow_redirects = true
    skip_ssl         = false

    assertion {
      source     = "STATUS_CODE"
      comparison = "EQUALS"
      target     = "200"
    }
  }

  retry_strategy {
    type                 = "FIXED"
    base_backoff_seconds = 30
    max_duration_seconds = 180
    max_retries          = 2
    same_region          = false
  }

  alert_settings {
    escalation_type = "TIME_BASED"

    time_based_escalation {
      minutes_failing_threshold = 5
    }

    reminders {
      amount   = 100000
      interval = 30
    }

    parallel_run_failure_threshold {
      enabled    = true
      percentage = 50
    }
  }

  alert_channel_subscription {
    channel_id = checkly_alert_channel.on_call.id
    activated  = true
  }

  trigger_incident {
    name               = "API availability incident"
    description        = "The public readiness endpoint is failing from multiple external locations."
    severity           = "MAJOR"
    service_id         = checkly_status_page_service.api.id
    notify_subscribers = true
  }
}

output "public_status_page_url" {
  value       = "https://status.checklyhq.com/${var.status_page_slug}"
  description = "Publish this URL in the frontend footer and incident runbook after apply."
}
