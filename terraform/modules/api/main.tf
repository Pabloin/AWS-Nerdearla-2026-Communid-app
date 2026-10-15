data "aws_iam_policy_document" "lambda_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "lambda" {
  name               = "${var.project_name}-${var.environment}-api-role"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume.json
  tags               = var.tags
}

resource "aws_rekognition_collection" "faces" {
  collection_id = "${var.project_name}-${var.environment}-faces"
  tags          = var.tags
}

resource "aws_secretsmanager_secret" "admin_token" {
  name                    = "${var.project_name}-${var.environment}-admin-token"
  description             = "Bearer token for the Comunid admin API. Set the secret value after deployment."
  recovery_window_in_days = 7
  tags                    = var.tags
}

resource "aws_iam_role_policy" "lambda" {
  name = "${var.project_name}-${var.environment}-api-policy"
  role = aws_iam_role.lambda.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      { Effect = "Allow", Action = ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"], Resource = "arn:aws:logs:*:*:*" },
      { Effect = "Allow", Action = ["dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:DeleteItem", "dynamodb:Query", "dynamodb:Scan", "dynamodb:UpdateItem"], Resource = [var.table_arn, "${var.table_arn}/index/*"] },
      { Effect = "Allow", Action = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"], Resource = "${var.media_bucket_arn}/*" },
      { Effect = "Allow", Action = ["rekognition:DetectFaces"], Resource = "*" },
      { Effect = "Allow", Action = ["rekognition:CreateUser", "rekognition:IndexFaces", "rekognition:AssociateFaces", "rekognition:DisassociateFaces", "rekognition:DeleteFaces", "rekognition:SearchUsersByImage"], Resource = [aws_rekognition_collection.faces.arn, "${aws_rekognition_collection.faces.arn}-tenant-*"] },
      { Effect = "Allow", Action = ["rekognition:CreateCollection"], Resource = "${aws_rekognition_collection.faces.arn}-tenant-*" },
      { Effect = "Allow", Action = ["secretsmanager:GetSecretValue"], Resource = aws_secretsmanager_secret.admin_token.arn }
    ]
  })
}

resource "aws_lambda_function" "api" {
  function_name    = "${var.project_name}-${var.environment}-api"
  filename         = var.lambda_zip_path
  source_code_hash = filebase64sha256(var.lambda_zip_path)
  role             = aws_iam_role.lambda.arn
  handler          = "index.handler"
  runtime          = "nodejs20.x"
  timeout          = 30
  memory_size      = 256
  environment {
    variables = {
      TENANT_DOMAIN      = var.tenant_domain
      TABLE_NAME         = var.table_name
      MEDIA_BUCKET       = var.media_bucket_name
      PUBLIC_APP_URL     = var.public_app_url
      ALLOWED_ORIGINS    = join(",", var.allowed_origins)
      DEFAULT_EVENT_ID   = var.default_event_id
      ADMIN_SECRET_ARN   = aws_secretsmanager_secret.admin_token.arn
      FACE_COLLECTION_ID = aws_rekognition_collection.faces.collection_id
    }
  }
  tags = var.tags
}

resource "aws_apigatewayv2_api" "http" {
  name          = "${var.project_name}-${var.environment}-api"
  protocol_type = "HTTP"
  # Lambda validates explicit origins and tenant subdomains and answers OPTIONS.
  # Gateway CORS would override the per-origin response from the backend.
  tags = var.tags
}

resource "aws_apigatewayv2_integration" "lambda" {
  api_id                 = aws_apigatewayv2_api.http.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.api.invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_route" "default" {
  api_id    = aws_apigatewayv2_api.http.id
  route_key = "$default"
  target    = "integrations/${aws_apigatewayv2_integration.lambda.id}"
}

resource "aws_apigatewayv2_authorizer" "attendee" {
  api_id           = aws_apigatewayv2_api.http.id
  authorizer_type  = "JWT"
  identity_sources = ["$request.header.Authorization"]
  name             = "${var.project_name}-${var.environment}-attendee"

  jwt_configuration {
    audience = [var.cognito_client_id]
    issuer   = var.cognito_issuer
  }
}

resource "aws_apigatewayv2_route" "authenticated_encounters" {
  for_each           = toset(["POST /encounters", "GET /me/encounters", "GET /players/{playerId}/encounters", "POST /t/{tenantId}/encounters", "GET /t/{tenantId}/me/encounters", "GET /t/{tenantId}/players/{playerId}/encounters"])
  api_id             = aws_apigatewayv2_api.http.id
  route_key          = each.value
  target             = "integrations/${aws_apigatewayv2_integration.lambda.id}"
  authorization_type = "JWT"
  authorizer_id      = aws_apigatewayv2_authorizer.attendee.id
}

resource "aws_apigatewayv2_stage" "default" {
  api_id      = aws_apigatewayv2_api.http.id
  name        = "$default"
  auto_deploy = true
  default_route_settings {
    throttling_burst_limit = 100
    throttling_rate_limit  = 50
  }
  tags = var.tags
}

resource "aws_lambda_permission" "api_gateway" {
  statement_id  = "AllowApiGateway"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.api.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.http.execution_arn}/*/*"
}
