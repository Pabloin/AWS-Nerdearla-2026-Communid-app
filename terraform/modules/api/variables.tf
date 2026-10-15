variable "project_name" { type = string }
variable "environment" { type = string }
variable "lambda_zip_path" { type = string }
variable "table_name" { type = string }
variable "table_arn" { type = string }
variable "media_bucket_name" { type = string }
variable "media_bucket_arn" { type = string }
variable "public_app_url" { type = string }
variable "allowed_origins" { type = list(string) }
variable "default_event_id" { type = string }
variable "cognito_issuer" { type = string }
variable "cognito_client_id" { type = string }
variable "tags" { type = map(string) }

variable "tenant_domain" {
  type    = string
  default = ""
}
