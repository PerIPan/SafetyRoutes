// Single source of truth for the website scan-depth presentation (label / blurb / help copy /
// capability matrix). CLIENT-SAFE — no server imports — so the wizard, the help modal, and the
// server gateway (lib/artemis.ts, which attaches the actual Artemis module sets) all share it
// instead of keeping drifting copies.

export type ScanProfileKey = 'essentials' | 'standard' | 'thorough';

export interface ScanProfileMeta {
  key: ScanProfileKey;
  label: string;
  blurb: string; // short line under the radio in the wizard
  best: string; // "best for" line in the help modal
  speed: string; // relative speed shown in the comparison grid
}

export const SCAN_PROFILE_META: ScanProfileMeta[] = [
  {
    key: 'essentials',
    label: 'Essentials',
    blurb: 'The website vulnerability scan — known issues, the apps you run, exposed files, open ports.',
    best: 'A quick first look, or when you just want the core web scan fast.',
    speed: 'Fastest',
  },
  {
    key: 'standard',
    label: 'Standard',
    blurb: 'Essentials, plus email & DNS hygiene checks.',
    best: 'The right choice for most organizations.',
    speed: 'Medium',
  },
  {
    key: 'thorough',
    label: 'Thorough',
    blurb: 'Standard, plus extra DNS and domain-expiry checks. Most complete.',
    best: 'When you want the most complete picture and don’t mind waiting.',
    speed: 'Slowest',
  },
];

// Plain-language capability matrix for the help modal (which depth checks what).
export const SCAN_PROFILE_CHECKS: { label: string; in: Record<ScanProfileKey, boolean> }[] = [
  {
    label: 'Known vulnerabilities (outdated software)',
    in: { essentials: true, standard: true, thorough: true },
  },
  {
    label: 'Accidentally-exposed files & folders',
    in: { essentials: true, standard: true, thorough: true },
  },
  {
    label: 'Open ports & security headers',
    in: { essentials: true, standard: true, thorough: true },
  },
  {
    label: 'Email impersonation (SPF / DMARC)',
    in: { essentials: false, standard: true, thorough: true },
  },
  { label: 'Domain-expiry warning', in: { essentials: false, standard: true, thorough: true } },
  { label: 'Deeper DNS checks', in: { essentials: false, standard: false, thorough: true } },
];

export const DEFAULT_SCAN_PROFILE: ScanProfileKey = 'standard';

export function isScanProfile(v: unknown): v is ScanProfileKey {
  return v === 'essentials' || v === 'standard' || v === 'thorough';
}

// --- Nuclei depth tuning ------------------------------------------------------
// nuclei runtime is dominated by template count × target latency. We tie the nuclei severity
// threshold (an Artemis per-scan runtime config) and the website-tier wait window to depth so a
// quick "Essentials" finishes in minutes while "Thorough" trades time for coverage.
//
// critical_only still runs the high-signal template LISTS (KEV, exposed-panels, log-exposures) —
// those are not gated by the severity threshold — it only drops the thousands of high/medium CVE
// templates, which is where the time goes.
export type NucleiSeverity =
  | 'critical_only'
  | 'high_and_above'
  | 'medium_and_above'
  | 'low_and_above'
  | 'all';

// DEMO/POC: Artemis is configured (OVERRIDE_STANDARD_NUCLEI_TEMPLATES_TO_RUN) to scan only the
// ~469 actively-exploited CISA-KEV web templates. We send 'all' for every depth so the full KEV
// set runs (the override is the real bound); depth still varies which Artemis modules run.
export const SCAN_PROFILE_NUCLEI_SEVERITY: Record<ScanProfileKey, NucleiSeverity> = {
  essentials: 'all',
  standard: 'all',
  thorough: 'all',
};

/** How long the website tier waits for Artemis before finalizing — tied to depth so fast scans
 *  don't hang and thorough scans get room to complete. */
export const SCAN_PROFILE_WEBSITE_TIMEOUT_MS: Record<ScanProfileKey, number> = {
  essentials: 12 * 60_000,
  standard: 25 * 60_000,
  thorough: 45 * 60_000,
};

export function nucleiSeverityForProfile(profile?: string | null): NucleiSeverity {
  return SCAN_PROFILE_NUCLEI_SEVERITY[profile as ScanProfileKey] ?? SCAN_PROFILE_NUCLEI_SEVERITY.standard;
}

export function websiteTimeoutForProfile(profile?: string | null): number {
  return SCAN_PROFILE_WEBSITE_TIMEOUT_MS[profile as ScanProfileKey] ?? SCAN_PROFILE_WEBSITE_TIMEOUT_MS.standard;
}
