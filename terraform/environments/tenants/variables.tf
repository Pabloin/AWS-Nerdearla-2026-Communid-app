variable "aws_region" {
  type    = string
  default = "us-east-2"
  validation {
    condition     = var.aws_region != "us-east-1"
    error_message = "The tenants regional resources must be outside the Argentina production region us-east-1."
  }
}
variable "github_owner" { type = string }
variable "github_owner_id" { type = string }
variable "github_repo" { type = string }
variable "github_repo_id" { type = string }
variable "cloudflare_zone_id" { type = string }
variable "lambda_zip_path" {
  type    = string
  default = "../../../backend/dist/api.zip"
}
