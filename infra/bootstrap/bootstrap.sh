#!/usr/bin/env bash
# One-time setup. Run from your laptop with your own AWS credentials:
#   ./bootstrap.sh            -> terraform plan only
#   APPLY=1 ./bootstrap.sh    -> create the state bucket, OIDC provider and role
set -euo pipefail
cd "$(dirname "$0")"

command -v terraform >/dev/null || { echo "terraform not found"; exit 1; }
command -v aws >/dev/null       || { echo "aws cli not found"; exit 1; }

echo "AWS identity:"
aws sts get-caller-identity --output table

terraform init -input=false
terraform validate

if [ "${APPLY:-0}" != "1" ]; then
  terraform plan -input=false
  echo
  echo "Dry run only. Re-run with APPLY=1 to create these resources."
  exit 0
fi

terraform apply -input=false -auto-approve

ROLE_ARN=$(terraform output -raw aws_role_arn)
BUCKET=$(terraform output -raw tf_state_bucket)
REGION=$(terraform output -raw aws_region)

cat <<MSG

============================================================
Bootstrap done. Add these GitHub *repository variables*
(Settings > Secrets and variables > Actions > Variables):

  AWS_ROLE_ARN    = $ROLE_ARN
  TF_STATE_BUCKET = $BUCKET
  AWS_REGION      = $REGION

or, with the GitHub CLI (gh auth login first):

  gh variable set AWS_ROLE_ARN    --body "$ROLE_ARN"
  gh variable set TF_STATE_BUCKET --body "$BUCKET"
  gh variable set AWS_REGION      --body "$REGION"
============================================================
MSG
