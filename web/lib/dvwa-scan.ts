// Active demonstration scan for the bundled DVWA test target — and ONLY that target.
//
// DVWA is deliberately vulnerable and almost entirely AUTH-GATED, so a passive `nuclei -as` barely
// sees it. DVWA is our own container on the scanner's Docker network and active testing of it is
// explicitly in scope (it's a teaching target), so here we do what a passive scan can't: log in,
// drop the security level to "low", and actively CONFIRM DVWA's signature vulnerabilities by sending
// a known payload and checking for its unmistakable result. Each becomes a Confirmed finding.
//
// This is gated to the internal DVWA host by the caller (lib/tiers/website.ts → isInternalScanHost),
// so it never touches a real user site. The app runs on the host, which can't resolve the in-container
// name `dvwa`, so we reach DVWA over its published host port (DVWA_HOST_URL, default 127.0.0.1:4280).

const DVWA_URL = (process.env.DVWA_HOST_URL || 'http://127.0.0.1:4280').replace(/\/$/, '');
const DVWA_USER = process.env.DVWA_USERNAME || 'admin';
const DVWA_PASS = process.env.DVWA_PASSWORD || 'password';
const STEP_TIMEOUT = 10_000;

export interface DvwaFinding {
  id: string;
  title: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  explanation: string;
  fix: string;
  evidence: string | null;
}

export interface DvwaResult {
  status: 'ran' | 'unreachable' | 'error';
  findings: DvwaFinding[];
}

type Jar = Record<string, string>;

