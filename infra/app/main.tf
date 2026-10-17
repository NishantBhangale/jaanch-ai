data "aws_caller_identity" "me" {}

locals {
  account_id  = data.aws_caller_identity.me.account_id
  bucket_name = "jaanch-screenshots-${local.account_id}"
  has_sb_key  = nonsensitive(length(var.safe_browsing_api_key) > 0)
}

# ---------------------------------------------------------------- network --
# Same as the manual deployment: the account's default VPC, public subnets.
data "aws_vpc" "default" {
  default = true
}

data "aws_subnets" "default" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.default.id]
  }
}

# ------------------------------------------------------------- S3 bucket --
resource "aws_s3_bucket" "screenshots" {
  bucket        = local.bucket_name
  force_destroy = true # `terraform destroy` empties it first
}

resource "aws_s3_bucket_public_access_block" "screenshots" {
  bucket                  = aws_s3_bucket.screenshots.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "screenshots" {
  bucket = aws_s3_bucket.screenshots.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

# -------------------------------------------------------------------- IAM --
data "aws_iam_policy_document" "eb_service_trust" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["elasticbeanstalk.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "sts:ExternalId"
      values   = ["elasticbeanstalk"]
    }
  }
}

resource "aws_iam_role" "eb_service" {
  name               = "jaanch-eb-service-role"
  assume_role_policy = data.aws_iam_policy_document.eb_service_trust.json
}

resource "aws_iam_role_policy_attachment" "eb_service_health" {
  role       = aws_iam_role.eb_service.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSElasticBeanstalkEnhancedHealth"
}

data "aws_iam_policy_document" "ec2_trust" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ec2.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "eb_ec2" {
  name               = "jaanch-eb-ec2-role"
  assume_role_policy = data.aws_iam_policy_document.ec2_trust.json
}

resource "aws_iam_role_policy_attachment" "eb_ec2_web" {
  role       = aws_iam_role.eb_ec2.name
  policy_arn = "arn:aws:iam::aws:policy/AWSElasticBeanstalkWebTier"
}

