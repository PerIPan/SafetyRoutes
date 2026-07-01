export type ScanStatus =
  | 'pending' | 'verifying' | 'scanning' | 'enriching' | 'done' | 'failed' | 'timed_out';

export type FindingSource = 'website' | 'server' | 'other';
export type FindingConfidence = 'confirmed' | 'advisory' | 'no_issue';
export type FindingSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';

/** A normalized finding. Every tier produces these; the report renders them uniformly. */
export interface Finding {
  id?: string;
  scanId: string;
  source: FindingSource;
  confidence: FindingConfidence;
  title: string;
  plainExplanation?: string | null;
  severity?: FindingSeverity | null;
  severityPlain?: string | null;
  fixText?: string | null;
  cveId?: string | null;
  // prioritization (enrichment-derived; KEV-first ordering + report bands)
  isKev?: boolean | null;
  epss?: number | null;
  cvss?: number | null;
  // website
  artemisFindingId?: string | null;
  module?: string | null;
  // server
  trivyUploadId?: string | null;
  purl?: string | null;
  packageName?: string | null;
  ecosystem?: string | null;
  installedVersion?: string | null;
  fixedVersion?: string | null;
  // other
  declaredSoftwareId?: string | null;
  // enrichment
  enrichmentStatus?: 'pending' | 'done' | 'unavailable';
  idempotencyKey?: string | null;
}

export interface SourceStatus {
  status: 'skipped' | 'pending' | 'running' | 'done' | 'failed' | 'timed_out';
  message?: string;
  count?: number;
}

export interface Scan {
  id: string;
  orgId: string;
  domain: string | null;
  status: ScanStatus;
  profile: string; // website scan depth (essentials | standard | thorough)
  uploadToken: string | null; // authorizes a curl-piped Trivy POST
  sourceStatus: Partial<Record<FindingSource, SourceStatus>>;
  createdAt: string;
  authorization: AuthorizationSnapshot | null; // immutable consent record
  orgContext: OrgContext | null; // mutable prompt-conditioning for the business report
  businessReport: BusinessReport | null; // cached LLM/fallback summary
}

/** Immutable consent record captured at scan creation; printed verbatim on the auth page. */
export interface AuthorizationSnapshot {
  organizationName: string;
  authorizedBy: string;
  contactEmail: string | null;
  domain: string | null;
  profile: string;
  acceptedAt: string; // ISO
  authorizationId: string; // SR-XXXXXXXX
}

/** Mutable context used only to tailor the business-impact summary. The first three are org-typed;
 *  siteSummary is auto-derived at report time from the org's own authorized website. */
export interface OrgContext {
  whatOrgDoes?: string | null;
  whoWeServe?: string | null;
  sensitiveData?: string | null;
  siteSummary?: string | null;
}

/** One business-impact statement, grounded in specific findings (evidence ids f1, f2…). */
export interface BusinessImpact {
  evidenceIds: string[];
  statement: string;
}

/** Plain-language, business-facing summary shown at the top of the report. */
export interface BusinessReport {
  headline: string;
  overview: string;
  impacts: BusinessImpact[];
  actions: string[];
  positive: string;
  generatedBy: 'gemini' | 'fallback';
}

export const SEVERITY_ORDER: Record<FindingSeverity, number> = {
  critical: 0, high: 1, medium: 2, low: 3, info: 4,
};
