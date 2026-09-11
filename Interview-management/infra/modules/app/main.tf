locals {
  prefix = "${var.application_name}-${var.environment}"
}

data "aws_caller_identity" "current" {}

resource "aws_dynamodb_table" "main" {
  name         = local.prefix
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "pk"
  range_key    = "sk"

  attribute {
    name = "pk"
    type = "S"
  }
  attribute {
    name = "sk"
    type = "S"
  }
  attribute {
    name = "gsi1pk"
    type = "S"
  }
  attribute {
    name = "gsi1sk"
    type = "S"
  }
  attribute {
    name = "gsi2pk"
    type = "S"
  }
  attribute {
    name = "gsi2sk"
    type = "S"
  }
  attribute {
    name = "gsi3pk"
    type = "S"
  }
  attribute {
    name = "gsi3sk"
    type = "S"
  }

  global_secondary_index {
    name            = "gsi1"
    hash_key        = "gsi1pk"
    range_key       = "gsi1sk"
    projection_type = "ALL"
  }
  global_secondary_index {
    name            = "gsi2"
    hash_key        = "gsi2pk"
    range_key       = "gsi2sk"
    projection_type = "ALL"
  }
  global_secondary_index {
    name            = "gsi3"
    hash_key        = "gsi3pk"
    range_key       = "gsi3sk"
    projection_type = "ALL"
  }

  point_in_time_recovery { enabled = true }
  server_side_encryption { enabled = true }
  deletion_protection_enabled = var.environment == "prod"
}

resource "aws_s3_bucket" "frontend" {
  bucket = "${local.prefix}-frontend"
}

resource "aws_s3_bucket_public_access_block" "frontend" {
  bucket                  = aws_s3_bucket.frontend.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket" "documents" {
  bucket = "${local.prefix}-documents"
}

resource "aws_s3_bucket_public_access_block" "documents" {
  bucket                  = aws_s3_bucket.documents.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_cloudfront_origin_access_control" "frontend" {
  name                              = "${local.prefix}-oac"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

resource "aws_cloudfront_function" "spa_router" {
  name    = "${local.prefix}-spa-router"
  runtime = "cloudfront-js-1.0"
  publish = true
  code    = <<EOF
function handler(event) {
  var req = event.request;
  var uri = req.uri;
  if (uri.startsWith('/assets/') || uri.includes('.')) {
    return req;
  }
  req.uri = '/index.html';
  return req;
}
EOF
}

resource "aws_cloudfront_distribution" "frontend" {
  enabled             = true
  default_root_object = "index.html"

  origin {
    domain_name              = aws_s3_bucket.frontend.bucket_regional_domain_name
    origin_id                = "frontend-origin"
    origin_access_control_id = aws_cloudfront_origin_access_control.frontend.id
  }

  default_cache_behavior {
    target_origin_id       = "frontend-origin"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD"]
    compress               = true
    forwarded_values {
      query_string = false
      cookies { forward = "none" }
    }
    min_ttl     = 0
    default_ttl = 60
    max_ttl     = 300
    function_association {
      event_type   = "viewer-request"
      function_arn = aws_cloudfront_function.spa_router.arn
    }
  }

  ordered_cache_behavior {
    path_pattern           = "/assets/*"
    target_origin_id       = "frontend-origin"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD"]
    compress               = true
    forwarded_values {
      query_string = false
      cookies { forward = "none" }
    }
    min_ttl     = 86400
    default_ttl = 31536000
    max_ttl     = 31536000
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    cloudfront_default_certificate = var.custom_domain == ""
    acm_certificate_arn            = var.custom_domain == "" ? null : var.certificate_arn
    ssl_support_method             = var.custom_domain == "" ? null : "sni-only"
    minimum_protocol_version       = var.custom_domain == "" ? null : "TLSv1.2_2021"
  }

  aliases = var.custom_domain == "" ? [] : [var.custom_domain]
}

resource "aws_s3_bucket_policy" "frontend_oac" {
  bucket = aws_s3_bucket.frontend.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Principal = {
        Service = "cloudfront.amazonaws.com"
      }
      Action   = "s3:GetObject"
      Resource = "${aws_s3_bucket.frontend.arn}/*"
      Condition = {
        StringEquals = {
          "AWS:SourceArn" = aws_cloudfront_distribution.frontend.arn
        }
      }
    }]
  })
}

