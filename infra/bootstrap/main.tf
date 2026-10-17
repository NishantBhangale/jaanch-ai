# One-time bootstrap, applied BY HAND from your laptop (local state).
# Creates the two things the CD pipeline needs before it can run:
#   1. an S3 bucket that holds the Terraform state of infra/app
#   2. a GitHub OIDC identity provider + an IAM role the workflows assume
#      (no AWS access keys are ever stored in GitHub)
terraform {
  required_version = ">= 1.10"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.80"
    }
  }
}

provider "aws" {
  region = var.aws_region
  default_tags {
    tags = { Project = "jaanch-ai", ManagedBy = "terraform-bootstrap" }
  }
}

data "aws_caller_identity" "me" {}

locals {
  account_id   = data.aws_caller_identity.me.account_id
  state_bucket = "jaanch-tfstate-${local.account_id}"
  repo         = "${var.github_owner}/${var.github_repo}"
  # GitHub now puts the immutable numeric IDs in the token's `sub`:
  #   repo:<owner>@<owner_id>/<repo>@<repo_id>:ref:refs/heads/main
  # (shown by the "Debug OIDC claims" step). The trust policy must match that.
  sub_prefix = "repo:${var.github_owner}@${var.github_owner_id}/${var.github_repo}@${var.github_repo_id}"
}

# ---------- 1. Terraform state bucket ----------
resource "aws_s3_bucket" "state" {
  bucket        = local.state_bucket
  force_destroy = true # lets bootstrap-destroy.sh remove it with its contents
}

resource "aws_s3_bucket_versioning" "state" {
  bucket = aws_s3_bucket.state.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "state" {
  bucket = aws_s3_bucket.state.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "state" {
  bucket                  = aws_s3_bucket.state.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# ---------- 2. GitHub OIDC provider ----------
resource "aws_iam_openid_connect_provider" "github" {
  url            = "https://token.actions.githubusercontent.com"
  client_id_list = ["sts.amazonaws.com"]
  # AWS no longer validates this value for GitHub, but older provider
  # versions still require the argument.
  thumbprint_list = ["6938fd4d98bab03faadb97b34396831e3780aea1"]
}

# ---------- 3. Role the workflows assume ----------
data "aws_iam_policy_document" "trust" {
  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]
    principals {
      type        = "Federated"
      identifiers = [aws_iam_openid_connect_provider.github.arn]
    }
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }
    # Only THIS repo (pinned by its numeric IDs, so a renamed or re-created
    # repo with the same name cannot use the role), and only: the main branch,
    # or jobs that use the "production" / "destroy" GitHub environments
    # (those need approval).
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:sub"
      values = [
        "${local.sub_prefix}:ref:refs/heads/main",
        "${local.sub_prefix}:environment:production",
        "${local.sub_prefix}:environment:destroy",
      ]
    }
  }
}

resource "aws_iam_role" "deploy" {
  name                 = "jaanch-github-deploy"
  assume_role_policy   = data.aws_iam_policy_document.trust.json
  max_session_duration = 7200 # an Elastic Beanstalk create can take 10-20 min
}

# Not AdministratorAccess: only the services Jaanch uses. IAM is limited to
# roles / instance profiles named jaanch-eb-* (this deploy role is NOT
# matched, so the pipeline cannot edit its own permissions).
data "aws_iam_policy_document" "deploy" {
  statement {
    sid = "Services"
    actions = [
      "elasticbeanstalk:*",
      "ec2:*",
      "autoscaling:*",
      "elasticloadbalancing:*",
      "cloudformation:*",
      "cloudwatch:*",
      "logs:*",
      "rds:*",
      "sns:*",
    ]
    resources = ["*"]
  }

  statement {
    sid       = "ReadPlatformParameters"
    actions   = ["ssm:GetParameter", "ssm:GetParameters", "ssm:GetParametersByPath"]
    resources = ["*"]
  }

  statement {
    sid       = "RdsEncryption"
    actions   = ["kms:DescribeKey", "kms:CreateGrant", "kms:ListAliases", "kms:Encrypt", "kms:Decrypt", "kms:GenerateDataKey*"]
    resources = ["*"]
  }

  statement {
    sid     = "Buckets"
    actions = ["s3:*"]
    resources = [
      "arn:aws:s3:::jaanch-*",
      "arn:aws:s3:::jaanch-*/*",
      "arn:aws:s3:::elasticbeanstalk-*",
      "arn:aws:s3:::elasticbeanstalk-*/*",
    ]
  }

  statement {
    sid       = "ListBucketsForLookup"
    actions   = ["s3:ListAllMyBuckets", "s3:GetBucketLocation"]
    resources = ["*"]
  }

  statement {
    sid = "ManageAppRolesOnly"
    actions = [
      "iam:CreateRole", "iam:DeleteRole", "iam:GetRole", "iam:UpdateRole",
      "iam:TagRole", "iam:UntagRole", "iam:UpdateAssumeRolePolicy",
      "iam:AttachRolePolicy", "iam:DetachRolePolicy", "iam:ListAttachedRolePolicies",
      "iam:PutRolePolicy", "iam:GetRolePolicy", "iam:DeleteRolePolicy", "iam:ListRolePolicies",
      "iam:ListInstanceProfilesForRole", "iam:PassRole",
      "iam:CreateInstanceProfile", "iam:DeleteInstanceProfile", "iam:GetInstanceProfile",
      "iam:AddRoleToInstanceProfile", "iam:RemoveRoleFromInstanceProfile",
      "iam:TagInstanceProfile", "iam:UntagInstanceProfile",
    ]
    resources = [
      "arn:aws:iam::${local.account_id}:role/jaanch-eb-*",
      "arn:aws:iam::${local.account_id}:instance-profile/jaanch-eb-*",
    ]
  }

  statement {
    sid       = "ReadManagedPolicies"
    actions   = ["iam:GetPolicy", "iam:GetPolicyVersion", "iam:ListPolicyVersions"]
    resources = ["arn:aws:iam::aws:policy/*"]
  }

  statement {
    sid       = "ServiceLinkedRoles"
    actions   = ["iam:CreateServiceLinkedRole", "iam:GetRole"]
    resources = ["arn:aws:iam::${local.account_id}:role/aws-service-role/*"]
  }
}

resource "aws_iam_policy" "deploy" {
  name   = "jaanch-github-deploy"
  policy = data.aws_iam_policy_document.deploy.json
}

resource "aws_iam_role_policy_attachment" "deploy" {
  role       = aws_iam_role.deploy.name
  policy_arn = aws_iam_policy.deploy.arn
}
