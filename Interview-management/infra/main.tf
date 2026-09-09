locals {
  name = "${var.application_name}-${var.environment}"
}

module "app" {
  source           = "./modules/app"
  aws_region       = var.aws_region
  application_name = var.application_name
  environment      = var.environment
  custom_domain    = var.custom_domain
  certificate_arn  = var.certificate_arn
}

output "api_url" {
  value = module.app.api_url
}

output "cloudfront_domain" {
  value = module.app.cloudfront_domain
}

output "frontend_bucket_name" {
  value = module.app.frontend_bucket_name
}

output "cloudfront_distribution_id" {
  value = module.app.cloudfront_distribution_id
}

output "cognito_domain" {
  value = module.app.cognito_domain
}

output "cognito_client_id" {
  value = module.app.cognito_client_id
}

output "cognito_api_scopes" {
  value = module.app.cognito_api_scopes
}

output "cognito_user_pool_id" {
  value = module.app.cognito_user_pool_id
}
