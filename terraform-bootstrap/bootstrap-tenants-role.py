#!/usr/bin/env python3
"""Create only the tenants OIDC bootstrap role; never alter Argentina's IAM roles."""
import json
import subprocess
import tempfile
from pathlib import Path

PROFILE = 'sebas'
ACCOUNT = '442809140287'
ROLE = 'comunid-tenants-github-bootstrap'


def aws(*args, allow_missing=False):
    result = subprocess.run(['aws', '--profile', PROFILE, *args, '--output', 'json'], capture_output=True, text=True)
    if result.returncode:
        if allow_missing and 'NoSuchEntity' in result.stderr:
            return None
        raise RuntimeError(result.stderr)
    return json.loads(result.stdout) if result.stdout.strip() else {}


if __name__ == '__main__':
    assert aws('sts', 'get-caller-identity')['Account'] == ACCOUNT
    trust = {
        'Version': '2012-10-17',
        'Statement': [{'Effect': 'Allow', 'Principal': {'Federated': f'arn:aws:iam::{ACCOUNT}:oidc-provider/token.actions.githubusercontent.com'}, 'Action': 'sts:AssumeRoleWithWebIdentity', 'Condition': {'StringEquals': {
            'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
            'token.actions.githubusercontent.com:sub': [
                'repo:Pabloin@21208987/AWS-Nerdearla-2026-Communid-app@1382715278:environment:tenants',
                'repo:Pabloin@21208987/xAWS-Nerdearla-2026@1382715278:environment:tenants',
                'repo:Pabloin/AWS-Nerdearla-2026-Communid-app:environment:tenants'
            ]}}}]
    }
    policy = {'Version': '2012-10-17', 'Statement': [
        {'Sid': 'NewRegionalStack', 'Effect': 'Allow', 'Action': ['apigateway:*', 'dynamodb:*', 'cognito-idp:*', 'lambda:*', 'logs:*', 'rekognition:*', 'secretsmanager:*'], 'Resource': '*', 'Condition': {'StringEquals': {'aws:RequestedRegion': 'us-east-2'}}},
        {'Sid': 'IndependentWebAndCertificate', 'Effect': 'Allow', 'Action': ['cloudfront:*', 'acm:*'], 'Resource': '*'},
        {'Sid': 'TenantsRolesOnly', 'Effect': 'Allow', 'Action': ['iam:GetRole', 'iam:CreateRole', 'iam:DeleteRole', 'iam:UpdateAssumeRolePolicy', 'iam:ListRolePolicies', 'iam:ListAttachedRolePolicies', 'iam:GetRolePolicy', 'iam:PutRolePolicy', 'iam:DeleteRolePolicy', 'iam:TagRole', 'iam:UntagRole', 'iam:PassRole'], 'Resource': f'arn:aws:iam::{ACCOUNT}:role/comunid-tenants-*'},
        {'Sid': 'NewBucketsOnly', 'Effect': 'Allow', 'Action': 's3:*', 'Resource': ['arn:aws:s3:::comunid-tenants-*', 'arn:aws:s3:::comunid-tenants-*/*']},
        {'Sid': 'ListStateBucket', 'Effect': 'Allow', 'Action': ['s3:ListBucket', 's3:GetBucketLocation'], 'Resource': f'arn:aws:s3:::comunid-terraform-state-{ACCOUNT}'},
        {'Sid': 'IndependentStateOnly', 'Effect': 'Allow', 'Action': ['s3:GetObject', 's3:PutObject', 's3:DeleteObject'], 'Resource': [f'arn:aws:s3:::comunid-terraform-state-{ACCOUNT}/comunid/tenants/terraform.tfstate', f'arn:aws:s3:::comunid-terraform-state-{ACCOUNT}/comunid/tenants/terraform.tfstate.tflock']},
        {'Sid': 'ProtectArgentinaWeb', 'Effect': 'Deny', 'Action': ['cloudfront:UpdateDistribution', 'cloudfront:DeleteDistribution', 'cloudfront:CreateInvalidation', 'cloudfront:UpdateFunction', 'cloudfront:PublishFunction', 'cloudfront:DeleteFunction', 'acm:DeleteCertificate', 'acm:AddTagsToCertificate', 'acm:RemoveTagsFromCertificate'], 'Resource': [f'arn:aws:cloudfront::{ACCOUNT}:distribution/E2DYSZ3ARR9EVF', f'arn:aws:cloudfront::{ACCOUNT}:function/comunid-production-section-routes', f'arn:aws:acm:us-east-1:{ACCOUNT}:certificate/2840449b-6710-44e0-8a14-c96bbe82976d']}
    ]}
    existing = aws('iam', 'get-role', '--role-name', ROLE, allow_missing=True)
    if existing and not any(t['Key'] == 'Project' and t['Value'] == 'comunid-tenants' for t in existing['Role'].get('Tags', [])):
        raise SystemExit('Refusing to modify an existing role without the expected tenants tag')
    with tempfile.TemporaryDirectory() as directory:
        trust_file, policy_file = Path(directory)/'trust.json', Path(directory)/'policy.json'
        trust_file.write_text(json.dumps(trust)); policy_file.write_text(json.dumps(policy))
        if existing:
            aws('iam', 'update-assume-role-policy', '--role-name', ROLE, '--policy-document', f'file://{trust_file}')
        else:
            aws('iam', 'create-role', '--role-name', ROLE, '--assume-role-policy-document', f'file://{trust_file}', '--tags', 'Key=Project,Value=comunid-tenants', 'Key=Purpose,Value=independent-tenants-bootstrap')
        aws('iam', 'put-role-policy', '--role-name', ROLE, '--policy-name', 'bootstrap-independent-tenants', '--policy-document', f'file://{policy_file}')
    print(f'Ready: arn:aws:iam::{ACCOUNT}:role/{ROLE}')
