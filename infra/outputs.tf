##
# outputs.tf — Exported values from the StuntCock GCP Terraform workspace.

output "cloud_run_service_url" {
  description = "The HTTPS URL of the deployed Cloud Run service."
  value       = google_cloud_run_v2_service.api.uri
}

output "artifact_registry_repo" {
  description = "The fully qualified hostname/path of the Artifact Registry Docker repository. Use this as a prefix when tagging and pushing images (e.g. docker push <repo>/my-image:tag)."
  value       = "${var.region}-docker.pkg.dev/${var.project_id}/${var.artifact_registry_repo_id}"
}

output "cloud_tasks_queue_name" {
  description = "The fully qualified name of the Cloud Tasks queue."
  value       = google_cloud_tasks_queue.main.id
}

output "cloud_run_service_account_email" {
  description = "Email of the Cloud Run service account. Use this to grant additional IAM roles as needed."
  value       = google_service_account.cloud_run_sa.email
}

output "cloud_tasks_enqueuer_service_account_email" {
  description = "Email of the Cloud Tasks enqueuer service account."
  value       = google_service_account.cloud_tasks_enqueuer_sa.email
}

output "firestore_database_name" {
  description = "Name of the Firestore database."
  value       = google_firestore_database.default.name
}

output "dead_letter_topic_name" {
  description = "The Cloud Pub/Sub dead-letter topic for failed Cloud Tasks deliveries."
  value       = google_pubsub_topic.tasks_dead_letter.name
}

output "secret_anthropic_api_key_id" {
  description = "Secret Manager secret ID for the Anthropic API key. Populate the secret version out-of-band before deploying."
  value       = google_secret_manager_secret.anthropic_api_key.secret_id
}

output "secret_apple_iap_shared_secret_id" {
  description = "Secret Manager secret ID for the Apple IAP shared secret."
  value       = google_secret_manager_secret.apple_iap_shared_secret.secret_id
}

output "secret_google_play_service_account_json_id" {
  description = "Secret Manager secret ID for the Google Play service account JSON."
  value       = google_secret_manager_secret.google_play_service_account_json.secret_id
}
