/**
 * Probes the phone over plain HTTP before any browser launches, so an
 * unreachable device fails in seconds with an actionable checklist instead of
 * 20 timed-out browser tests.
 */

export interface Capability {
  id: string;
  name: string;
  category: string;
  available: boolean;
  requires_network: boolean;
  summary: string;
  endpoints: string[];
  /** Present only when `available` is false. */
  reason?: string;
}

export interface Health {
  app: string;
  status: string;
  uptime_s: number;
  version: string;
}

export interface Probe {
  baseUrl: string;
  token: string;
  health: Health;
  capabilities: Capability[];
  /** e.g. { 'en>de': 'installed' } */
  translationPairs: Record<string, string>;
  transcribeLocales: { installed: string[]; supported: string[] };
  /** null when GET /v1/images/styles answered 503 (Apple Intelligence gated). */
  imageStyles: string[] | null;
  voices: { identifier: string; name: string; language: string }[];
  reachedAt: string;
}

/** The same five points the console logs on a failed connect. */
export const CONNECT_CHECKLIST = [
  '  1. Are the phone and this computer on the same Wi-Fi? SIDECAR_URL must match the phone\'s Connect card exactly.',
  '  2. Is the Sidecar ML app open in the FOREGROUND with the server running? iOS suspends the server when the app is backgrounded or the phone locks.',
  '  3. Open <SIDECAR_URL>/health in a browser tab. JSON there means the network is fine.',
  '  4. On the phone: Settings -> Privacy & Security -> Local Network -> Sidecar ML must be ON.',
  '  5. If the phone shows an address on pdp_ip0 (cellular) rather than en0 (Wi-Fi), it is not reachable from this computer.',
].join('\n');

