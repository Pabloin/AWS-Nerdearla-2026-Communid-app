variable "project_name" { type = string }
variable "environment" { type = string }
variable "domain_name" { type = string }
variable "additional_domains" {
  type    = map(string)
  default = {}
}
variable "cloudflare_zone_id" { type = string }
variable "web_bucket_name" { type = string }
variable "tags" { type = map(string) }

variable "tenant_domain" {
  type    = string
  default = ""
}
variable "unmanaged_certificate_domains" {
  description = "Certificate domains whose ACM validation CNAME is already managed by another stack. Never import or overwrite those records here."
  type        = set(string)
  default     = []
}
