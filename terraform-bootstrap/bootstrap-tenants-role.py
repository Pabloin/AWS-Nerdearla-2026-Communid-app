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
        {'Sid': 'NewLambdaOnly', 'Effect': 'Allow', 'Action': ['lambda:CreateFunction', 'lambda:GetFunction', 'lambda:GetFunctionConfiguration', 'lambda:GetPolicy', 'lambda:ListVersionsByFunction', 'lambda:ListTags', 'lambda:UpdateFunctionCode', 'lambda:UpdateFunctionConfiguration', 'lambda:AddPermission', 'lambda:RemovePermission', 'lambda:TagResource', 'lambda:UntagResource'], 'Resource': f'arn:aws:lambda:us-east-2:{ACCOUNT}:function:comunid-tenants-production-api'},
        {'Sid': 'NewDatabaseOnly', 'Effect': 'Allow', 'Action': ['dynamodb:CreateTable', 'dynamodb:DescribeTable', 'dynamodb:DescribeContinuousBackups', 'dynamodb:DescribeTimeToLive', 'dynamodb:ListTagsOfResource', 'dynamodb:UpdateContinuousBackups', 'dynamodb:TagResource', 'dynamodb:UntagResource'], 'Resource': f'arn:aws:dynamodb:us-east-2:{ACCOUNT}:table/comunid-tenants-production'},
        {'Sid': 'NewSecretOnly', 'Effect': 'Allow', 'Action': ['secretsmanager:CreateSecret', 'secretsmanager:DescribeSecret', 'secretsmanager:GetResourcePolicy', 'secretsmanager:TagResource', 'secretsmanager:UntagResource'], 'Resource': f'arn:aws:secretsmanager:us-east-2:{ACCOUNT}:secret:comunid-tenants-production-admin-token-*'},
        {'Sid': 'NewFacesOnly', 'Effect': 'Allow', 'Action': ['rekognition:CreateCollection', 'rekognition:DescribeCollection', 'rekognition:ListTagsForResource', 'rekognition:TagResource'], 'Resource': f'arn:aws:rekognition:us-east-2:{ACCOUNT}:collection/comunid-tenants-production-faces'},
        {'Sid': 'NewUserPool', 'Effect': 'Allow', 'Action': 'cognito-idp:CreateUserPool', 'Resource': '*', 'Condition': {'StringEquals': {'aws:RequestTag/Project': 'comunid-tenants', 'aws:RequestedRegion': 'us-east-2'}}},
        {'Sid': 'UserPoolConfiguration', 'Effect': 'Allow', 'Action': ['cognito-idp:DescribeUserPool', 'cognito-idp:ListTagsForResource', 'cognito-idp:GetUserPoolMfaConfig', 'cognito-idp:SetUserPoolMfaConfig', 'cognito-idp:CreateUserPoolClient', 'cognito-idp:DescribeUserPoolClient', 'cognito-idp:ListUserPoolClients'], 'Resource': f'arn:aws:cognito-idp:us-east-2:{ACCOUNT}:userpool/*'},
        {'Sid': 'NewRegionalApi', 'Effect': 'Allow', 'Action': ['apigateway:GET', 'apigateway:POST', 'apigateway:PUT', 'apigateway:PATCH'], 'Resource': ['arn:aws:apigateway:us-east-2::/apis', 'arn:aws:apigateway:us-east-2::/apis/*']},
        {'Sid': 'NewLambdaRole', 'Effect': 'Allow', 'Action': ['iam:GetRole', 'iam:CreateRole', 'iam:ListRolePolicies', 'iam:ListAttachedRolePolicies', 'iam:GetRolePolicy', 'iam:PutRolePolicy', 'iam:TagRole', 'iam:UntagRole'], 'Resource': f'arn:aws:iam::{ACCOUNT}:role/comunid-tenants-production-api-role'},
        {'Sid': 'PassOnlyNewLambdaRole', 'Effect': 'Allow', 'Action': 'iam:PassRole', 'Resource': f'arn:aws:iam::{ACCOUNT}:role/comunid-tenants-production-api-role', 'Condition': {'StringEquals': {'iam:PassedToService': 'lambda.amazonaws.com'}}},
        {'Sid': 'NewBucketsOnly', 'Effect': 'Allow', 'Action': 's3:*', 'Resource': ['arn:aws:s3:::comunid-tenants-production-*', 'arn:aws:s3:::comunid-tenants-production-*/*']},
        {'Sid': 'ListStateBucket', 'Effect': 'Allow', 'Action': ['s3:ListBucket', 's3:GetBucketLocation'], 'Resource': f'arn:aws:s3:::comunid-terraform-state-{ACCOUNT}'},
        {'Sid': 'IndependentStateOnly', 'Effect': 'Allow', 'Action': ['s3:GetObject', 's3:PutObject', 's3:DeleteObject'], 'Resource': [f'arn:aws:s3:::comunid-terraform-state-{ACCOUNT}/comunid/tenants/terraform.tfstate', f'arn:aws:s3:::comunid-terraform-state-{ACCOUNT}/comunid/tenants/terraform.tfstate.tflock']},
        {'Sid': 'ReadWebAndCertificates', 'Effect': 'Allow', 'Action': ['cloudfront:Get*', 'cloudfront:List*', 'acm:DescribeCertificate', 'acm:ListTagsForCertificate'], 'Resource': '*'},
        {'Sid': 'CreateNewTaggedDistribution', 'Effect': 'Allow', 'Action': 'cloudfront:CreateDistributionWithTags', 'Resource': '*', 'Condition': {'StringEquals': {'aws:RequestTag/Project': 'comunid-tenants'}}},
        {'Sid': 'CreateNewOriginAccessControl', 'Effect': 'Allow', 'Action': 'cloudfront:CreateOriginAccessControl', 'Resource': '*'},
        {'Sid': 'NewWebFunctionsOnly', 'Effect': 'Allow', 'Action': ['cloudfront:CreateFunction', 'cloudfront:UpdateFunction', 'cloudfront:PublishFunction'], 'Resource': f'arn:aws:cloudfront::{ACCOUNT}:function/comunid-tenants-production-section-routes'},
        {'Sid': 'InvalidateNewDistribution', 'Effect': 'Allow', 'Action': 'cloudfront:CreateInvalidation', 'Resource': f'arn:aws:cloudfront::{ACCOUNT}:distribution/*', 'Condition': {'StringEquals': {'aws:ResourceTag/Project': 'comunid-tenants'}}},
        {'Sid': 'CreateNewTaggedCertificate', 'Effect': 'Allow', 'Action': 'acm:RequestCertificate', 'Resource': '*', 'Condition': {'StringEquals': {'aws:RequestTag/Project': 'comunid-tenants', 'aws:RequestedRegion': 'us-east-1'}}},
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