function headers(token: string): Record<string, string> {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function getJson<T>(
  baseUrl: string,
  path: string,
  token: string,
  timeoutMs = 15_000,
): Promise<T> {
  const url = `${baseUrl.replace(/\/+$/, '')}${path}`;
  const response = await fetch(url, {
    headers: headers(token),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) {
    let detail = `HTTP ${response.status}`;
    try {
      const body = (await response.json()) as { error?: { code?: string; message?: string } };
      if (body?.error) detail = `HTTP ${response.status} [${body.error.code}] ${body.error.message}`;
    } catch {
      // non-JSON error body
    }
    throw new Error(`GET ${path} -> ${detail}`);
  }
  return response.json() as Promise<T>;
}

/** Returns null instead of throwing when the route answers 503. */
async function getJsonOr503<T>(baseUrl: string, path: string, token: string): Promise<T | null> {
  try {
    return await getJson<T>(baseUrl, path, token);
  } catch (error) {
    if (String(error).includes('503') || String(error).includes('capability_unavailable')) return null;
    throw error;
  }
}

export function resolveBaseUrl(): string {
  const raw = process.env.SIDECAR_URL?.trim();
  if (!raw) {
    throw new Error(
      [
        'SIDECAR_URL is not set.',
        '',
        "Set it to the address shown on the phone's Connect card, e.g.",
        '  SIDECAR_URL=http://192.168.1.20:8080 npm run e2e',
        '',
        'To find it: read it off the app, or browse Bonjour for _sidecarml._tcp',
        '  macOS: dns-sd -B _sidecarml._tcp',
        '  Linux: avahi-browse -rt _sidecarml._tcp',
      ].join('\n'),
    );
  }
  if (/^https:/i.test(raw)) {
    throw new Error(
      `SIDECAR_URL is https (${raw}). The phone serves plain HTTP; an https origin would also block the console as mixed content.`,
    );
  }
  if (/^https?:\/\/(127\.0\.0\.1|localhost)(:|\/|$)/i.test(raw) && !process.env.SIDECAR_E2E_ALLOW_LOOPBACK) {
    throw new Error(
      [
        `SIDECAR_URL points at this computer (${raw}), not the phone.`,
        "Use the address on the phone's Connect card (e.g. http://192.168.1.20:8080).",
        'If you are deliberately tunnelling over USB with `iproxy 8080:8080`, set',
        'SIDECAR_E2E_ALLOW_LOOPBACK=1 to silence this check.',
      ].join('\n'),
    );
  }
  return raw.replace(/\/+$/, '');
}

export async function probe(): Promise<Probe> {
  const baseUrl = resolveBaseUrl();
  const token = process.env.SIDECAR_TOKEN?.trim() ?? '';

  let health: Health;
  try {
    // /health needs no auth, so this isolates reachability from token problems.
    health = await getJson<Health>(baseUrl, '/health', '', 5_000);
  } catch (error) {
    throw new Error(
      [`Cannot reach the phone at ${baseUrl}: ${String(error)}`, '', 'Checklist:', CONNECT_CHECKLIST].join(
        '\n',
      ),
    );
  }

  // Unlike /health this one honours the bearer token, so it doubles as an
  // auth check when SIDECAR_TOKEN is set.
  const capabilities = await getJson<Capability[]>(baseUrl, '/v1/capabilities', token);
  if (!Array.isArray(capabilities)) {
    throw new Error('GET /v1/capabilities did not return a JSON array — is this really a Sidecar ML phone?');
  }

  const pairs = (process.env.SIDECAR_E2E_PAIRS ?? 'en>de').split(',').map((p) => p.trim()).filter(Boolean);
  const translationPairs: Record<string, string> = {};
  for (const pair of pairs) {
    const [source, target] = pair.split('>');
    if (!source || !target) continue;
    try {
      const result = await getJson<{ pair_status?: string }>(
        baseUrl,
        `/v1/translation/languages?source=${encodeURIComponent(source)}&target=${encodeURIComponent(target)}`,
        token,
      );
      translationPairs[pair] = result.pair_status ?? 'unknown';
    } catch {
      translationPairs[pair] = 'unreachable';
    }
  }

  // Never pass download=true here — installing a locale model takes minutes.
  const transcribeLocales =
    (await getJsonOr503<{ installed: string[]; supported: string[] }>(
      baseUrl,
      '/v1/speech/transcribe/locales',
      token,
    )) ?? { installed: [], supported: [] };

  // A 503 here is a stronger signal than the capability flag: it also catches
  // "app is backgrounded".
  const styles = await getJsonOr503<{ styles: string[] }>(baseUrl, '/v1/images/styles', token);
  const voices = (await getJsonOr503<{ voices: Probe['voices'] }>(baseUrl, '/v1/speech/voices', token))
    ?.voices ?? [];

  return {
    baseUrl,
    token,
    health,
    capabilities,
    translationPairs,
    transcribeLocales,
    imageStyles: styles ? styles.styles : null,
    voices,
    reachedAt: new Date().toISOString(),
  };
}

export function summarise(p: Probe): string {
  const available = p.capabilities.filter((c) => c.available);
  const lines = [
    `Phone: ${p.health.app} ${p.health.version} @ ${p.baseUrl} (up ${p.health.uptime_s}s)`,
    `Capabilities: ${available.length}/${p.capabilities.length} available`,
  ];
  for (const capability of p.capabilities.filter((c) => !c.available)) {
    lines.push(`  unavailable: ${capability.id} — ${capability.reason ?? 'no reason given'}`);
  }
  lines.push(`Translation pairs: ${JSON.stringify(p.translationPairs)}`);
  lines.push(`Transcribe locales installed: ${p.transcribeLocales.installed.join(', ') || '(none)'}`);
  lines.push(`Image styles: ${p.imageStyles ? p.imageStyles.join(', ') || '(none)' : '503 — gated'}`);
  lines.push(`Voices: ${p.voices.length}`);
  lines.push(`Auth: ${p.token ? 'bearer token supplied' : 'no token'}`);
  return lines.join('\n');
}
