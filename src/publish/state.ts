import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from '../config.ts';

const DATA = path.join(ROOT, 'data');
const LOG = path.join(DATA, 'published.json');
const TOKEN = path.join(DATA, 'instagram-token.json');
const ENV = path.join(ROOT, '.env');

export interface PublishedEntry {
  publishedAt: string;
  kind: 'feed' | 'story';
  mediaIds: string[];
  permalink: string | null;
  /** Added for the sponsor report (missing on the earliest entries). */
  label?: string;
  sponsors?: string[];
  teams?: string[];
  images?: number;
  /** First image, "week/file.png". */
  thumb?: string;
}

/** What has been published, keyed by PublicationUnit.key. Prevents double posting. */
export function readPublished(): Record<string, PublishedEntry> {
  return fs.existsSync(LOG) ? JSON.parse(fs.readFileSync(LOG, 'utf8')) : {};
}

export function recordPublished(key: string, entry: PublishedEntry): void {
  const all = readPublished();
  all[key] = entry;
  fs.writeFileSync(LOG, JSON.stringify(all, null, 2));
}

export interface Credentials {
  /** Instagram professional account ID; may be empty in .env (looked up from the token). */
  userId: string;
  token: string;
  /** When the token was last obtained or refreshed (ISO). */
  refreshedAt: string;
  /** Hash of the .env token this one was refreshed from; a new .env token wins. */
  envTokenHash?: string;
}

export const tokenHash = (t: string) => crypto.createHash('sha256').update(t).digest('hex').slice(0, 16);

/**
 * INSTAGRAM_USER_ID and INSTAGRAM_ACCESS_TOKEN come from the environment or .env.
 * After the first refresh the newer token is kept in data/instagram-token.json (git-ignored).
 */
// In the cloud the refreshed token is committed to the repo, so it is stored encrypted (AES-256-GCM)
// with TOKEN_ENCRYPTION_KEY from the secrets. Locally, without that key, it is a plain git-ignored file.
const ENC = path.join(DATA, 'instagram-token.enc');
const encryptionKey = () => (process.env.TOKEN_ENCRYPTION_KEY ? crypto.createHash('sha256').update(process.env.TOKEN_ENCRYPTION_KEY).digest() : null);

function readStored(): Credentials | null {
  const key = encryptionKey();
  if (key) {
    if (!fs.existsSync(ENC)) return null;
    try {
      const buf = Buffer.from(fs.readFileSync(ENC, 'utf8'), 'base64');
      const decipher = crypto.createDecipheriv('aes-256-gcm', key, buf.subarray(0, 12));
      decipher.setAuthTag(buf.subarray(12, 28));
      return JSON.parse(Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()]).toString('utf8'));
    } catch {
      console.warn('Could not decrypt data/instagram-token.enc (wrong TOKEN_ENCRYPTION_KEY?); using INSTAGRAM_ACCESS_TOKEN.');
      return null;
    }
  }
  return fs.existsSync(TOKEN) ? (JSON.parse(fs.readFileSync(TOKEN, 'utf8')) as Credentials) : null;
}

export function loadCredentials(): Credentials | null {
  if (fs.existsSync(ENV)) process.loadEnvFile(ENV);
  const stored = readStored();
  const userId = process.env.INSTAGRAM_USER_ID ?? stored?.userId;
  const envToken = process.env.INSTAGRAM_ACCESS_TOKEN;
  if (!(envToken || stored?.token)) return null;
  // A refreshed token is newer than the one in .env, unless .env has been given a new token since.
  if (stored?.token && (!envToken || stored.envTokenHash === tokenHash(envToken))) return stored;
  if (!envToken) return null;
  // The user ID is optional: publish looks it up from the token.
  return { userId: userId ?? '', token: envToken, refreshedAt: new Date(0).toISOString(), envTokenHash: tokenHash(envToken) };
}

export function saveCredentials(c: Credentials): void {
  const key = encryptionKey();
  if (!key) {
    fs.writeFileSync(TOKEN, JSON.stringify(c, null, 2));
    return;
  }
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([cipher.update(JSON.stringify(c), 'utf8'), cipher.final()]);
  fs.writeFileSync(ENC, Buffer.concat([iv, cipher.getAuthTag(), data]).toString('base64'));
}
