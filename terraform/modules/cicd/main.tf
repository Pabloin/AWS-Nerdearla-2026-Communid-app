data "aws_iam_policy_document" "github_assume" {
  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]
    principals {
      type        = "Federated"
      identifiers = [var.github_oidc_provider_arn]
    }
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }
    condition {
      test     = "StringLike"
      variable = "token.actions.githubusercontent.com:sub"
      values   = ["repo:${var.github_owner}@${var.github_owner_id}/${var.github_repo}@${var.github_repo_id}:*"]
    }
  }
}

resource "aws_iam_role" "app" {
  name               = "${var.project_name}-${var.environment}-github-app"
  assume_role_policy = data.aws_iam_policy_document.github_assume.json
  tags               = var.tags
}

resource "aws_iam_role_policy" "app" {
  name = "deploy-application"
  role = aws_iam_role.app.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      { Effect = "Allow", Action = ["s3:ListBucket"], Resource = var.web_bucket_arn },
      { Effect = "Allow", Action = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"], Resource = "${var.web_bucket_arn}/*" },
      { Effect = "Allow", Action = ["lambda:UpdateFunctionCode", "lambda:GetFunctionConfiguration"], Resource = var.lambda_arn },
      { Effect = "Allow", Action = ["cloudfront:CreateInvalidation"], Resource = var.distribution_arn },
      { Effect = "Allow", Action = ["cloudfront:ListDistributions", "apigateway:GET"], Resource = "*" }
    ]
  })
}

resource "aws_iam_role" "infra" {
  name               = "${var.project_name}-${var.environment}-github-infra"
  assume_role_policy = data.aws_iam_policy_document.github_assume.json
  tags               = var.tags
}

resource "aws_iam_role_policy" "infra" {
  name = "manage-comunid-infrastructure"
  role = aws_iam_role.infra.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "acm:*", "apigateway:*", "cloudfront:*", "dynamodb:*", "iam:*",
          "lambda:*", "logs:*", "rekognition:*", "resource-groups:*",
          "s3:*", "secretsmanager:*", "sts:GetCallerIdentity"
        ]
        Resource = "*"
      }
    ]
  })
}
