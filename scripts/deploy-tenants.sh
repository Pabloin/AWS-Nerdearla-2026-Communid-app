#!/usr/bin/env bash
set -euo pipefail

readonly project_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
readonly tf_dir="${project_dir}/terraform/environments/tenants"
readonly expected_account="442809140287"
readonly profile="${AWS_PROFILE_NAME:-sebas}"
readonly region="${TENANTS_AWS_REGION:-us-east-2}"
readonly mode="${1:-plan}"
readonly state_bucket="${COMUNID_TENANTS_STATE_BUCKET:-comunid-terraform-state-${expected_account}}"
readonly plan_path="${tf_dir}/tenants.tfplan"

if [[ "${mode}" != "plan" && "${mode}" != "apply" ]]; then
  echo "Usage: $0 [plan|apply] (default: plan)" >&2
  exit 2
fi
if [[ "${region}" == "us-east-1" ]]; then
  echo "The regional tenants stack must be outside Argentina's us-east-1 region." >&2
  exit 2
fi
for name in CLOUDFLARE_API_TOKEN TF_VAR_cloudflare_zone_id TF_VAR_github_owner TF_VAR_github_owner_id TF_VAR_github_repo TF_VAR_github_repo_id; do
  if [[ -z "${!name:-}" ]]; then
    echo "Missing required environment variable: ${name}" >&2
    exit 2
  fi
done
actual_account="$(aws sts get-caller-identity --profile "${profile}" --query Account --output text)"
if [[ "${actual_account}" != "${expected_account}" ]]; then
  echo "Refusing to deploy into an unexpected AWS account." >&2
  exit 1
fi
export AWS_PROFILE="${profile}"
export AWS_REGION="${region}"
export TF_VAR_aws_region="${region}"
cd "${project_dir}"

# Fixed root and state key: never initialize or apply the production directory.
terraform -chdir="${tf_dir}" init -reconfigure \
  -backend-config="bucket=${state_bucket}" \
  -backend-config="key=comunid/tenants/terraform.tfstate" \
  -backend-config="region=${TENANTS_STATE_REGION:-us-east-1}" \
  -backend-config="encrypt=true" \
  -backend-config="use_lockfile=true"

if [[ "${mode}" == "plan" ]]; then
  npm run check
  npm --workspace @comunid/backend run package
  terraform -chdir="${tf_dir}" validate
  terraform -chdir="${tf_dir}" plan -out="${plan_path}"
else
  test -f "${plan_path}" || { echo "Run plan and review it before apply." >&2; exit 2; }
fi
plan_json="$(mktemp)"
trap 'rm -f "${plan_json}"' EXIT
terraform -chdir="${tf_dir}" show -json "${plan_path}" > "${plan_json}"
# This command provisions the initial independent stack. Changes to resources
# already present in a state must be reviewed through a separate update process.
if ! jq -e '[.resource_changes[]? | select(.mode == "managed") | select(.change.actions != ["create"] and .change.actions != ["no-op"])] | length == 0' "${plan_json}" >/dev/null; then
  echo "Refusing a plan that modifies or deletes existing resources." >&2
  exit 1
fi
if [[ "${mode}" == "plan" ]]; then
  echo "Tenants plan ready for review: ${plan_path}"
  echo "No infrastructure or application was deployed. Run $0 apply only after reviewing the plan."
  exit 0
fi
terraform -chdir="${tf_dir}" apply "${plan_path}"

api_url="$(terraform -chdir="${tf_dir}" output -raw api_url)"
web_bucket="$(terraform -chdir="${tf_dir}" output -raw web_bucket_name)"
distribution_id="$(terraform -chdir="${tf_dir}" output -raw distribution_id)"
lambda_name="$(terraform -chdir="${tf_dir}" output -raw lambda_name)"
if [[ "${lambda_name}" != "comunid-tenants-production-api" || "${web_bucket}" != "comunid-tenants-production-web-${expected_account}" ]]; then
  echo "Refusing to publish: outputs do not identify the independent tenants stack." >&2
  exit 1
fi
export VITE_COGNITO_USER_POOL_ID="$(terraform -chdir="${tf_dir}" output -raw cognito_user_pool_id)"
export VITE_COGNITO_CLIENT_ID="$(terraform -chdir="${tf_dir}" output -raw cognito_client_id)"
export VITE_API_BASE_URL="${api_url}"
export VITE_APP_URL="https://tenants.comunid.app/"
export VITE_PUBLIC_APP_URL="https://tenants.comunid.app"
export VITE_HOME_URL="https://comunid.app/"
export VITE_TENANT_DOMAIN="comunid.app"
export VITE_MOBILE_BASE="/app/"
export VITE_ADMIN_BASE="/admin/"
npm run build
aws s3 sync front_home/dist "s3://${web_bucket}" --delete --exclude 'app/*' --exclude 'admin/*'
aws s3 sync front_mobile/dist "s3://${web_bucket}/app" --delete
aws s3 sync front_admin/dist "s3://${web_bucket}/admin" --delete
aws cloudfront create-invalidation --distribution-id "${distribution_id}" --paths '/*' >/dev/null
echo "Independent tenants stack published in ${region}: https://tenants.comunid.app"
echo "Configure its own platform admin secret: comunid-tenants-production-admin-token"
