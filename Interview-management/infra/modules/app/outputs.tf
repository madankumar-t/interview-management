output "api_url" {
  value = aws_apigatewayv2_api.http.api_endpoint
}

output "cloudfront_domain" {
  value = aws_cloudfront_distribution.frontend.domain_name
}

output "frontend_bucket_name" {
  value = aws_s3_bucket.frontend.bucket
}

output "cloudfront_distribution_id" {
  value = aws_cloudfront_distribution.frontend.id
}

output "cognito_domain" {
  value = "${aws_cognito_user_pool_domain.main.domain}.auth.${var.aws_region}.amazoncognito.com"
}

output "cognito_client_id" {
  value = aws_cognito_user_pool_client.spa.id
}

output "cognito_api_scopes" {
  value = "${aws_cognito_resource_server.api.identifier}/read ${aws_cognito_resource_server.api.identifier}/write"
}

output "cognito_user_pool_id" {
  value = aws_cognito_user_pool.main.id
}
