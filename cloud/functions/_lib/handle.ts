// Cloudflare Pages function logic for the dashboard buttons. Kept free of Cloudflare-specific types so
// it can be tested in Node: it only uses fetch, Request/Response and WebCrypto.
//
// Flow: Cloudflare Access (email login) → verify its signed JWT → validate the action → forward it to
// GitHub as a repository_dispatch event; the Autopilot workflow applies it and redeploys the dashboard.

import { parseAction } from '../../../src/controlsSchema.ts';

export interface Env {
  /** e.g. "strom-i-morgen.cloudflareaccess.com" */
  ACCESS_TEAM_DOMAIN?: string;
  /** Application Audience (AUD) tag of the Access application. */
  ACCESS_AUD?: string;
  /** Fine-grained GitHub token for this repo with "Contents: read and write". */
  GITHUB_TOKEN?: string;
  /** "owner/repo" */
  GITHUB_REPO?: string;
}

type FetchFn = typeof fetch;

const json = (status: number, body: object) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8' } });

const b64urlBytes = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '=')), (c) => c.charCodeAt(0));
const b64urlJson = (s: string) => JSON.parse(new TextDecoder().decode(b64urlBytes(s)));

/** Verify a Cloudflare Access JWT (RS256) and return the user's email, or throw. */
export async function verifyAccessJwt(token: string, env: Env, fetchFn: FetchFn = fetch, nowSec = Math.floor(Date.now() / 1000)): Promise<string> {
  const [h, p, sig] = token.split('.');
  if (!h || !p || !sig) throw new Error('malformed token');
  const header = b64urlJson(h) as { alg?: string; kid?: string };
  if (header.alg !== 'RS256') throw new Error('unexpected alg');
  const certs = (await (await fetchFn(`https://${env.ACCESS_TEAM_DOMAIN}/cdn-cgi/access/certs`)).json()) as { keys: (JsonWebKey & { kid?: string })[] };
  const jwk = certs.keys.find((k) => k.kid === header.kid);
  if (!jwk) throw new Error('unknown key');
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64urlBytes(sig), new TextEncoder().encode(`${h}.${p}`));
  if (!ok) throw new Error('bad signature');
  const claims = b64urlJson(p) as { aud?: string | string[]; exp?: number; iss?: string; email?: string };
  const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!aud.includes(env.ACCESS_AUD)) throw new Error('wrong audience');
  if (!claims.exp || claims.exp < nowSec) throw new Error('expired');
  if (claims.iss !== `https://${env.ACCESS_TEAM_DOMAIN}`) throw new Error('wrong issuer');
  if (!claims.email) throw new Error('no email');
  return claims.email;
}

function accessToken(request: Request): string | null {
  const header = request.headers.get('Cf-Access-Jwt-Assertion');
  if (header) return header;
  const cookie = request.headers.get('Cookie') ?? '';
  return cookie.match(/(?:^|;\s*)CF_Authorization=([^;]+)/)?.[1] ?? null;
}

/** POST /api/action */
export async function handleAction(request: Request, env: Env, fetchFn: FetchFn = fetch): Promise<Response> {
  if (!env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUD || !env.GITHUB_TOKEN || !env.GITHUB_REPO) {
    return json(503, { error: 'Dashboardet er ikke ferdig satt opp (mangler innstillinger i Cloudflare).' });
  }
  const token = accessToken(request);
  if (!token) return json(401, { error: 'Du er ikke logget inn.' });
  let email: string;
  try {
    email = await verifyAccessJwt(token, env, fetchFn);
  } catch {
    return json(401, { error: 'Innloggingen er ugyldig eller utløpt. Last inn siden på nytt.' });
  }

  let action;
  try {
    action = parseAction(((await request.json()) as { action?: unknown }).action);
  } catch (e) {
    return json(400, { error: (e as Error).message });
  }

  const res = await fetchFn(`https://api.github.com/repos/${env.GITHUB_REPO}/dispatches`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'strom-i-morgen-dashboard',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ event_type: 'dashboard-action', client_payload: { action, by: email } }),
  });
  if (res.status !== 204) return json(502, { error: `Kunne ikke sende til GitHub (status ${res.status}).` });
  return json(202, { ok: true, mode: 'cloud' });
}
