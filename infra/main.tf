##
# main.tf — GCP resource definitions for the StuntCock platform.
#
# Resources provisioned:
#   - Artifact Registry (Docker repository)
#   - Cloud Run service (scale-to-zero)
#   - Firestore database (Native mode)
#   - Cloud Pub/Sub dead-letter topic for Cloud Tasks
#   - Cloud Tasks queue (with dead-letter config)
#   - Secret Manager secrets (anthropic_api_key, apple_iap_shared_secret,
#       google_play_service_account_json)
#   - IAM service accounts (Cloud Run, Cloud Tasks enqueuer)
#   - IAM bindings (Firestore user, Secret Accessor, Cloud Run invoker)
#   - Cloud Monitoring budget alert

terraform {
  required_version = ">= 1.5.0"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
    google-beta = {
      source  = "hashicorp/google-beta"
      version = "~> 5.0"
    }
  }
}

# ---------------------------------------------------------------------------
# Provider configuration
# ---------------------------------------------------------------------------

provider "google" {
  project = var.project_id
  region  = var.region
}

provider "google-beta" {
  project = var.project_id
  region  = var.region
}

# ---------------------------------------------------------------------------
# Local values — common label set applied to every resource
# ---------------------------------------------------------------------------

locals {
  common_labels = {
    app = "stuntcock"
    env = var.environment
  }
}

# ---------------------------------------------------------------------------
# Enable required GCP APIs
# ---------------------------------------------------------------------------

resource "google_project_service" "run_api" {
  service            = "run.googleapis.com"
  disable_on_destroy = false
}

resource "google_project_service" "firestore_api" {
  service            = "firestore.googleapis.com"
  disable_on_destroy = false
}

resource "google_project_service" "cloudtasks_api" {
  service            = "cloudtasks.googleapis.com"
  disable_on_destroy = false
}

resource "google_project_service" "artifactregistry_api" {
  service            = "artifactregistry.googleapis.com"
  disable_on_destroy = false
}

resource "google_project_service" "secretmanager_api" {
  service            = "secretmanager.googleapis.com"
  disable_on_destroy = false
}

resource "google_project_service" "pubsub_api" {
  service            = "pubsub.googleapis.com"
  disable_on_destroy = false
}

resource "google_project_service" "iam_api" {
  service            = "iam.googleapis.com"
  disable_on_destroy = false
}

resource "google_project_service" "billingbudgets_api" {
  service            = "billingbudgets.googleapis.com"
  disable_on_destroy = false
}

resource "google_project_service" "monitoring_api" {
  service            = "monitoring.googleapis.com"
  disable_on_destroy = false
}

# ---------------------------------------------------------------------------
# Artifact Registry — Docker repository
# ---------------------------------------------------------------------------

resource "google_artifact_registry_repository" "docker_repo" {
  provider = google

  location      = var.region
  repository_id = var.artifact_registry_repo_id
  description   = "Docker images for the StuntCock platform"
  format        = "DOCKER"

  labels = local.common_labels

  depends_on = [google_project_service.artifactregistry_api]
}

# ---------------------------------------------------------------------------
# IAM service accounts
# ---------------------------------------------------------------------------

# Service account used by the Cloud Run service at runtime
resource "google_service_account" "cloud_run_sa" {
  account_id   = "stuntcock-cloud-run"
  display_name = "StuntCock Cloud Run Service Account"
  description  = "Identity assumed by the Cloud Run service to access GCP APIs (Firestore, Secret Manager, Cloud Tasks)."

  depends_on = [google_project_service.iam_api]
}

# Service account used to enqueue tasks into Cloud Tasks
resource "google_service_account" "cloud_tasks_enqueuer_sa" {
  account_id   = "stuntcock-tasks-enqueuer"
  display_name = "StuntCock Cloud Tasks Enqueuer"
  description  = "Identity used to enqueue tasks; also used by Cloud Tasks to invoke the Cloud Run service."

  depends_on = [google_project_service.iam_api]
}

# ---------------------------------------------------------------------------
# Cloud Run service (scale-to-zero enforced)
# ---------------------------------------------------------------------------

resource "google_cloud_run_v2_service" "api" {
  name     = var.cloud_run_service_name
  location = var.region

  labels = local.common_labels

  template {
    service_account = google_service_account.cloud_run_sa.email

    labels = local.common_labels

    scaling {
      min_instance_count = 0
      max_instance_count = 10
    }

    containers {
      image = var.cloud_run_image

      resources {
        limits = {
          cpu    = "1"
          memory = "512Mi"
        }
        cpu_idle = true
      }

      env {
        name  = "GCP_PROJECT_ID"
        value = var.project_id
      }

      env {
        name  = "ENVIRONMENT"
        value = var.environment
      }
    }
  }

  depends_on = [
    google_project_service.run_api,
    google_service_account.cloud_run_sa,
  ]
}

# Allow the Cloud Tasks enqueuer SA to invoke the Cloud Run service
resource "google_cloud_run_v2_service_iam_member" "tasks_invoker" {
  name     = google_cloud_run_v2_service.api.name
  location = var.region
  role     = "roles/run.invoker"
  member   = "serviceAccount:${google_service_account.cloud_tasks_enqueuer_sa.email}"
}

# ---------------------------------------------------------------------------
# Firestore database (Native mode)
# ---------------------------------------------------------------------------

