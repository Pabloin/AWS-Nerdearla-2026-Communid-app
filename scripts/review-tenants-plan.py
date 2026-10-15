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
        if not address.startswith('module.comunid.') or change['actions'] not in [['create'], ['no-op']]:
            raise ValueError(f'Refusing modification/deletion or foreign resource: {address}')
        after = change.get('after') or {}
        if kind == 'aws_cloudfront_distribution' and set(after.get('aliases', [])) != {'tenants.comunid.app', '*.comunid.app'}:
            raise ValueError('The new distribution must not claim Argentina aliases')
        if kind == 'cloudflare_dns_record':
            name = after.get('name', '').rstrip('.')
            if name not in ['tenants.comunid.app', '*.comunid.app'] and not (name.startswith('_') and name.endswith('.tenants.comunid.app')):
                raise ValueError(f'Refusing a DNS record outside the new tenant domains: {name}')
        field = {'aws_s3_bucket': 'bucket', 'aws_lambda_function': 'function_name', 'aws_dynamodb_table': 'name', 'aws_iam_role': 'name', 'aws_secretsmanager_secret': 'name', 'aws_cognito_user_pool': 'name', 'aws_cognito_user_pool_client': 'name', 'aws_rekognition_collection': 'collection_id', 'aws_apigatewayv2_api': 'name', 'aws_cloudfront_function': 'name'}.get(kind)
        if field and not str(after.get(field, '')).startswith('comunid-tenants-'):
            raise ValueError(f'Refusing a resource without the tenants prefix: {address}')
    normalized = [{'address': r['address'], 'type': r['type'], 'change': r['change']} for r in sorted(changes, key=lambda r: r['address'])]
    digest = hashlib.sha256(json.dumps(normalized, sort_keys=True, separators=(',', ':')).encode()).hexdigest()
    return changes, digest


if __name__ == '__main__':
    changes, digest = review(json.loads(Path(sys.argv[1]).read_text()))
    expected = os.environ.get('REVIEWED_PLAN_SHA', '')
    if os.environ.get('DEPLOY') == 'true' and expected != digest:
        raise SystemExit('The plan differs from the reviewed digest; run plan-only and review it first.')
    summary = f'## Independent tenants plan\n\nSource commit: `{os.environ.get("SOURCE_SHA", "local")}`\n\nRegion: `us-east-2` · state: `comunid/tenants/terraform.tfstate`\n\nPlan SHA-256: `{digest}`\n\n| Resource | Action |\n| --- | --- |\n'
    summary += ''.join(f'| `{r["address"]}` | {", ".join(r["change"]["actions"])} |\n' for r in changes)
    summary += '\nNo updates or deletions of existing resources are permitted.\n'
    if os.environ.get('GITHUB_STEP_SUMMARY'):
        with open(os.environ['GITHUB_STEP_SUMMARY'], 'a') as f:
            f.write(summary)
    print(summary)
