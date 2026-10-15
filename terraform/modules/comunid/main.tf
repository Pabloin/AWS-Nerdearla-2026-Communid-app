data "aws_caller_identity" "current" {}

locals {
  name = "${var.project_name}-${var.environment}"
  tags = merge(var.tags, {
    Project     = var.project_name
    Environment = var.environment
    ManagedBy   = "Terraform"
  })
  oidc_provider_arn = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:oidc-provider/token.actions.githubusercontent.com"
}

module "auth" {
  source       = "../auth"
  project_name = var.project_name
  environment  = var.environment
  tags         = local.tags
}

module "storage" {
  source            = "../storage"
  project_name      = var.project_name
  environment       = var.environment
  account_id        = data.aws_caller_identity.current.account_id
  media_bucket_name = "${local.name}-media-${data.aws_caller_identity.current.account_id}"
  tags              = local.tags
}

module "apps" {
  providers = {
    aws             = aws
    aws.certificate = aws.certificate
  }
  source                        = "../apps"
  project_name                  = var.project_name
  environment                   = var.environment
  domain_name                   = var.domain_name
  additional_domains            = var.additional_domains
  tenant_domain                 = var.tenant_domain
  unmanaged_certificate_domains = var.unmanaged_certificate_domains
  cloudflare_zone_id            = var.cloudflare_zone_id
  web_bucket_name               = "${local.name}-web-${data.aws_caller_identity.current.account_id}"
  tags                          = local.tags
}

module "api" {
  source            = "../api"
  project_name      = var.project_name
  environment       = var.environment
  lambda_zip_path   = var.lambda_zip_path
  table_name        = module.storage.table_name
  table_arn         = module.storage.table_arn
  media_bucket_name = module.storage.media_bucket_name
  media_bucket_arn  = module.storage.media_bucket_arn
  public_app_url    = "https://${lookup(var.additional_domains, "mobile", var.domain_name)}"
  allowed_origins   = concat([for domain in concat([var.domain_name], [for domain in values(var.additional_domains) : domain if !strcontains(domain, "*")]) : "https://${domain}"], var.environment == "staging" ? ["http://127.0.0.1:5190", "http://127.0.0.1:5192"] : [])
  tenant_domain     = var.tenant_domain != "" ? var.tenant_domain : contains(values(var.additional_domains), "*.${var.domain_name}") ? var.domain_name : ""
  default_event_id  = var.default_event_id
  cognito_issuer    = module.auth.issuer
  cognito_client_id = module.auth.client_id
  tags              = local.tags
}

moved {
  from = module.cicd
  to   = module.cicd[0]
}

module "cicd" {
  count                    = var.enable_cicd ? 1 : 0
  source                   = "../cicd"
  project_name             = var.project_name
  environment              = var.environment
  github_owner             = var.github_owner
  github_owner_id          = var.github_owner_id
  github_repo              = var.github_repo
  github_repo_id           = var.github_repo_id
  github_oidc_provider_arn = local.oidc_provider_arn
  web_bucket_arn           = module.apps.web_bucket_arn
  distribution_arn         = module.apps.distribution_arn
  lambda_arn               = module.api.lambda_arn
  tags                     = local.tags
}
