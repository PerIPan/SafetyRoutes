// Parse a Package URL (PURL) and map it to a mitre-explorer ecosystem.
// Trivy emits PURLs like:
//   pkg:deb/debian/openssl@1.1.1n-0+deb11u5?arch=amd64
//   pkg:npm/lodash@4.17.20
//   pkg:pypi/django@3.2.18
//   pkg:maven/org.apache.commons/commons-text@1.9

export interface Purl {
  type: string;
  namespace: string | null;
  name: string;
  version: string | null;
  raw: string;
}

export function parsePurl(raw: string): Purl | null {
  if (!raw || !raw.startsWith('pkg:')) return null;
  let s = raw.slice(4);
  // strip subpath (#...) and qualifiers (?...)
  s = s.split('#')[0].split('?')[0];
  // version is after the LAST '@' (PURL spec: name@version)
  let version: string | null = null;
  const at = s.lastIndexOf('@');
  if (at > 0) {
    version = decodeURIComponent(s.slice(at + 1));
    s = s.slice(0, at);
  }
  const segments = s.split('/').filter(Boolean);
  if (segments.length < 2) return null;
  const type = segments[0].toLowerCase();
  const name = decodeURIComponent(segments[segments.length - 1]);
  const namespace =
    segments.length > 2 ? segments.slice(1, -1).map(decodeURIComponent).join('/') : null;
  return { type, namespace, name, version, raw };
}

// PURL type -> mitre-explorer (GHSA) ecosystem for language packages.
const TYPE_TO_ECOSYSTEM: Record<string, string> = {
  npm: 'npm',
  pypi: 'pypi',
  gem: 'rubygems',
  golang: 'go',
  go: 'go',
  maven: 'maven',
  nuget: 'nuget',
  composer: 'composer',
  cargo: 'rust',
  pub: 'pub',
  hex: 'erlang',
  swift: 'swift',
  github: 'actions',
};

// OS-distro PURL types: the mitre-explorer (OSV) ecosystem is the distro, which PURL carries
// as the namespace (e.g. pkg:deb/debian/... -> "debian"). The mitre route matches case-insensitively.
const OS_TYPES = new Set(['deb', 'apk', 'rpm']);

/** The ecosystem to query mitre-explorer `/packages/{ecosystem}/{name}` with. */
export function ecosystemFor(p: Purl): string {
  if (TYPE_TO_ECOSYSTEM[p.type]) return TYPE_TO_ECOSYSTEM[p.type];
  if (OS_TYPES.has(p.type) && p.namespace) return p.namespace.toLowerCase();
  return p.type;
}
