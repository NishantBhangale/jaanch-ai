#!/usr/bin/env bash
# Deletes the leftovers of the manual Jaanch.ai deployment that verify-clean.sh reported:
#   1. Elastic Beanstalk application (and its uploaded versions)
#   2. S3 screenshots bucket (emptied first)
#   3. IAM roles, their policies and the instance profile
#   4. CloudWatch log groups of the EB environment
# It touches ONLY the names below. It never touches other environments (for example Tws-labs-env).
#
#   ./cleanup-leftovers.sh            -> dry run: prints what it would do, changes nothing
#   APPLY=1 ./cleanup-leftovers.sh    -> really deletes (asks you to type a confirmation first)
set -u
REGION="${REGION:-ap-south-1}"
APP_NAME="${APP_NAME:-jaanch-ai}"
ENV_NAME="${ENV_NAME:-jaanch-ai-env}"
ROLES="${ROLES:-jaanch-eb-ec2-role jaanch-eb-service-role}"
PROFILES="${PROFILES:-jaanch-eb-ec2-role}"
APPLY="${APPLY:-0}"
export AWS_DEFAULT_REGION="$REGION"

ACCOUNT="$(aws sts get-caller-identity --query Account --output text 2>/dev/null)" || { echo "AWS login not working."; exit 1; }
BUCKET="${BUCKET:-jaanch-screenshots-$ACCOUNT}"
LOG_PREFIX="/aws/elasticbeanstalk/$ENV_NAME/"

run() { if [ "$APPLY" = 1 ]; then echo "  + $*"; "$@" || echo "    (failed, continuing)"; else echo "  [dry-run] $*"; fi; }
words() { tr '\t' '\n' | sed '/^None$/d;/^$/d'; }

echo "Account $ACCOUNT, region $REGION"
echo "Will remove: EB application '$APP_NAME', bucket '$BUCKET', roles [$ROLES], instance profiles [$PROFILES], log groups under '$LOG_PREFIX'"
[ "$APPLY" = 1 ] && echo "MODE: APPLY (real deletion)" || echo "MODE: dry run (nothing is changed; run with APPLY=1 to delete)"
if [ "$APPLY" = 1 ]; then
  printf "Type the application name (%s) to continue: " "$APP_NAME"; read -r ans
  [ "$ans" = "$APP_NAME" ] || { echo "Not confirmed. Nothing deleted."; exit 1; }
fi

echo; echo "1) Elastic Beanstalk application"
if aws elasticbeanstalk describe-applications --application-names "$APP_NAME" --query 'Applications[0].ApplicationName' --output text 2>/dev/null | grep -qx "$APP_NAME"; then
  live="$(aws elasticbeanstalk describe-environments --application-name "$APP_NAME" --query "Environments[?Status!='Terminated'].EnvironmentName" --output text | words)"
  if [ -n "$live" ]; then echo "  STOP: environments still running: $live (terminate them first)"; else
    for v in $(aws elasticbeanstalk describe-application-versions --application-name "$APP_NAME" --query 'ApplicationVersions[].VersionLabel' --output text | words); do
      run aws elasticbeanstalk delete-application-version --application-name "$APP_NAME" --version-label "$v" --delete-source-bundle
    done
    run aws elasticbeanstalk delete-application --application-name "$APP_NAME"
  fi
else echo "  already gone"; fi

echo; echo "2) S3 bucket"
if aws s3api head-bucket --bucket "$BUCKET" 2>/dev/null; then
  if [ "$APPLY" = 1 ]; then printf "  Type the bucket name (%s) to empty and delete it: " "$BUCKET"; read -r b; [ "$b" = "$BUCKET" ] || { echo "  skipped bucket"; b=""; }; else b="$BUCKET"; fi
  [ -n "${b:-}" ] && run aws s3 rb "s3://$BUCKET" --force
else echo "  already gone"; fi

echo; echo "3) IAM roles and instance profiles"
for r in $ROLES; do
  if aws iam get-role --role-name "$r" >/dev/null 2>&1; then
    echo " role $r"
    for p in $(aws iam list-attached-role-policies --role-name "$r" --query 'AttachedPolicies[].PolicyArn' --output text | words); do run aws iam detach-role-policy --role-name "$r" --policy-arn "$p"; done
    for p in $(aws iam list-role-policies --role-name "$r" --query 'PolicyNames' --output text | words); do run aws iam delete-role-policy --role-name "$r" --policy-name "$p"; done
    for ip in $(aws iam list-instance-profiles-for-role --role-name "$r" --query 'InstanceProfiles[].InstanceProfileName' --output text | words); do run aws iam remove-role-from-instance-profile --instance-profile-name "$ip" --role-name "$r"; done
  else echo " role $r already gone"; fi
done
for ip in $PROFILES; do
  if aws iam get-instance-profile --instance-profile-name "$ip" >/dev/null 2>&1; then run aws iam delete-instance-profile --instance-profile-name "$ip"; else echo " instance profile $ip already gone"; fi
done
for r in $ROLES; do aws iam get-role --role-name "$r" >/dev/null 2>&1 && run aws iam delete-role --role-name "$r"; done

echo; echo "4) CloudWatch log groups ($LOG_PREFIX*)"
groups="$(aws logs describe-log-groups --log-group-name-prefix "$LOG_PREFIX" --query 'logGroups[].logGroupName' --output text | words)"
if [ -z "$groups" ]; then echo "  none"; else for g in $groups; do run aws logs delete-log-group --log-group-name "$g"; done; fi

echo; echo "Done. Run ./verify-clean.sh to confirm."