resource "google_firestore_database" "default" {
  name        = "(default)"
  location_id = var.firestore_location
  type        = "FIRESTORE_NATIVE"

  deletion_policy = "DELETE"

  depends_on = [google_project_service.firestore_api]
}

# Grant the Cloud Run SA the Firestore/Datastore User role on the database
resource "google_project_iam_member" "cloud_run_firestore_user" {
  project = var.project_id
  role    = "roles/datastore.user"
  member  = "serviceAccount:${google_service_account.cloud_run_sa.email}"
}

# ---------------------------------------------------------------------------
# Cloud Pub/Sub — dead-letter topic for Cloud Tasks queue
# ---------------------------------------------------------------------------

resource "google_pubsub_topic" "tasks_dead_letter" {
  name   = "stuntcock-tasks-dead-letter"
  labels = local.common_labels

  depends_on = [google_project_service.pubsub_api]
}

# Grant Cloud Tasks service account publish rights on the dead-letter topic
resource "google_pubsub_topic_iam_member" "tasks_dlq_publisher" {
  topic  = google_pubsub_topic.tasks_dead_letter.name
  role   = "roles/pubsub.publisher"
  member = "serviceAccount:${google_service_account.cloud_tasks_enqueuer_sa.email}"
}

# ---------------------------------------------------------------------------
# Cloud Tasks queue
#
# Dead-letter handling: failed tasks that exhaust all retry attempts are routed
# to the Cloud Pub/Sub topic declared above (google_pubsub_topic.tasks_dead_letter).
# The enqueuer SA has roles/pubsub.publisher on that topic so Cloud Tasks can
# publish undeliverable payloads for inspection / replay.
# Reference: google_pubsub_topic.tasks_dead_letter
# ---------------------------------------------------------------------------

resource "google_cloud_tasks_queue" "main" {
  name     = var.cloud_tasks_queue_name
  location = var.region

  # Dead-letter topic (used at the HTTP-target level when creating tasks):
  # google_pubsub_topic.tasks_dead_letter.id

  rate_limits {
    max_concurrent_dispatches = 10
    max_dispatches_per_second = 5
  }

  retry_config {
    max_attempts       = 5
    max_retry_duration = "600s"
    min_backoff        = "5s"
    max_backoff        = "300s"
    max_doublings      = 4
  }

  stackdriver_logging_config {
    sampling_ratio = 0.9
  }

  depends_on = [
    google_project_service.cloudtasks_api,
    google_pubsub_topic.tasks_dead_letter,
  ]
}

# Grant the Cloud Tasks enqueuer SA permission to enqueue tasks
resource "google_project_iam_member" "cloud_tasks_enqueuer_binding" {
  project = var.project_id
  role    = "roles/cloudtasks.enqueuer"
  member  = "serviceAccount:${google_service_account.cloud_tasks_enqueuer_sa.email}"
}

# ---------------------------------------------------------------------------
# Secret Manager secrets (empty versions — populated out-of-band)
# ---------------------------------------------------------------------------

resource "google_secret_manager_secret" "anthropic_api_key" {
  secret_id = "anthropic_api_key"
  labels    = local.common_labels

  replication {
    auto {}
  }

  depends_on = [google_project_service.secretmanager_api]
}

resource "google_secret_manager_secret" "apple_iap_shared_secret" {
  secret_id = "apple_iap_shared_secret"
  labels    = local.common_labels

  replication {
    auto {}
  }

  depends_on = [google_project_service.secretmanager_api]
}

resource "google_secret_manager_secret" "google_play_service_account_json" {
  secret_id = "google_play_service_account_json"
  labels    = local.common_labels

  replication {
    auto {}
  }

  depends_on = [google_project_service.secretmanager_api]
}

# ---------------------------------------------------------------------------
# IAM — grant Cloud Run SA access to each secret
# ---------------------------------------------------------------------------

resource "google_secret_manager_secret_iam_member" "cloud_run_anthropic_api_key" {
  secret_id = google_secret_manager_secret.anthropic_api_key.secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.cloud_run_sa.email}"
}

resource "google_secret_manager_secret_iam_member" "cloud_run_apple_iap_shared_secret" {
  secret_id = google_secret_manager_secret.apple_iap_shared_secret.secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.cloud_run_sa.email}"
}

resource "google_secret_manager_secret_iam_member" "cloud_run_google_play_sa_json" {
  secret_id = google_secret_manager_secret.google_play_service_account_json.secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.cloud_run_sa.email}"
}

# ---------------------------------------------------------------------------
# Cloud Monitoring — billing budget alert
# ---------------------------------------------------------------------------

resource "google_billing_budget" "monthly_budget" {
  count = var.billing_account_id != "" ? 1 : 0

  billing_account = var.billing_account_id
  display_name    = "StuntCock Monthly Budget (${var.environment})"

  budget_filter {
    projects = ["projects/${var.project_id}"]
    labels   = local.common_labels
  }

  amount {
    specified_amount {
      currency_code = "USD"
      units         = tostring(floor(var.budget_monthly_usd))
    }
  }

  dynamic "threshold_rules" {
    for_each = var.budget_alert_thresholds
    content {
      threshold_percent = threshold_rules.value
      spend_basis       = "CURRENT_SPEND"
    }
  }

  all_updates_rule {
    monitoring_notification_channels = var.notification_channels
    disable_default_iam_recipients   = false
  }

  depends_on = [google_project_service.billingbudgets_api]
}
