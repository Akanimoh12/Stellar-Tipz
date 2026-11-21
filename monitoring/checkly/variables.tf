variable "checkly_api_key" {
  description = "Checkly API key. Set with TF_VAR_checkly_api_key; never commit it."
  type        = string
  sensitive   = true
}

variable "checkly_account_id" {
  description = "Checkly account ID. Set with TF_VAR_checkly_account_id."
  type        = string
}

variable "frontend_url" {
  description = "Canonical public frontend URL, without a trailing slash."
  type        = string

  validation {
    condition     = can(regex("^https://", var.frontend_url))
    error_message = "frontend_url must be an HTTPS URL."
  }
}

variable "api_url" {
  description = "Canonical public API URL, without a trailing slash."
  type        = string

  validation {
    condition     = can(regex("^https://", var.api_url))
    error_message = "api_url must be an HTTPS URL."
  }
}

variable "on_call_email" {
  description = "Address that receives SEV1/SEV2 availability and TLS alerts under docs/INCIDENT_RESPONSE.md."
  type        = string

  validation {
    condition     = can(regex("^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$", var.on_call_email))
    error_message = "on_call_email must be a valid mailbox."
  }
}

variable "status_page_slug" {
  description = "Public Checkly status-page slug."
  type        = string
  default     = "stellar-tipz"
}

variable "status_page_domain" {
  description = "Optional verified custom status-page domain, for example status.tipz.app."
  type        = string
  default     = null
  nullable    = true
}
