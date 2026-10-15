resource "aws_s3_bucket" "web" {
  bucket = var.web_bucket_name
  tags   = var.tags
}

resource "aws_s3_bucket_public_access_block" "web" {
  bucket                  = aws_s3_bucket.web.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_cloudfront_origin_access_control" "web" {
  name                              = "${var.project_name}-${var.environment}-web"
  description                       = "Comunid web origin access"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

resource "aws_acm_certificate" "web" {
  provider                  = aws.certificate
  domain_name               = var.domain_name
  subject_alternative_names = values(var.additional_domains)
  validation_method         = "DNS"
  lifecycle {
    create_before_destroy = true
  }
  tags = var.tags
}

resource "cloudflare_dns_record" "validation" {
  for_each = {
    for option in aws_acm_certificate.web.domain_validation_options : option.domain_name => {
      name   = option.resource_record_name
      record = option.resource_record_value
      type   = option.resource_record_type
    } if option.domain_name != "*.${var.domain_name}" && !contains(var.unmanaged_certificate_domains, option.domain_name)
  }
  zone_id = var.cloudflare_zone_id
  name    = trimsuffix(each.value.name, ".")
  type    = each.value.type
  content = trimsuffix(each.value.record, ".")
  ttl     = 60
  proxied = false
}

resource "aws_acm_certificate_validation" "web" {
  provider                = aws.certificate
  certificate_arn         = aws_acm_certificate.web.arn
  validation_record_fqdns = distinct([for option in aws_acm_certificate.web.domain_validation_options : trimsuffix(option.resource_record_name, ".")])
}

resource "aws_cloudfront_function" "section_routes" {
  name    = "${var.project_name}-${var.environment}-section-routes"
  runtime = "cloudfront-js-1.0"
  comment = "Serve the app and admin entry points from their S3 prefixes"
  publish = true
  code = templatefile("${path.module}/route-rewrite.js", {
    mobile_domain  = lookup(var.additional_domains, "mobile", "")
    app_domain     = lookup(var.additional_domains, "app", "")
    admin_domain   = lookup(var.additional_domains, "admin", "")
    hero_domain    = lookup(var.additional_domains, "hero", "")
    somos_domain   = lookup(var.additional_domains, "somos", "")
    tenant_domain  = var.tenant_domain != "" ? var.tenant_domain : contains(values(var.additional_domains), "*.${var.domain_name}") ? var.domain_name : ""
    tenants_domain = lookup(var.additional_domains, "tenants", var.tenant_domain != "" ? var.domain_name : "")
    www_domain     = lookup(var.additional_domains, "www", "")
    root_domain    = var.domain_name
  })
}

resource "aws_cloudfront_distribution" "web" {
  enabled             = true
  is_ipv6_enabled     = true
  default_root_object = "index.html"
  aliases             = concat([var.domain_name], values(var.additional_domains))
  price_class         = "PriceClass_100"
  origin {
    domain_name              = aws_s3_bucket.web.bucket_regional_domain_name
    origin_id                = "web-s3"
    origin_access_control_id = aws_cloudfront_origin_access_control.web.id
  }
  default_cache_behavior {
    target_origin_id       = "web-s3"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD"]
    compress               = true
    function_association {
      event_type   = "viewer-request"
      function_arn = aws_cloudfront_function.section_routes.arn
    }
    forwarded_values {
      query_string = false
      cookies {
        forward = "none"
      }
    }
    min_ttl     = 0
    default_ttl = 300
    max_ttl     = 86400
  }
  custom_error_response {
    error_code            = 403
    response_code         = 200
    response_page_path    = "/index.html"
    error_caching_min_ttl = 0
  }
  custom_error_response {
    error_code            = 404
    response_code         = 200
    response_page_path    = "/index.html"
    error_caching_min_ttl = 0
  }
  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }
  viewer_certificate {
    acm_certificate_arn      = aws_acm_certificate_validation.web.certificate_arn
    ssl_support_method       = "sni-only"
    minimum_protocol_version = "TLSv1.2_2021"
  }
  tags = var.tags
}

data "aws_iam_policy_document" "web" {
  statement {
    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.web.arn}/*"]
    principals {
      type        = "Service"
      identifiers = ["cloudfront.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "AWS:SourceArn"
      values   = [aws_cloudfront_distribution.web.arn]
    }
  }
}

resource "aws_s3_bucket_policy" "web" {
  bucket = aws_s3_bucket.web.id
  policy = data.aws_iam_policy_document.web.json
}

resource "cloudflare_dns_record" "web" {
  for_each = toset(concat([var.domain_name], values(var.additional_domains)))
  zone_id  = var.cloudflare_zone_id
  name     = each.value
  type     = "CNAME"
  content  = aws_cloudfront_distribution.web.domain_name
  ttl      = 1
  proxied  = false
}
