variable "aws_region" {
  type    = string
  default = "ap-south-1"
}

variable "github_owner" {
  type    = string
  default = "NishantBhangale"
}

variable "github_repo" {
  type    = string
  default = "jaanch-ai"
}

variable "github_owner_id" {
  description = "Numeric GitHub user id (the part after @ in the token's sub)"
  type        = string
  default     = "60780073"
}

variable "github_repo_id" {
  description = "Numeric GitHub repository id (the part after @ in the token's sub)"
  type        = string
  default     = "1413558717"
}
