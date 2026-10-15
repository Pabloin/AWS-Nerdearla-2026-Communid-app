import copy
import importlib.util
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location('review', Path(__file__).with_name('review-tenants-plan.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class PlanReviewTests(unittest.TestCase):
    def plan(self, kind='aws_lambda_function', after=None):
        return {'variables': {'aws_region': {'value': 'us-east-2'}}, 'resource_changes': [{'address': 'module.comunid.module.api.example', 'type': kind, 'mode': 'managed', 'change': {'actions': ['create'], 'after': after or {'function_name': 'comunid-tenants-production-api'}}}]}

    def test_accepts_initial_stack_and_stable_digest(self):
        p = self.plan()
        self.assertEqual(module.review(p)[1], module.review(copy.deepcopy(p))[1])

    def test_rejects_updates_and_deletions(self):
        for actions in [['update'], ['delete'], ['delete', 'create']]:
            p = self.plan(); p['resource_changes'][0]['change']['actions'] = actions
            with self.assertRaises(ValueError): module.review(p)

    def test_recovers_only_the_exact_failed_bootstrap_resources(self):
        p = self.plan()
        r = p['resource_changes'][0]
        r['address'] = 'module.comunid.module.api.aws_lambda_function.api'
        r['action_reason'] = 'replace_because_tainted'
        r['change']['actions'] = ['delete', 'create']
        r['change']['before'] = {'function_name': 'comunid-tenants-production-api', 'id': 'comunid-tenants-production-api'}
        module.review(p)
        r['action_reason'] = 'replace_because_cannot_update'
        with self.assertRaises(ValueError): module.review(p)
        r['action_reason'] = 'replace_because_tainted'
        r['change']['before']['id'] = 'comunid-production-api'
        with self.assertRaises(ValueError): module.review(p)

    def test_rejects_argentina_resources_domains_and_region(self):
        for p in [self.plan(after={'function_name': 'comunid-production-api'}), self.plan('cloudflare_dns_record', {'name': 'comunid.app'}), self.plan('cloudflare_dns_record', {'name': 'mobile.comunid.app'}), self.plan('aws_cloudfront_distribution', {'aliases': ['comunid.app', '*.comunid.app']})]:
            with self.assertRaises(ValueError): module.review(p)
        p = self.plan(); p['variables']['aws_region']['value'] = 'us-east-1'
        with self.assertRaises(ValueError): module.review(p)

    def test_accepts_provider_certificate_sans_and_rejects_argentina_root(self):
        p = self.plan('aws_acm_certificate', {'domain_name': 'tenants.comunid.app', 'subject_alternative_names': ['*.comunid.app', 'tenants.comunid.app']})
        module.review(p)
        p['resource_changes'][0]['change']['after']['subject_alternative_names'].append('comunid.app')
        with self.assertRaises(ValueError): module.review(p)

    def test_accepts_pending_acm_validation_only_for_the_portal(self):
        p = self.plan('cloudflare_dns_record', {'type': 'CNAME'})
        resource = p['resource_changes'][0]
        resource['address'] = 'module.comunid.module.apps.cloudflare_dns_record.validation["tenants.comunid.app"]'
        resource['change']['after_unknown'] = {'name': True}
        module.review(p)
        resource['address'] = 'module.comunid.module.apps.cloudflare_dns_record.validation["comunid.app"]'
        with self.assertRaises(ValueError): module.review(p)

    def test_accepts_only_new_dns_names_and_distribution_aliases(self):
        for name in ['tenants.comunid.app', '*.comunid.app', '_abc.tenants.comunid.app']:
            module.review(self.plan('cloudflare_dns_record', {'name': name}))
        module.review(self.plan('aws_cloudfront_distribution', {'aliases': ['tenants.comunid.app', '*.comunid.app']}))


if __name__ == '__main__': unittest.main()
