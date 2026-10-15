terraform {
  required_providers {
    aws = {
      source                = "hashicorp/aws"
      configuration_aliases = [aws.certificate]
    }
    cloudflare = {
      source = "cloudflare/cloudflare"
    }
  }
}