function mergeCookies(res: Response, jar: Jar) {
  const all = (res.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie?.() ?? [];
  for (const c of all) {
    const m = /^([^=]+)=([^;]+)/.exec(c);
    if (m) jar[m[1]] = m[2];
  }
}
function cookieHeader(jar: Jar): string {
  return Object.entries(jar)
    .map(([k, v]) => `${k}=${v}`)
    .join('; ');
}
function userToken(html: string): string | null {
  const m = /name=['"]user_token['"]\s+value=['"]([0-9a-f]+)['"]/i.exec(html);
  return m ? m[1] : null;
}

async function req(
  jar: Jar,
  path: string,
  init: { method?: 'GET' | 'POST'; form?: Record<string, string> } = {},
): Promise<{ status: number; location: string | null; body: string }> {
  const res = await fetch(`${DVWA_URL}${path}`, {
    method: init.method ?? 'GET',
    headers: {
      cookie: cookieHeader(jar),
      ...(init.form ? { 'content-type': 'application/x-www-form-urlencoded' } : {}),
    },
    body: init.form ? new URLSearchParams(init.form).toString() : undefined,
    redirect: 'manual',
    signal: AbortSignal.timeout(STEP_TIMEOUT),
  });
  mergeCookies(res, jar);
  const body = res.status === 200 ? await res.text() : '';
  return { status: res.status, location: res.headers.get('location'), body };
}

/** Authenticate as admin/password. Returns true if the session lands on index.php (login worked). */
async function login(jar: Jar): Promise<boolean> {
  const page = await req(jar, '/login.php');
  const token = userToken(page.body);
  const r = await req(jar, '/login.php', {
    method: 'POST',
    form: {
      username: DVWA_USER,
      password: DVWA_PASS,
      Login: 'Login',
      ...(token ? { user_token: token } : {}),
    },
  });
  return (r.location ?? '').includes('index.php');
}

/** Build a Confirmed finding only when the active payload's signature is present. */
export async function runDvwaScan(): Promise<DvwaResult> {
  const jar: Jar = {};
  const findings: DvwaFinding[] = [];

  // 1. Log in. A successful admin/password login IS a finding (default credentials), and a
  //    prerequisite for the rest. If we can't even reach DVWA, report unreachable.
  let loggedIn: boolean;
  try {
    loggedIn = await login(jar);
  } catch {
    return { status: 'unreachable', findings: [] };
  }
  if (!loggedIn) {
    // reachable but creds changed — still "ran", just nothing confirmed via the default account
    return { status: 'ran', findings: [] };
  }
  findings.push({
    id: 'default-credentials',
    title: 'Admin account uses a default password',
    severity: 'critical',
    explanation:
      `The administrator account signs in with the well-known default username and password ` +
      `(“${DVWA_USER}” / “${DVWA_PASS}”). Anyone who knows the product can log straight in as admin.`,
    fix: 'Change the admin password to a strong, unique one immediately, and remove or rename default accounts.',
    evidence: `Logged in as “${DVWA_USER}” with the default password.`,
  });

  // 2. Initialise the app DB (idempotent) and drop security to "low" so the lessons are exploitable —
  //    this mirrors how a misconfigured/instructional deployment is typically left.
  try {
    const setup = await req(jar, '/setup.php');
    const t = userToken(setup.body);
    if (t) await req(jar, '/setup.php', { method: 'POST', form: { create_db: 'Create / Reset Database', user_token: t } });
    await login(jar); // a DB reset invalidates the session — sign back in
    const sec = await req(jar, '/security.php');
    const st = userToken(sec.body);
    if (st) await req(jar, '/security.php', { method: 'POST', form: { security: 'low', seclev_submit: 'Submit', user_token: st } });
    jar.security = 'low';
  } catch {
    /* best-effort — the checks below each guard their own result */
  }

  // 3. Active confirmations — each only fires on its unmistakable signature.
  const checks: Array<() => Promise<DvwaFinding | null>> = [
    async () => {
      const r = await req(jar, '/vulnerabilities/exec/', {
        method: 'POST',
        form: { ip: '127.0.0.1;id', Submit: 'Submit' },
      });
      const m = r.body.match(/uid=\d+\([^)]+\)[^<\n]*/);
      return m
        ? {
            id: 'os-command-injection',
            title: 'A form runs operating-system commands from user input',
            severity: 'critical',
            explanation:
              'The “ping” feature passes whatever is typed straight to the server’s command line. ' +
              'We appended a second command and the server ran it — an attacker could run any command on the server.',
            fix: 'Never build shell commands from user input. Validate inputs strictly and use safe library calls instead of the shell.',
            evidence: m[0].slice(0, 120),
          }
        : null;
    },
    async () => {
      const r = await req(jar, `/vulnerabilities/sqli/?id=${encodeURIComponent("1' OR '1'='1")}&Submit=Submit`);
      const rows = (r.body.match(/First name/gi) || []).length;
      return rows > 1
        ? {
            id: 'sql-injection',
            title: 'A lookup form lets you read the whole database',
            severity: 'critical',
            explanation:
              'The user-lookup form builds its database query from the text you enter. We submitted a ' +
              `classic injection and it returned every account (${rows} records) instead of one — so an ` +
              'attacker could read or alter your data.',
            fix: 'Use parameterised queries (prepared statements) everywhere; never concatenate user input into SQL.',
            evidence: `Injection returned ${rows} records from a single-record form.`,
          }
        : null;
    },
    async () => {
      const payload = '<script>alert(1)</script>';
      const r = await req(jar, `/vulnerabilities/xss_r/?name=${encodeURIComponent(payload)}`);
      return r.body.includes(payload)
        ? {
            id: 'reflected-xss',
            title: 'A page echoes input back as live code (cross-site scripting)',
            severity: 'high',
            explanation:
              'Text from the address bar is shown on the page without being made safe, so a crafted link ' +
              'can run code in a visitor’s browser — used to steal logins or deface the page.',
            fix: 'Escape all user input on output (HTML-encode), and add a Content-Security-Policy.',
            evidence: 'Submitted <script> tag was reflected unescaped in the page.',
          }
        : null;
    },
    async () => {
      const r = await req(jar, '/vulnerabilities/fi/?page=/etc/passwd');
      return /root:.*:0:0:/.test(r.body)
        ? {
            id: 'file-inclusion',
            title: 'A page parameter can open arbitrary server files',
            severity: 'high',
            explanation:
              'The “page” parameter loads whatever file path it’s given. We pointed it at a system file ' +
              '(/etc/passwd) and the server returned its contents — a path traversal that can expose secrets ' +
              'or, in some setups, run attacker code.',
            fix: 'Never use raw user input as a file path. Allow only a fixed list of known pages.',
            evidence: 'Server returned the contents of /etc/passwd.',
          }
        : null;
    },
  ];

  for (const check of checks) {
    try {
      const f = await check();
      if (f) findings.push(f);
    } catch {
      /* a single failed check shouldn't abort the others */
    }
  }

  return { status: 'ran', findings };
}
