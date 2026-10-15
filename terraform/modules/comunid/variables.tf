variable "project_name" {
  type    = string
  default = "comunid"
}
variable "environment" { type = string }
variable "domain_name" { type = string }
variable "additional_domains" {
  type    = map(string)
  default = {}
}
variable "cloudflare_zone_id" { type = string }
variable "default_event_id" {
  type    = string
  default = "nerdearla-2026"
}
variable "lambda_zip_path" { type = string }
variable "github_owner" { type = string }
variable "github_owner_id" { type = string }
variable "github_repo" { type = string }
variable "github_repo_id" { type = string }
variable "tags" {
  type    = map(string)
  default = {}
}

variable "tenant_domain" {
  type    = string
  default = ""
}
variable "unmanaged_certificate_domains" {
  description = "Certificate domains whose ACM validation CNAME is already managed by another stack. Never import or overwrite those records here."
  type        = set(string)
  default     = []
}
