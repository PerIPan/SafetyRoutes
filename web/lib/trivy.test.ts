import { describe, it, expect } from 'vitest';
import { parseTrivyReport, looksLikeTrivy } from './trivy';

const sample = {
  SchemaVersion: 2,
  ArtifactName: 'test',
  Results: [
    {
      Target: 'app (debian 11)',
      Class: 'os-pkgs',
      Type: 'debian',
      Vulnerabilities: [
        {
          VulnerabilityID: 'CVE-2023-0286',
          PkgName: 'openssl',
          PkgIdentifier: { PURL: 'pkg:deb/debian/openssl@1.1.1n-0+deb11u4' },
          InstalledVersion: '1.1.1n-0+deb11u4',
          FixedVersion: '1.1.1n-0+deb11u5',
          Severity: 'HIGH',
          Title: 'openssl: X.400 address type confusion',
          PrimaryURL: 'https://avd.aquasec.com/nvd/cve-2023-0286',
        },
        {
          // duplicate of the above (same id+purl) — must be deduped
          VulnerabilityID: 'CVE-2023-0286',
          PkgName: 'openssl',
          PkgIdentifier: { PURL: 'pkg:deb/debian/openssl@1.1.1n-0+deb11u4' },
          Severity: 'HIGH',
        },
        {
          // malformed (no id) — must be skipped
          PkgName: 'curl',
          Severity: 'CRITICAL',
        },
      ],
    },
    {
      Target: 'requirements.txt',
      Class: 'lang-pkgs',
      Type: 'pip',
      Vulnerabilities: [
        {
          VulnerabilityID: 'CVE-2023-XYZ',
          PkgName: 'django',
          PkgIdentifier: { PURL: 'pkg:pypi/django@3.2.18' },
          InstalledVersion: '3.2.18',
          FixedVersion: '3.2.25',
          Severity: 'MEDIUM',
        },
      ],
    },
  ],
};

describe('looksLikeTrivy', () => {
  it('accepts a report with Results[]', () => {
    expect(looksLikeTrivy(sample)).toBe(true);
  });
  it('rejects non-reports', () => {
    expect(looksLikeTrivy({})).toBe(false);
    expect(looksLikeTrivy(null)).toBe(false);
    expect(looksLikeTrivy('nope')).toBe(false);
  });
});

describe('parseTrivyReport', () => {
  it('extracts, dedupes, and skips malformed entries', () => {
    const out = parseTrivyReport(sample);
    expect(out.parsedCount).toBe(2); // openssl (deduped) + django
    expect(out.skippedCount).toBe(2); // duplicate + malformed(no id)
    const openssl = out.findings.find((f) => f.pkgName === 'openssl')!;
    expect(openssl).toMatchObject({
      vulnerabilityId: 'CVE-2023-0286',
      ecosystem: 'debian',
      installedVersion: '1.1.1n-0+deb11u4',
      fixedVersion: '1.1.1n-0+deb11u5',
      severity: 'high',
    });
    const django = out.findings.find((f) => f.pkgName === 'django')!;
    expect(django.ecosystem).toBe('pypi');
    expect(django.severity).toBe('medium');
  });
  it('throws on a non-Trivy object', () => {
    expect(() => parseTrivyReport({ foo: 1 })).toThrow(/Trivy/);
  });
});
