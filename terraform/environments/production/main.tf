module "comunid" {
  source = "../../modules/comunid"
  providers = {
    aws             = aws
    aws.certificate = aws.us_east_1
  }
  environment = "production"
  domain_name = "comunid.app"
  additional_domains = {
    app    = "app.comunid.app"
    mobile = "mobile.comunid.app"
    admin  = "admin.comunid.app"
    hero   = "hero.comunid.app"
    somos  = "somos.comunid.app"
    www    = "www.comunid.app"
  }
  cloudflare_zone_id = var.cloudflare_zone_id
  default_event_id   = "nerdearla-2026"
  lambda_zip_path    = var.lambda_zip_path
  github_owner       = var.github_owner
  github_owner_id    = var.github_owner_id
  github_repo        = var.github_repo
  github_repo_id     = var.github_repo_id
}
