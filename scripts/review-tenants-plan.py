#!/usr/bin/env python3
"""Validate and summarize the initial tenants plan without exposing state secrets."""
import hashlib
import json
import os
import sys
from pathlib import Path


def review(plan):
    if plan.get('variables', {}).get('aws_region', {}).get('value') != 'us-east-2':
        raise ValueError('Expected the independent tenants region us-east-2')
    changes = [r for r in plan.get('resource_changes', []) if r.get('mode') == 'managed']
    if not changes:
        raise ValueError('The initial plan contains no managed resources')
    for r in changes:
        address, kind, change = r['address'], r['type'], r['change']
        recovery_resources = {
            'module.comunid.module.api.aws_lambda_function.api': ('function_name', 'comunid-tenants-production-api'),
            'module.comunid.module.apps.aws_cloudfront_function.section_routes': ('name', 'comunid-tenants-production-section-routes'),
        }
        recovery = False
        if address in recovery_resources and change['actions'] == ['delete', 'create'] and r.get('action_reason') == 'replace_because_tainted':
            field, name = recovery_resources[address]
            before, after = change.get('before') or {}, change.get('after') or {}
            recovery = before.get(field) == name and after.get(field) == name and before.get('id') == name
        # Application releases may change only code/hash metadata of this exact Lambda.
        # Roles, environment, handler, runtime, paths, and every other resource remain protected.
        code_update = False
        if address == 'module.comunid.module.api.aws_lambda_function.api' and change['actions'] == ['update']:
            before, after = change.get('before') or {}, change.get('after') or {}
            code_fields = {'source_code_hash', 'code_sha256', 'source_code_size', 'last_modified', 'qualified_arn', 'qualified_invoke_arn', 'version', 'signing_job_arn', 'signing_profile_version_arn'}
            changed = {key for key in set(before) | set(after) if before.get(key) != after.get(key)}
            unknown = {key for key, value in change.get('after_unknown', {}).items() if value}
            code_update = (before.get('id') == after.get('id') == before.get('function_name') == after.get('function_name') == 'comunid-tenants-production-api'
                and 'source_code_hash' in changed and changed <= code_fields and unknown <= code_fields
                and isinstance(after.get('source_code_hash'), str) and bool(after['source_code_hash']))
        if not address.startswith('module.comunid.') or (change['actions'] not in [['create'], ['no-op']] and not recovery and not code_update):
            raise ValueError(f'Refusing modification/deletion or foreign resource: {address}')
        after = change.get('after') or {}
        if kind == 'aws_cloudfront_distribution' and set(after.get('aliases', [])) != {'tenants.comunid.app', '*.comunid.app'}:
            raise ValueError('The new distribution must not claim Argentina aliases')
        if kind == 'aws_acm_certificate' and (after.get('domain_name') != 'tenants.comunid.app' or set(after.get('subject_alternative_names', [])) - {'tenants.comunid.app'} != {'*.comunid.app'}):
            raise ValueError('Refusing a certificate outside the new tenant domains')
        if kind == 'cloudflare_dns_record':
            name = after.get('name', '').rstrip('.')
            pending_portal_validation = (not name and address.endswith('cloudflare_dns_record.validation["tenants.comunid.app"]') and change.get('after_unknown', {}).get('name') is True)
            if not pending_portal_validation and name not in ['tenants.comunid.app', '*.comunid.app'] and not (name.startswith('_') and name.endswith('.tenants.comunid.app')):
                raise ValueError(f'Refusing a DNS record outside the new tenant domains: {name}')
        field = {'aws_s3_bucket': 'bucket', 'aws_lambda_function': 'function_name', 'aws_dynamodb_table': 'name', 'aws_iam_role': 'name', 'aws_secretsmanager_secret': 'name', 'aws_cognito_user_pool': 'name', 'aws_cognito_user_pool_client': 'name', 'aws_rekognition_collection': 'collection_id', 'aws_apigatewayv2_api': 'name', 'aws_cloudfront_function': 'name'}.get(kind)
        if field and not str(after.get(field, '')).startswith('comunid-tenants-'):
            raise ValueError(f'Refusing a resource without the tenants prefix: {address}')
    normalized = [{'address': r['address'], 'type': r['type'], 'change': r['change'], 'action_reason': r.get('action_reason')} for r in sorted(changes, key=lambda r: r['address'])]
    digest = hashlib.sha256(json.dumps(normalized, sort_keys=True, separators=(',', ':')).encode()).hexdigest()
    return changes, digest


if __name__ == '__main__':
    changes, digest = review(json.loads(Path(sys.argv[1]).read_text()))
    expected = os.environ.get('REVIEWED_PLAN_SHA', '')
    if os.environ.get('DEPLOY') == 'true' and expected != digest:
        raise SystemExit('The plan differs from the reviewed digest; run plan-only and review it first.')
    summary = f'## Independent tenants plan\n\nSource commit: `{os.environ.get("SOURCE_SHA", "local")}`\n\nRegion: `us-east-2` · state: `comunid/tenants/terraform.tfstate`\n\nPlan SHA-256: `{digest}`\n\n| Resource | Action |\n| --- | --- |\n'
    summary += ''.join(f'| `{r["address"]}` | {", ".join(r["change"]["actions"])} |\n' for r in changes)
    summary += '\nExisting infrastructure cannot be updated or deleted. Only code/hash metadata of the exact tenants Lambda may be updated. The two exact failed bootstrap Lambda/CloudFront-function resources may be replaced only when tainted.\n'
    if os.environ.get('GITHUB_STEP_SUMMARY'):
        with open(os.environ['GITHUB_STEP_SUMMARY'], 'a') as f:
            f.write(summary)
    print(summary)
