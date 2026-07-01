import type { Finding } from './types';

export const BUILT_IN_TEST_DOMAIN = 'test-site.safetyroutes.local';

export function testSiteFindings(scanId: string): Finding[] {
  return [
    {
      scanId, source: 'website', confidence: 'confirmed', severity: 'high',
      title: 'Built-in test: exposed backup file',
      plainExplanation: 'The test site intentionally exposes a harmless example backup filename. On a real site, backups can reveal private data or credentials.',
      fixText: 'Keep backups outside the public web folder and block common backup extensions.',
      module: 'safetyroutes-test-site', artemisFindingId: 'fixture-backup',
      enrichmentStatus: 'done', idempotencyKey: `${scanId}:test-site:backup`,
    },
    {
      scanId, source: 'website', confidence: 'confirmed', severity: 'medium',
      title: 'Built-in test: security headers need attention',
      plainExplanation: 'The test page simulates missing browser protections so the report workflow can be demonstrated safely.',
      fixText: 'Set a Content-Security-Policy and other recommended response headers at the web server.',
      module: 'safetyroutes-test-site', artemisFindingId: 'fixture-headers',
      enrichmentStatus: 'done', idempotencyKey: `${scanId}:test-site:headers`,
    },
  ];
}
