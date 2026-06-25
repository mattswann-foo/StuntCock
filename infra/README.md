# StuntCock — GCP Infrastructure (Terraform)

This directory contains the Terraform workspace that provisions all GCP resources required by the StuntCock platform.

## Resources provisioned

| Resource | Type | Notes |
|---|---|---|
| Artifact Registry repository | `google_artifact_registry_repository` | Docker images for the platform |
| Cloud Run service | `google_cloud_run_v2_service` | `min_scale = 0` (scale-to-zero) |
| Firestore database | `google_firestore_database` | Native mode, `(default)` database |
| Cloud Pub/Sub dead-letter topic | `google_pubsub_topic` | Receives undeliverable Cloud Tasks |
| Cloud Tasks queue | `google_cloud_tasks_queue` | Dead-letter → Pub/Sub topic |
| Secret Manager secret: `anthropic_api_key` | `google_secret_manager_secret` | Populated out-of-band |
| Secret Manager secret: `apple_iap_shared_secret` | `google_secret_manager_secret` | Populated out-of-band |
| Secret Manager secret: `google_play_service_account_json` | `google_secret_manager_secret` | Populated out-of-band |
| IAM service account: Cloud Run | `google_service_account` | Runtime identity for the API |
| IAM service account: Cloud Tasks enqueuer | `google_service_account` | Enqueues tasks; invokes Cloud Run |
| IAM binding: Firestore user | `google_project_iam_member` | `roles/datastore.user` → Cloud Run SA |
| IAM bindings: Secret Accessor (×3) | `google_secret_manager_secret_iam_member` | Cloud Run SA on each named secret |
| IAM binding: Cloud Tasks enqueuer role | `google_project_iam_member` | `roles/cloudtasks.enqueuer` |
| IAM binding: Cloud Run invoker | `google_cloud_run_v2_service_iam_member` | Tasks enqueuer SA → Cloud Run service |
| Cloud Billing budget alert | `google_billing_budget` | Conditional on `billing_account_id` |
| GCP API enablements (×9) | `google_project_service` | Cloud Run, Firestore, Tasks, etc. |

## Prerequisites

- **Terraform** ≥ 1.5.0 — [install guide](https://developer.hashicorp.com/terraform/install)
- **GCP project** with billing enabled
- **Application Default Credentials** configured:
  ```bash
  gcloud auth application-default login
  ```
- The GCP account or service account running Terraform needs the following roles on the project:
  - `roles/owner` **or** the following granular roles:
    - `roles/run.admin`
    - `roles/datastore.owner`
    - `roles/cloudtasks.admin`
    - `roles/artifactregistry.admin`
    - `roles/secretmanager.admin`
    - `roles/iam.serviceAccountAdmin`
    - `roles/iam.securityAdmin`
    - `roles/pubsub.admin`
    - `roles/billing.costsManager` (for budget alerts)
    - `roles/serviceusage.serviceUsageAdmin`

## Variables

| Variable | Default | Description |
|---|---|---|
| `project_id` | `"stuntcock"` | GCP project to deploy into |
| `region` | `"us-central1"` | Primary region for regional resources |
| `environment` | `"prod"` | Environment label (prod / staging / dev) |
| `cloud_run_image` | Google placeholder | Container image URI for Cloud Run |
| `cloud_run_service_name` | `"stuntcock-api"` | Cloud Run service name |
| `cloud_tasks_queue_name` | `"stuntcock-tasks"` | Cloud Tasks queue name |
| `artifact_registry_repo_id` | `"stuntcock-images"` | Artifact Registry repository ID |
| `firestore_location` | `"us-central"` | Firestore multi-region location |
| `budget_monthly_usd` | `50` | Monthly budget threshold in USD |
| `budget_alert_thresholds` | `[0.5, 0.9, 1.0]` | Fractional thresholds for alerts |
| `notification_channels` | `[]` | Cloud Monitoring channel IDs for alerts |
| `billing_account_id` | `""` | Billing account ID (required for budget alerts) |

## Usage

### 1. Initialise

```bash
cd infra
terraform init
```

This downloads the `hashicorp/google` and `hashicorp/google-beta` providers.

### 2. Review the plan

```bash
terraform plan \
  -var="project_id=YOUR_PROJECT_ID" \
  -var="billing_account_id=XXXXXX-XXXXXX-XXXXXX"
```

Or create a `terraform.tfvars` file (gitignored) to avoid repeating variables:

```hcl
# infra/terraform.tfvars  (do NOT commit — contains project-specific values)
project_id            = "your-gcp-project-id"
billing_account_id    = "XXXXXX-XXXXXX-XXXXXX"
environment           = "prod"
budget_monthly_usd    = 100
notification_channels = ["projects/your-project/notificationChannels/12345"]
```

Then:

```bash
terraform plan
```

### 3. Apply

```bash
terraform apply
```

Terraform will create all resources and print the outputs on completion.

### 4. Populate secrets

After `apply`, populate each Secret Manager secret out-of-band (never commit secret values):

```bash
# Anthropic API key
echo -n "sk-ant-..." | gcloud secrets versions add anthropic_api_key --data-file=-

# Apple IAP shared secret
echo -n "YOUR_SECRET" | gcloud secrets versions add apple_iap_shared_secret --data-file=-

# Google Play service account JSON
gcloud secrets versions add google_play_service_account_json \
  --data-file=path/to/service-account.json
```

### 5. Push your first image

```bash
# Authenticate Docker to Artifact Registry
gcloud auth configure-docker us-central1-docker.pkg.dev

# Tag and push
IMAGE=$(terraform output -raw artifact_registry_repo)/stuntcock-api:latest
docker build -t "$IMAGE" ../
docker push "$IMAGE"

# Update Cloud Run to use the real image
terraform apply -var="cloud_run_image=$IMAGE"
```

## Outputs

| Output | Description |
|---|---|
| `cloud_run_service_url` | HTTPS URL of the Cloud Run service |
| `artifact_registry_repo` | Docker repository URI (tag-and-push prefix) |
| `cloud_tasks_queue_name` | Fully qualified Cloud Tasks queue name |
| `cloud_run_service_account_email` | Cloud Run runtime SA email |
| `cloud_tasks_enqueuer_service_account_email` | Tasks enqueuer SA email |
| `firestore_database_name` | Firestore database name |
| `dead_letter_topic_name` | Pub/Sub dead-letter topic name |
| `secret_anthropic_api_key_id` | Secret Manager ID for Anthropic key |
| `secret_apple_iap_shared_secret_id` | Secret Manager ID for Apple IAP secret |
| `secret_google_play_service_account_json_id` | Secret Manager ID for Google Play SA JSON |

## State management

By default, Terraform stores state locally in `infra/terraform.tfstate`. For team use, configure a [GCS remote backend](https://developer.hashicorp.com/terraform/language/backend/gcs):

```hcl
# Add to main.tf → terraform {} block
backend "gcs" {
  bucket = "your-tf-state-bucket"
  prefix = "stuntcock/infra"
}
```

## Destroying resources

```bash
terraform destroy
```

> ⚠️ This will **permanently delete** all provisioned resources including the Firestore database and its data. Use with caution in production.

## Cost notes

The default configuration is designed to be low-cost:
- Cloud Run scales to zero (`min_scale = 0`) — no charge when idle.
- Cloud Tasks charges per operation (~$0.40/million tasks).
- Firestore charges per read/write/delete operation; storage at rest is ~$0.18/GiB/month.
- Artifact Registry charges for storage (~$0.10/GiB/month) after the free tier.

The budget alert (default $50/month) provides an early warning if costs exceed expectations.
