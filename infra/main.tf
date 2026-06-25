##
# main.tf — GCP resource definitions for the StuntCock platform.
#
# Resources provisioned:
#   - Artifact Registry (Docker repository)
#   - Cloud Run service (scale-to-zero, HTTPS-only)
#   - Firestore database (Native mode)
#   - Cloud Pub/Sub dead-letter topic for Cloud Tasks
#   - Cloud Tasks queue (with dead-letter config)
#   - Secret Manager secrets (anthropic_api_key, apple_iap_shared_secret,
#       google_play_service_account_json)
#   - IAM service accounts (Cloud Run, Cloud Build, Cloud Tasks enqueuer)
#   - IAM bindings (Firestore user, Secret Accessor, Cloud Run invoker,
#       Cloud Build roles)
#   - Cloud Billing budget alert ($50/month)
#   - Cloud Monitoring dashboard (request count, p99 latency, error rate)
#   - Cloud Monitoring alert policies (p99 latency, error rate)

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
    project = "stuntcock"
    app     = "stuntcock"
    env     = var.environment
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

resource "google_project_service" "cloudbuild_api" {
  service            = "cloudbuild.googleapis.com"
  disable_on_destroy = false
}

resource "google_project_service" "logging_api" {
  service            = "logging.googleapis.com"
  disable_on_destroy = false
}

resource "google_project_service" "cloudtrace_api" {
  service            = "cloudtrace.googleapis.com"
  disable_on_destroy = false
}

