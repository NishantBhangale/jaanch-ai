#!/usr/bin/env bash
# Removes the bootstrap resources (state bucket, OIDC provider, deploy role).
# Run this ONLY AFTER the "destroy" GitHub workflow has removed the app,
# because the destroy workflow itself needs these resources.
#   ./bootstrap-destroy.sh            -> shows what would be destroyed
#   APPLY=1 ./bootstrap-destroy.sh    -> destroys (asks you to type "delete")
set -euo pipefail
cd "$(dirname "$0")"

[ -f terraform.tfstate ] || { echo "No local terraform.tfstate here - run this on the machine where you ran bootstrap.sh."; exit 1; }
terraform init -input=false

if [ "${APPLY:-0}" != "1" ]; then
  terraform plan -destroy -input=false
  echo; echo "Dry run only. Re-run with APPLY=1 to destroy."
  exit 0
fi

read -r -p 'Type "delete" to remove the state bucket, OIDC provider and deploy role: ' ans
[ "$ans" = "delete" ] || { echo "Cancelled."; exit 1; }
terraform destroy -input=false -auto-approve
echo "Done. Run verify-clean.sh to confirm."
