#!/usr/bin/env bash
# Read-only check: is anything from the Jaanch.ai deployment still left in AWS?
# It only runs list/describe calls. It never creates, changes or deletes anything.
# Usage:  AWS_PROFILE=<profile> ./verify-clean.sh        (region defaults to ap-south-1)
set -u
REGION="${REGION:-ap-south-1}"
PREFIX="${PREFIX:-jaanch}"
export AWS_DEFAULT_REGION="$REGION"
LEFT=0

# check "label" <aws command...>   -> the command must print matching items with --output text
check() {
  local label="$1"; shift
  local out
  if ! out="$("$@" 2>&1)"; then
    printf '  [ERR ] %-34s %s\n' "$label" "$(echo "$out" | head -1)"; LEFT=$((LEFT+1)); return
  fi
  out="$(echo "$out" | sed '/^None$/d;/^$/d')"
  if [ -z "$out" ]; then
    printf '  [ OK ] %s\n' "$label"
  else
    printf '  [LEFT] %s\n' "$label"; echo "$out" | sed 's/^/           /'; LEFT=$((LEFT+1))
  fi
}

ACCOUNT="$(aws sts get-caller-identity --query Account --output text 2>/dev/null)" || { echo "AWS login not working (aws sts get-caller-identity failed)."; exit 1; }
echo "Account $ACCOUNT, region $REGION, name prefix '$PREFIX'"
echo
echo "Elastic Beanstalk"
check "environments (not terminated)" aws elasticbeanstalk describe-environments --query "Environments[?Status!='Terminated'].[EnvironmentName,Status]" --output text
check "applications"                  aws elasticbeanstalk describe-applications --query "Applications[].ApplicationName" --output text
echo "Compute and network (these cost money if left behind)"
check "EC2 instances (not terminated)" aws ec2 describe-instances --filters Name=instance-state-name,Values=pending,running,stopping,stopped --query "Reservations[].Instances[].[InstanceId,InstanceType,State.Name]" --output text
check "load balancers"                aws elbv2 describe-load-balancers --query "LoadBalancers[].LoadBalancerName" --output text
check "target groups"                 aws elbv2 describe-target-groups --query "TargetGroups[].TargetGroupName" --output text
check "auto scaling groups"           aws autoscaling describe-auto-scaling-groups --query "AutoScalingGroups[].AutoScalingGroupName" --output text
check "launch templates (awseb)"      aws ec2 describe-launch-templates --query "LaunchTemplates[?contains(LaunchTemplateName,'awseb')].LaunchTemplateName" --output text
check "elastic IPs"                   aws ec2 describe-addresses --query "Addresses[].[PublicIp,AssociationId]" --output text
check "NAT gateways"                  aws ec2 describe-nat-gateways --filter Name=state,Values=pending,available --query "NatGateways[].NatGatewayId" --output text
check "unattached EBS volumes"        aws ec2 describe-volumes --filters Name=status,Values=available --query "Volumes[].[VolumeId,Size]" --output text
check "security groups (awseb/$PREFIX)" aws ec2 describe-security-groups --query "SecurityGroups[?contains(GroupName,'awseb') || contains(GroupName,'$PREFIX')].[GroupId,GroupName]" --output text
check "CloudFormation stacks (awseb)" aws cloudformation list-stacks --stack-status-filter CREATE_IN_PROGRESS CREATE_COMPLETE UPDATE_COMPLETE UPDATE_ROLLBACK_COMPLETE ROLLBACK_COMPLETE DELETE_IN_PROGRESS DELETE_FAILED --query "StackSummaries[?starts_with(StackName,'awseb')].[StackName,StackStatus]" --output text
echo "Database"
check "RDS instances"                 aws rds describe-db-instances --query "DBInstances[].[DBInstanceIdentifier,DBInstanceStatus]" --output text
check "RDS manual snapshots"          aws rds describe-db-snapshots --snapshot-type manual --query "DBSnapshots[].DBSnapshotIdentifier" --output text
check "RDS clusters"                  aws rds describe-db-clusters --query "DBClusters[].DBClusterIdentifier" --output text
echo "Storage"
check "S3 buckets ($PREFIX*)"         aws s3api list-buckets --query "Buckets[?starts_with(Name,'$PREFIX')].Name" --output text
echo "Identity"
check "IAM roles ($PREFIX*)"          aws iam list-roles --query "Roles[?starts_with(RoleName,'$PREFIX')].RoleName" --output text
check "IAM instance profiles ($PREFIX*)" aws iam list-instance-profiles --query "InstanceProfiles[?starts_with(InstanceProfileName,'$PREFIX')].InstanceProfileName" --output text
check "IAM policies ($PREFIX*)"       aws iam list-policies --scope Local --query "Policies[?starts_with(PolicyName,'$PREFIX')].PolicyName" --output text
echo "Logs, alarms, secrets"
check "CloudWatch log groups (EB)"    aws logs describe-log-groups --log-group-name-prefix /aws/elasticbeanstalk --query "logGroups[].logGroupName" --output text
check "CloudWatch alarms (awseb)"     aws cloudwatch describe-alarms --query "MetricAlarms[?contains(AlarmName,'awseb')].AlarmName" --output text
check "Secrets Manager ($PREFIX*)"    aws secretsmanager list-secrets --query "SecretList[?starts_with(Name,'$PREFIX')].Name" --output text
check "SSM parameters (/$PREFIX*)"    aws ssm describe-parameters --query "Parameters[?starts_with(Name,'/$PREFIX')].Name" --output text
echo
echo "Expected to remain (not a problem): the shared bucket elasticbeanstalk-$REGION-$ACCOUNT, the service-linked"
echo "role AWSServiceRoleForElasticBeanstalk, and your Bedrock model access (it is account-wide, nothing to delete)."
echo
if [ "$LEFT" -eq 0 ]; then echo "RESULT: clean. Nothing from the old build is left."; else echo "RESULT: $LEFT item(s) above need a look ([LEFT] = still exists, [ERR] = could not check)."; fi