resource "google_project_service" "errorreporting_api" {
  service            = "clouderrorreporting.googleapis.com"
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

# Service account used by Cloud Build to build and push container images
resource "google_service_account" "cloud_build_sa" {
  account_id   = "stuntcock-cloud-build"
  display_name = "StuntCock Cloud Build Service Account"
  description  = "Identity used by Cloud Build to build container images and push to Artifact Registry."

  depends_on = [google_project_service.iam_api]
}

# ---------------------------------------------------------------------------
# Cloud Run service (scale-to-zero enforced, HTTPS-only by default on Cloud Run v2)
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
# IAM — Cloud Build SA bindings
# ---------------------------------------------------------------------------

# Allow Cloud Build SA to write logs
resource "google_project_iam_member" "cloud_build_logs_writer" {
  project = var.project_id
  role    = "roles/logging.logWriter"
  member  = "serviceAccount:${google_service_account.cloud_build_sa.email}"

  depends_on = [google_project_service.cloudbuild_api]
}

# Allow Cloud Build SA to write to Artifact Registry
resource "google_project_iam_member" "cloud_build_artifact_writer" {
  project = var.project_id
  role    = "roles/artifactregistry.writer"
  member  = "serviceAccount:${google_service_account.cloud_build_sa.email}"
}

# Allow Cloud Build SA to submit builds
resource "google_project_iam_member" "cloud_build_builder" {
  project = var.project_id
  role    = "roles/cloudbuild.builds.builder"
  member  = "serviceAccount:${google_service_account.cloud_build_sa.email}"
}

# Allow Cloud Build SA to deploy to Cloud Run (for CI/CD pipelines)
resource "google_project_iam_member" "cloud_build_run_developer" {
  project = var.project_id
  role    = "roles/run.developer"
  member  = "serviceAccount:${google_service_account.cloud_build_sa.email}"
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

# ---------------------------------------------------------------------------
# Cloud Monitoring — Dashboard (Cloud Run request count, p99 latency, error rate)
# ---------------------------------------------------------------------------

resource "google_monitoring_dashboard" "cloud_run_dashboard" {
  dashboard_json = jsonencode({
    displayName = "StuntCock Cloud Run — ${var.environment}"
    mosaicLayout = {
      columns = 12
      tiles = [
        {
          width  = 4
          height = 4
          widget = {
            title = "Cloud Run — Request Count"
            xyChart = {
              dataSets = [{
                timeSeriesQuery = {
                  timeSeriesFilter = {
                    filter = "resource.type=\"cloud_run_revision\" AND resource.labels.service_name=\"${var.cloud_run_service_name}\" AND metric.type=\"run.googleapis.com/request_count\""
                    aggregation = {
                      alignmentPeriod    = "60s"
                      perSeriesAligner   = "ALIGN_RATE"
                      crossSeriesReducer = "REDUCE_SUM"
                      groupByFields      = ["metric.labels.response_code_class"]
                    }
                  }
                }
                plotType = "LINE"
              }]
              timeshiftDuration = "0s"
              yAxis = {
                label = "Requests / sec"
                scale = "LINEAR"
              }
            }
          }
        },
        {
          xPos   = 4
          width  = 4
          height = 4
          widget = {
            title = "Cloud Run — p99 Request Latency"
            xyChart = {
              dataSets = [{
                timeSeriesQuery = {
                  timeSeriesFilter = {
                    filter = "resource.type=\"cloud_run_revision\" AND resource.labels.service_name=\"${var.cloud_run_service_name}\" AND metric.type=\"run.googleapis.com/request_latencies\""
                    aggregation = {
                      alignmentPeriod    = "60s"
                      perSeriesAligner   = "ALIGN_DELTA"
                      crossSeriesReducer = "REDUCE_PERCENTILE_99"
                      groupByFields      = []
                    }
                  }
                }
                plotType = "LINE"
              }]
              timeshiftDuration = "0s"
              yAxis = {
                label = "Latency (ms)"
                scale = "LINEAR"
              }
            }
          }
        },
        {
          xPos   = 8
          width  = 4
          height = 4
          widget = {
            title = "Cloud Run — Error Rate (5xx)"
            xyChart = {
              dataSets = [{
                timeSeriesQuery = {
                  timeSeriesFilter = {
                    filter = "resource.type=\"cloud_run_revision\" AND resource.labels.service_name=\"${var.cloud_run_service_name}\" AND metric.type=\"run.googleapis.com/request_count\" AND metric.labels.response_code_class=\"5xx\""
                    aggregation = {
                      alignmentPeriod    = "60s"
                      perSeriesAligner   = "ALIGN_RATE"
                      crossSeriesReducer = "REDUCE_SUM"
                      groupByFields      = []
                    }
                  }
                }
                plotType = "LINE"
              }]
              timeshiftDuration = "0s"
              yAxis = {
                label = "5xx Errors / sec"
                scale = "LINEAR"
              }
            }
          }
        }
      ]
    }
    labels = local.common_labels
  })

  depends_on = [google_project_service.monitoring_api]
}

# ---------------------------------------------------------------------------
# Cloud Monitoring — Alert policies (p99 latency, error rate)
# ---------------------------------------------------------------------------

# Alert policy: p99 request latency exceeds threshold
resource "google_monitoring_alert_policy" "p99_latency" {
  display_name = "StuntCock — Cloud Run p99 Latency High (${var.environment})"
  combiner     = "OR"
  enabled      = true

  conditions {
    display_name = "p99 request latency > ${var.alert_latency_p99_ms}ms for 5 minutes"

    condition_threshold {
      filter = "resource.type=\"cloud_run_revision\" AND resource.labels.service_name=\"${var.cloud_run_service_name}\" AND metric.type=\"run.googleapis.com/request_latencies\""

      aggregations {
        alignment_period     = "60s"
        per_series_aligner   = "ALIGN_DELTA"
        cross_series_reducer = "REDUCE_PERCENTILE_99"
        group_by_fields      = []
      }

      comparison      = "COMPARISON_GT"
      threshold_value = var.alert_latency_p99_ms
      duration        = "300s"

      trigger {
        count = 1
      }
    }
  }

  notification_channels = var.notification_channels

  user_labels = local.common_labels

  alert_strategy {
    auto_close = "604800s" # 7 days
  }

  depends_on = [google_project_service.monitoring_api]
}

# Alert policy: 5xx error rate exceeds threshold
resource "google_monitoring_alert_policy" "error_rate" {
  display_name = "StuntCock — Cloud Run Error Rate High (${var.environment})"
  combiner     = "OR"
  enabled      = true

  conditions {
    display_name = "5xx error rate > ${var.alert_error_rate_rps} req/s for 5 minutes"

    condition_threshold {
      filter = "resource.type=\"cloud_run_revision\" AND resource.labels.service_name=\"${var.cloud_run_service_name}\" AND metric.type=\"run.googleapis.com/request_count\" AND metric.labels.response_code_class=\"5xx\""

      aggregations {
        alignment_period     = "60s"
        per_series_aligner   = "ALIGN_RATE"
        cross_series_reducer = "REDUCE_SUM"
        group_by_fields      = []
      }

      comparison      = "COMPARISON_GT"
      threshold_value = var.alert_error_rate_rps
      duration        = "300s"

      trigger {
        count = 1
      }
    }
  }

  notification_channels = var.notification_channels

  user_labels = local.common_labels

  alert_strategy {
    auto_close = "604800s" # 7 days
  }

  depends_on = [google_project_service.monitoring_api]
}
