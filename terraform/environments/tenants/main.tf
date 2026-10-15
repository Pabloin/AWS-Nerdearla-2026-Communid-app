# Independent root/state: never point this directory at Argentina's state key.
module "comunid" {
  source = "../../modules/comunid"
  providers = {
    aws             = aws
    aws.certificate = aws.us_east_1
  }
  enable_cicd   = false
  project_name  = "comunid-tenants"
  environment   = "production"
  domain_name   = "tenants.comunid.app"
  tenant_domain = "comunid.app"
  additional_domains = {
    wildcard = "*.comunid.app"
  }

  # ACM uses the same CNAME for comunid.app and *.comunid.app in this account.
  # Argentina already owns that validation record. Depend on it without managing
  # it in this state; validation waits/fails if that record does not match.
  unmanaged_certificate_domains = ["*.comunid.app"]

  cloudflare_zone_id = var.cloudflare_zone_id
  default_event_id   = "tenant-platform"
  lambda_zip_path    = var.lambda_zip_path
  github_owner       = var.github_owner
  github_owner_id    = var.github_owner_id
  github_repo        = var.github_repo
  github_repo_id     = var.github_repo_id
  tags = {
    Stack = "tenants"
  }
}
