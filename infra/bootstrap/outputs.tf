output "aws_role_arn" {
  description = "Set as GitHub repository variable AWS_ROLE_ARN"
  value       = aws_iam_role.deploy.arn
}

output "tf_state_bucket" {
  description = "Set as GitHub repository variable TF_STATE_BUCKET"
  value       = aws_s3_bucket.state.bucket
}

output "aws_region" {
  description = "Set as GitHub repository variable AWS_REGION"
  value       = var.aws_region
}
