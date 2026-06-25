##
# variables.tf — Input variable declarations for the StuntCock GCP Terraform workspace.

variable "project_id" {
  description = "The GCP project ID to deploy resources into."
  type        = string
  default     = "stuntcock"
}

variable "region" {
  description = "The primary GCP region for regional resources (Cloud Run, Cloud Tasks, Artifact Registry)."
  type        = string
  default     = "us-central1"
}

variable "environment" {
  description = "Deployment environment name (e.g. prod, staging, dev). Used in resource labels."
  type        = string
  default     = "prod"
}

variable "cloud_run_image" {
  description = "Container image URI to deploy to Cloud Run. Defaults to a placeholder; replace with a real Artifact Registry image after first build."
  type        = string
  default     = "us-docker.pkg.dev/cloudrun/container/hello:latest"
}

variable "cloud_run_service_name" {
  description = "Name for the Cloud Run service."
  type        = string
  default     = "stuntcock-api"
}

variable "cloud_tasks_queue_name" {
  description = "Name for the Cloud Tasks queue."
  type        = string
  default     = "stuntcock-tasks"
}

variable "artifact_registry_repo_id" {
  description = "ID (short name) for the Artifact Registry Docker repository."
  type        = string
  default     = "stuntcock-images"
}

variable "firestore_location" {
  description = "Location for the Firestore database. Must be a multi-region or regional GCP location supported by Firestore."
  type        = string
  default     = "us-central"
}

variable "budget_monthly_usd" {
  description = "Monthly budget threshold in USD for the Cloud Monitoring billing alert."
  type        = number
  default     = 50
}

variable "budget_alert_thresholds" {
  description = "List of fractional spend thresholds at which budget alert notifications are triggered (e.g. 0.5 = 50%, 1.0 = 100%)."
  type        = list(number)
  default     = [0.5, 0.9, 1.0]
}

variable "notification_channels" {
  description = "List of Cloud Monitoring notification channel IDs to receive budget alerts. Create channels in the GCP console first."
  type        = list(string)
  default     = []
}

variable "billing_account_id" {
  description = "The GCP billing account ID associated with the project (required for budget alerts). Format: XXXXXX-XXXXXX-XXXXXX."
  type        = string
  default     = ""
}
