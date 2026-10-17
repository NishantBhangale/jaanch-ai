terraform {
  required_version = ">= 1.10"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.80"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }

  # Bucket / key / region are passed by the workflow:
  #   terraform init -backend-config="bucket=..." -backend-config="key=..." ...
  backend "s3" {}
}

provider "aws" {
  region = var.aws_region
  default_tags {
    tags = { Project = "jaanch-ai", ManagedBy = "terraform" }
  }
}