resource "aws_cognito_user_pool" "main" {
  name = "${local.prefix}-users"
  admin_create_user_config {
    allow_admin_create_user_only = true
  }
  mfa_configuration = "OPTIONAL"
  software_token_mfa_configuration { enabled = true }
}

resource "aws_cognito_user_pool_domain" "main" {
  domain       = "${local.prefix}-${data.aws_caller_identity.current.account_id}"
  user_pool_id = aws_cognito_user_pool.main.id
}

resource "aws_cognito_user_pool_client" "spa" {
  name                                 = "${local.prefix}-spa"
  user_pool_id                         = aws_cognito_user_pool.main.id
  generate_secret                      = false
  allowed_oauth_flows_user_pool_client = true
  allowed_oauth_flows                  = ["code"]
  allowed_oauth_scopes                 = ["openid", "email", "profile", "${aws_cognito_resource_server.api.identifier}/read", "${aws_cognito_resource_server.api.identifier}/write"]
  explicit_auth_flows                  = ["ALLOW_REFRESH_TOKEN_AUTH", "ALLOW_USER_SRP_AUTH"]
  callback_urls                        = ["https://${aws_cloudfront_distribution.frontend.domain_name}/auth/callback"]
  logout_urls                          = ["https://${aws_cloudfront_distribution.frontend.domain_name}"]
  supported_identity_providers         = ["COGNITO"]
}

resource "aws_cognito_resource_server" "api" {
  user_pool_id = aws_cognito_user_pool.main.id
  identifier   = "${local.prefix}-api"
  name         = "${local.prefix}-api"
  scope {
    scope_name        = "read"
    scope_description = "Read API access"
  }
  scope {
    scope_name        = "write"
    scope_description = "Write API access"
  }
}

resource "aws_cognito_user_group" "administrator" {
  user_pool_id = aws_cognito_user_pool.main.id
  name         = "Administrator"
}
resource "aws_cognito_user_group" "manager" {
  user_pool_id = aws_cognito_user_pool.main.id
  name         = "Manager"
}
resource "aws_cognito_user_group" "ta" {
  user_pool_id = aws_cognito_user_pool.main.id
  name         = "TA"
}
resource "aws_cognito_user_group" "panel" {
  user_pool_id = aws_cognito_user_pool.main.id
  name         = "Panel"
}

resource "aws_iam_role" "lambda" {
  name = "${local.prefix}-lambda-role"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Action    = "sts:AssumeRole"
      Principal = { Service = "lambda.amazonaws.com" }
    }]
  })
}

resource "aws_iam_role_policy" "lambda" {
  role = aws_iam_role.lambda.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"]
        Resource = "*"
      },
      {
        Effect   = "Allow"
        Action   = ["dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:UpdateItem", "dynamodb:DeleteItem", "dynamodb:Query", "dynamodb:Scan", "dynamodb:TransactWriteItems"]
        Resource = [aws_dynamodb_table.main.arn, "${aws_dynamodb_table.main.arn}/index/*"]
      },
      {
        Effect   = "Allow"
        Action   = ["s3:GetObject", "s3:PutObject"]
        Resource = "${aws_s3_bucket.documents.arn}/*"
      },
      {
        Effect = "Allow"
        Action = [
          "cognito-idp:AdminGetUser",
          "cognito-idp:AdminCreateUser",
          "cognito-idp:AdminAddUserToGroup",
          "cognito-idp:AdminRemoveUserFromGroup",
          "cognito-idp:AdminListGroupsForUser",
          "cognito-idp:AdminDisableUser",
          "cognito-idp:AdminEnableUser",
          "cognito-idp:ListUsers",
        ]
        Resource = aws_cognito_user_pool.main.arn
      }
    ]
  })
}

