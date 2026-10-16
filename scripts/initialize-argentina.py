#!/usr/bin/env python3
"""Initialize only the new platform credentials and its empty Argentina tenant.

Credentials are stored in Secrets Manager, never printed or copied from Argentina.
Run after the successful audited tenants infrastructure/application deployment.
"""
import argparse
import json
import os
import secrets
import subprocess
import tempfile
import urllib.error
import urllib.request
from pathlib import Path

PROFILE = 'sebas'
ACCOUNT = '442809140287'
REGION = 'us-east-2'
PLATFORM_SECRET = 'comunid-tenants-production-admin-token'
TENANT_SECRET = 'comunid-tenants-production-argentina-admin-token'


def aws(*args, missing=False):
    result = subprocess.run(['aws', '--profile', PROFILE, '--region', REGION, *args, '--output', 'json'], capture_output=True, text=True)
    if result.returncode:
        if missing and 'ResourceNotFoundException' in result.stderr:
            return None
        raise RuntimeError('AWS operation failed: ' + result.stderr)
    return json.loads(result.stdout) if result.stdout.strip() else {}


def store_secret(name, value, create=False):
    with tempfile.TemporaryDirectory() as directory:
        path = Path(directory)/'credential'
        with os.fdopen(os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600), 'w') as f:
            f.write(value)
        if create:
            aws('secretsmanager', 'create-secret', '--name', name, '--secret-string', f'file://{path}', '--tags', 'Key=Project,Value=comunid-tenants', 'Key=Stack,Value=tenants')
        else:
            aws('secretsmanager', 'put-secret-value', '--secret-id', name, '--secret-string', f'file://{path}')


def request(api, path, token=None, body=None, expected=200):
    payload = json.dumps(body).encode() if body is not None else None
    headers = {'content-type': 'application/json'}
    if token: headers['authorization'] = f'Bearer {token}'
    req = urllib.request.Request(api+path, data=payload, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=30) as response:
            assert response.status == expected, f'Unexpected status for {path}'
            return json.load(response)
    except urllib.error.HTTPError as error:
        if error.code == expected: return None
        raise RuntimeError(f'API request {path} returned {error.code}') from None


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description="Initialize an empty tenant and store its admin key privately.")
    parser.add_argument('--tenant', choices=['argentina', 'reinvent'], default='argentina')
    tenant_id = parser.parse_args().tenant
    tenant_name = {'argentina': 'Argentina', 'reinvent': 're:Invent 2026'}[tenant_id]
    TENANT_SECRET = f'comunid-tenants-production-{tenant_id}-admin-token'
    assert aws('sts', 'get-caller-identity')['Account'] == ACCOUNT
    # Stream the tenants state into memory. Never read Argentina state or print it.
    result = subprocess.run(['aws', '--profile', PROFILE, 's3', 'cp', f's3://comunid-terraform-state-{ACCOUNT}/comunid/tenants/terraform.tfstate', '-', '--only-show-errors'], capture_output=True, text=True, check=True)
    outputs = json.loads(result.stdout)['outputs']
    assert outputs['lambda_name']['value'] == 'comunid-tenants-production-api'
    api = outputs['api_url']['value']
    assert api.startswith('https://') and api.endswith('.execute-api.us-east-2.amazonaws.com')
    assert request(api, '/health')['status'] == 'ok'
    platform = aws('secretsmanager', 'get-secret-value', '--secret-id', PLATFORM_SECRET, missing=True)
    if platform is None:
        platform_token = secrets.token_urlsafe(48)
        store_secret(PLATFORM_SECRET, platform_token)
    else:
        platform_token = platform['SecretString']
    tenants = request(api, '/tenants', platform_token)['tenants']
    existing = next((item for item in tenants if item['id'] == tenant_id), None)
    saved = aws('secretsmanager', 'get-secret-value', '--secret-id', TENANT_SECRET, missing=True)
    if existing:
        if not saved: raise SystemExit(f'{tenant_id} tenant already exists but its admin credential is not saved; refusing to rotate it.')
        tenant_token = saved['SecretString']
    else:
        if saved: raise SystemExit(f'{tenant_id} admin credential already exists without a tenant; refusing to overwrite it.')
        created = request(api, '/tenants', platform_token, {'id': tenant_id, 'name': tenant_name, 'eventId': f'{tenant_id}-2026'}, expected=201)
        tenant_token = created['adminToken']
        try:
            store_secret(TENANT_SECRET, tenant_token, create=True)
        except Exception:
            fallback = Path(f'/private/tmp/comunid-tenants-{tenant_id}-admin-token')
            with os.fdopen(os.open(fallback, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600), 'w') as f:
                f.write(tenant_token)
            raise SystemExit(f'Credential could not be stored in AWS. Recovery copy saved privately at {fallback}; token was not printed.')
    assert request(api, f'/t/{tenant_id}/admin/session', tenant_token)['authorized'] is True
    request(api, '/tenants', tenant_token, expected=401)
    profiles = request(api, f'/t/{tenant_id}/profiles')['profiles']
    if not existing: assert profiles == []
    request(api, '/t/does-not-exist/profiles', expected=404)
    print(f'{tenant_id} tenant initialized; empty-on-create, admin scope and missing-tenant checks passed.')
    print(f'Platform credential: Secrets Manager / {REGION} / {PLATFORM_SECRET}')
    print(f'{tenant_name} credential: Secrets Manager / {REGION} / {TENANT_SECRET}')
    print('No credentials were printed and no existing Argentina data was copied.')
