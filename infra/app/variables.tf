variable "aws_region" {
  type    = string
  default = "ap-south-1"
}

variable "app_name" {
  description = "Elastic Beanstalk application name"
  type        = string
  default     = "jaanch-ai"
}

variable "env_name" {
  description = "Elastic Beanstalk environment name"
  type        = string
  default     = "jaanch-ai-env"
}

variable "cname_prefix" {
  description = "Optional fixed URL prefix (<prefix>.<region>.elasticbeanstalk.com). null = AWS picks one."
  type        = string
  default     = null
}

variable "instance_type" {
  type    = string
  default = "t3.large"
}

variable "db_instance_class" {
  type    = string
  default = "db.t4g.micro"
}

variable "bedrock_model_id" {
  description = "Bedrock model the backend calls, e.g. google.gemma-3-27b-it"
  type        = string
}

variable "safe_browsing_api_key" {
  description = "Google Safe Browsing API key (optional; empty = property not set)"
  type        = string
  default     = ""
  sensitive   = true
}

variable "rate_limit_max" {
  type    = number
  default = 60
}