resource "aws_iam_role_policy_attachment" "eb_ec2_ssm" {
  # Lets you open a shell from the console (Session Manager) - no SSH key needed.
  role       = aws_iam_role.eb_ec2.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

data "aws_iam_policy_document" "app" {
  statement {
    sid       = "ScreenshotBucketObjects"
    actions   = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"]
    resources = ["${aws_s3_bucket.screenshots.arn}/*"]
  }
  statement {
    sid       = "ScreenshotBucketList"
    actions   = ["s3:ListBucket"]
    resources = [aws_s3_bucket.screenshots.arn]
  }
  statement {
    sid       = "BedrockInvoke"
    actions   = ["bedrock:InvokeModel", "bedrock:InvokeModelWithResponseStream"]
    resources = ["*"]
  }
}

resource "aws_iam_role_policy" "app" {
  name   = "jaanch-app-access"
  role   = aws_iam_role.eb_ec2.id
  policy = data.aws_iam_policy_document.app.json
}

resource "aws_iam_instance_profile" "eb_ec2" {
  name = "jaanch-eb-ec2-role"
  role = aws_iam_role.eb_ec2.name
}

# -------------------------------------------------------------------- RDS --
resource "random_password" "db" {
  length  = 24
  special = false # keeps the postgres:// URL free of characters that need escaping
}

resource "aws_db_subnet_group" "db" {
  name       = "jaanch-db-subnets"
  subnet_ids = data.aws_subnets.default.ids
}

resource "aws_security_group" "db" {
  name        = "jaanch-db"
  description = "Postgres from inside the default VPC only"
  vpc_id      = data.aws_vpc.default.id

  ingress {
    description = "PostgreSQL from the VPC (the EB instances live here)"
    from_port   = 5432
    to_port     = 5432
    protocol    = "tcp"
    cidr_blocks = [data.aws_vpc.default.cidr_block]
  }
}

resource "aws_db_instance" "db" {
  identifier              = "jaanch-db"
  engine                  = "postgres"
  engine_version          = "16"
  instance_class          = var.db_instance_class
  allocated_storage       = 20
  storage_type            = "gp3"
  storage_encrypted       = true
  db_name                 = "jaanch"
  username                = "jaanch"
  password                = random_password.db.result
  db_subnet_group_name    = aws_db_subnet_group.db.name
  vpc_security_group_ids  = [aws_security_group.db.id]
  publicly_accessible     = false
  multi_az                = false
  backup_retention_period = 0
  skip_final_snapshot     = true
  deletion_protection     = false
  apply_immediately       = true

  lifecycle {
    ignore_changes = [engine_version]
  }
}

# --------------------------------------------------- application secrets --
resource "random_password" "session" {
  length  = 48
  special = false
}

resource "random_password" "searxng" {
  length  = 48
  special = false
}

# ------------------------------------------------------ Elastic Beanstalk --
data "aws_elastic_beanstalk_solution_stack" "docker" {
  most_recent = true
  name_regex  = "^64bit Amazon Linux 2023 (.*) running Docker$"
}

resource "aws_elastic_beanstalk_application" "app" {
  name        = var.app_name
  description = "Jaanch.ai link and SMS trust checker"
}

locals {
  # Plain (non-secret) properties. These are the same names as the manual .env.
  env_plain = {
    TRUST_PROXY       = "1"
    COOKIE_SECURE     = "false" # the default EB URL is plain HTTP
    CHROME_PATH       = "/usr/bin/chromium"
    CHROME_NO_SANDBOX = "true"
    S3_BUCKET         = aws_s3_bucket.screenshots.bucket
    S3_REGION         = var.aws_region
    LLM_PROVIDER      = "bedrock"
    BEDROCK_REGION    = var.aws_region
    BEDROCK_MODEL_ID  = var.bedrock_model_id
    LLM_TIMEOUT_MS    = "60000"
    SEARCH_URL        = "http://searxng:8080"
    RATE_LIMIT_MAX    = tostring(var.rate_limit_max)
    PG_SSL            = "true"
  }

  # Secret properties. Their values are marked sensitive, so Terraform prints
  # "(sensitive value)" in plan output / CI logs.
  env_secret = {
    SESSION_SECRET = random_password.session.result
    SEARXNG_SECRET = random_password.searxng.result
    DATABASE_URL   = "postgres://${aws_db_instance.db.username}:${random_password.db.result}@${aws_db_instance.db.address}:${aws_db_instance.db.port}/${aws_db_instance.db.db_name}"
  }

  # Names are not secret, so they can drive for_each.
  env_plain_names  = toset(keys(local.env_plain))
  env_secret_names = ["SESSION_SECRET", "SEARXNG_SECRET", "DATABASE_URL"]
}

resource "aws_elastic_beanstalk_environment" "env" {
  name                = var.env_name
  application         = aws_elastic_beanstalk_application.app.name
  solution_stack_name = data.aws_elastic_beanstalk_solution_stack.docker.name
  tier                = "WebServer"
  cname_prefix        = var.cname_prefix

  wait_for_ready_timeout = "30m"

  # --- instances ---
  setting {
    namespace = "aws:autoscaling:launchconfiguration"
    name      = "IamInstanceProfile"
    value     = aws_iam_instance_profile.eb_ec2.name
  }
  setting {
    namespace = "aws:ec2:instances"
    name      = "InstanceTypes"
    value     = var.instance_type
  }
  setting {
    namespace = "aws:autoscaling:launchconfiguration"
    name      = "RootVolumeType"
    value     = "gp3"
  }
  setting {
    namespace = "aws:autoscaling:launchconfiguration"
    name      = "RootVolumeSize"
    value     = "30"
  }
  setting {
    namespace = "aws:autoscaling:asg"
    name      = "MinSize"
    value     = "1"
  }
  setting {
    namespace = "aws:autoscaling:asg"
    name      = "MaxSize"
    value     = "1"
  }

  # --- load balancer / network ---
  setting {
    namespace = "aws:elasticbeanstalk:environment"
    name      = "EnvironmentType"
    value     = "LoadBalanced"
  }
  setting {
    namespace = "aws:elasticbeanstalk:environment"
    name      = "LoadBalancerType"
    value     = "application"
  }
  setting {
    namespace = "aws:elasticbeanstalk:environment"
    name      = "ServiceRole"
    value     = aws_iam_role.eb_service.name
  }
  setting {
    namespace = "aws:ec2:vpc"
    name      = "VPCId"
    value     = data.aws_vpc.default.id
  }
  setting {
    namespace = "aws:ec2:vpc"
    name      = "Subnets"
    value     = join(",", data.aws_subnets.default.ids)
  }
  setting {
    namespace = "aws:ec2:vpc"
    name      = "ELBSubnets"
    value     = join(",", data.aws_subnets.default.ids)
  }
  setting {
    namespace = "aws:ec2:vpc"
    name      = "AssociatePublicIpAddress"
    value     = "true"
  }
  setting {
    namespace = "aws:ec2:vpc"
    name      = "ELBScheme"
    value     = "public"
  }
  setting {
    namespace = "aws:elasticbeanstalk:environment:process:default"
    name      = "HealthCheckPath"
    value     = "/"
  }

  # --- platform ---
  setting {
    namespace = "aws:elasticbeanstalk:environment:proxy"
    name      = "ProxyServer"
    value     = "none" # compose publishes 80:4173 itself
  }
  setting {
    namespace = "aws:elasticbeanstalk:healthreporting:system"
    name      = "SystemType"
    value     = "enhanced"
  }
  setting {
    namespace = "aws:elasticbeanstalk:command"
    name      = "DeploymentPolicy"
    value     = "AllAtOnce"
  }
  setting {
    namespace = "aws:elasticbeanstalk:managedactions"
    name      = "ManagedActionsEnabled"
    value     = "false"
  }

  # --- logs ---
  setting {
    namespace = "aws:elasticbeanstalk:cloudwatch:logs"
    name      = "StreamLogs"
    value     = "true"
  }
  setting {
    namespace = "aws:elasticbeanstalk:cloudwatch:logs"
    name      = "DeleteOnTerminate"
    value     = "true"
  }
  setting {
    namespace = "aws:elasticbeanstalk:cloudwatch:logs"
    name      = "RetentionInDays"
    value     = "7"
  }

  # --- environment properties (EB writes them to the .env that compose reads) ---
  dynamic "setting" {
    for_each = local.env_plain_names
    content {
      namespace = "aws:elasticbeanstalk:application:environment"
      name      = setting.value
      value     = local.env_plain[setting.value]
    }
  }

  dynamic "setting" {
    for_each = toset(local.env_secret_names)
    content {
      namespace = "aws:elasticbeanstalk:application:environment"
      name      = setting.value
      value     = local.env_secret[setting.value]
    }
  }

  dynamic "setting" {
    for_each = local.has_sb_key ? ["SAFE_BROWSING_API_KEY"] : []
    content {
      namespace = "aws:elasticbeanstalk:application:environment"
      name      = setting.value
      value     = var.safe_browsing_api_key
    }
  }

  depends_on = [
    aws_iam_role_policy_attachment.eb_service_health,
    aws_iam_role_policy_attachment.eb_ec2_web,
    aws_iam_role_policy.app,
    aws_db_instance.db,
  ]
}