resource "aws_lambda_function" "api" {
  function_name    = "${local.prefix}-api"
  role             = aws_iam_role.lambda.arn
  runtime          = "python3.12"
  handler          = "app.main.handler"
  timeout          = 30
  filename         = "${path.module}/../../../artifacts/backend.zip"
  source_code_hash = filebase64sha256("${path.module}/../../../artifacts/backend.zip")
  environment {
    variables = {
      APP_ENV                  = var.environment
      APP_AWS_REGION           = var.aws_region
      APP_TABLE_NAME           = aws_dynamodb_table.main.name
      APP_COGNITO_USER_POOL_ID = aws_cognito_user_pool.main.id
      APP_COGNITO_CLIENT_ID    = aws_cognito_user_pool_client.spa.id
      APP_CORS_ORIGIN          = "https://${aws_cloudfront_distribution.frontend.domain_name}"
      APP_DEMO_MODE            = "false"
    }
  }
}

resource "aws_apigatewayv2_api" "http" {
  name          = "${local.prefix}-http-api"
  protocol_type = "HTTP"
  cors_configuration {
    allow_headers = ["authorization", "content-type", "x-idempotency-key"]
    allow_methods = ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]
    allow_origins = ["https://${aws_cloudfront_distribution.frontend.domain_name}"]
  }
}

resource "aws_apigatewayv2_authorizer" "jwt" {
  api_id           = aws_apigatewayv2_api.http.id
  authorizer_type  = "JWT"
  identity_sources = ["$request.header.Authorization"]
  name             = "${local.prefix}-jwt"
  jwt_configuration {
    audience = [aws_cognito_user_pool_client.spa.id]
    issuer   = "https://cognito-idp.${var.aws_region}.amazonaws.com/${aws_cognito_user_pool.main.id}"
  }
}

resource "aws_apigatewayv2_integration" "lambda" {
  api_id                 = aws_apigatewayv2_api.http.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.api.invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_route" "proxy" {
  api_id             = aws_apigatewayv2_api.http.id
  route_key          = "ANY /{proxy+}"
  target             = "integrations/${aws_apigatewayv2_integration.lambda.id}"
  authorizer_id      = aws_apigatewayv2_authorizer.jwt.id
  authorization_type = "JWT"
}

# CORS preflight requests never carry an Authorization header, so they need their own
# unauthenticated route or the JWT authorizer rejects them with 401 before the browser
# ever sends the real request.
resource "aws_apigatewayv2_route" "proxy_options" {
  api_id             = aws_apigatewayv2_api.http.id
  route_key          = "OPTIONS /{proxy+}"
  target             = "integrations/${aws_apigatewayv2_integration.lambda.id}"
  authorization_type = "NONE"
}

resource "aws_apigatewayv2_route" "health" {
  api_id             = aws_apigatewayv2_api.http.id
  route_key          = "GET /health"
  target             = "integrations/${aws_apigatewayv2_integration.lambda.id}"
  authorization_type = "NONE"
}

resource "aws_apigatewayv2_stage" "default" {
  api_id      = aws_apigatewayv2_api.http.id
  name        = "$default"
  auto_deploy = true
  default_route_settings {
    throttling_burst_limit = 100
    throttling_rate_limit  = 50
  }
  access_log_settings {
    destination_arn = aws_cloudwatch_log_group.api_logs.arn
    format          = jsonencode({ requestId = "$context.requestId", ip = "$context.identity.sourceIp", route = "$context.routeKey", status = "$context.status" })
  }
}

resource "aws_lambda_permission" "allow_api" {
  statement_id  = "AllowExecutionFromApiGateway"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.api.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.http.execution_arn}/*/*"
}

resource "aws_cloudwatch_log_group" "api_logs" {
  name              = "/aws/apigateway/${local.prefix}"
  retention_in_days = 30
}

resource "aws_cloudwatch_log_group" "lambda_logs" {
  name              = "/aws/lambda/${aws_lambda_function.api.function_name}"
  retention_in_days = 30
}

resource "aws_cloudwatch_metric_alarm" "lambda_errors" {
  alarm_name          = "${local.prefix}-lambda-errors"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "Errors"
  namespace           = "AWS/Lambda"
  period              = 300
  statistic           = "Sum"
  threshold           = 1
  dimensions          = { FunctionName = aws_lambda_function.api.function_name }
}
