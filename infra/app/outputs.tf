output "app_name" {
  value = aws_elastic_beanstalk_application.app.name
}

output "env_name" {
  value = aws_elastic_beanstalk_environment.env.name
}

output "url" {
  description = "Public URL of the app (plain HTTP)"
  value       = "http://${aws_elastic_beanstalk_environment.env.cname}"
}

output "screenshots_bucket" {
  value = aws_s3_bucket.screenshots.bucket
}

output "db_endpoint" {
  value = aws_db_instance.db.address
}
