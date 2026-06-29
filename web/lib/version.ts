// Pure, dependency-free version logic. The architect flagged this as THE real domain
// logic of the system — keep it here, server-side, and test it hard.
// Trivy already does the version verdict for server packages; this is mainly for the
// Website + Manual (Applications) tiers where mitre-explorer's `version=` filter is only a
// coarse substring match and the real "is this version affected" answer is ours.

export type Verdict = 'affected' | 'not_affected' | 'unknown';

/** Split a version into comparable tokens, e.g. "1.1.1n" -> [1,1,1,"n"]. */
function tokenize(v: string): (number | string)[] {
  return (v.trim().toLowerCase().replace(/^v/, '').match(/\d+|[a-z]+/g) ?? []).map((x) =>
    /^\d+$/.test(x) ? parseInt(x, 10) : x,
  );
}

/** Loose version compare. -1 if a<b, 0 if equal, 1 if a>b. Pads missing segments with 0. */
export function compareVersions(a: string, b: string): number {
  const ta = tokenize(a);
  const tb = tokenize(b);
  const n = Math.max(ta.length, tb.length);
  for (let i = 0; i < n; i++) {
    const x: number | string = ta[i] ?? 0;
    const y: number | string = tb[i] ?? 0;
    if (typeof x === 'number' && typeof y === 'number') {
      if (x !== y) return x < y ? -1 : 1;
    } else {
      const xs = String(x);
      const ys = String(y);
      if (xs !== ys) return xs < ys ? -1 : 1;
    }
  }
  return 0;
}

/** Check a version against a comma/space-separated constraint string like ">= 4.0.0, < 4.18.0".
 *  Returns null if the range can't be parsed. */
export function satisfiesRange(version: string, range: string): boolean | null {
  const parts = range.split(/[,&]+/).map((s) => s.trim()).filter(Boolean);
  if (!parts.length) return null;
  for (const p of parts) {
    const m = p.match(/^(>=|<=|>|<|==|=)?\s*(.+)$/);
    if (!m) return null;
    const op = m[1] || '=';
    const c = compareVersions(version, m[2].trim());
    const ok =
      op === '>=' ? c >= 0 :
      op === '>'  ? c > 0  :
      op === '<=' ? c <= 0 :
      op === '<'  ? c < 0  :
      c === 0;
    if (!ok) return false;
  }
  return true;
}

export interface VersionSpec {
  /** GHSA-style vulnerable range, e.g. ">= 4.0.0, < 4.18.0" (preferred when present). */
  range?: string | null;
  /** fixed version — affected if detected < fixed. */
  fixed?: string | null;
  /** CPE-ish lower bound (best-effort, treated inclusive). */
  start?: string | null;
  /** CPE-ish upper bound (best-effort, treated inclusive). */
  end?: string | null;
}

/**
 * Decide whether a detected version is affected. Returns 'unknown' (→ caller marks the
 * finding "advisory", never "confirmed") when the version is missing/unparseable or no
 * usable constraints exist — being honest beats guessing.
 */
export function isVersionAffected(
  detected: string | null | undefined,
  spec: VersionSpec,
): Verdict {
  if (!detected || tokenize(detected).length === 0) return 'unknown';

  if (spec.range) {
    const r = satisfiesRange(detected, spec.range);
    return r === null ? 'unknown' : r ? 'affected' : 'not_affected';
  }
  if (spec.fixed) {
    return compareVersions(detected, spec.fixed) < 0 ? 'affected' : 'not_affected';
  }
  if (spec.start || spec.end) {
    if (spec.start && compareVersions(detected, spec.start) < 0) return 'not_affected';
    if (spec.end && compareVersions(detected, spec.end) > 0) return 'not_affected';
    return 'affected';
  }
  return 'unknown';
}
