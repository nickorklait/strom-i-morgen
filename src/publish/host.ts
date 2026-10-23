import { spawn, spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';

export interface ImageHost {
  /** Public URL for a file in the hosted directory. */
  url(file: string): string;
  close(): Promise<void>;
}

/** Use an existing public web host that serves `dir` at `baseUrl`. */
export function staticHost(baseUrl: string): ImageHost {
  return { url: (f) => `${baseUrl.replace(/\/$/, '')}/${encodeURIComponent(f)}`, close: async () => {} };
}

/** cloudflared on PATH, or in its default install folders (a terminal opened before the install has an old PATH). */
export function cloudflaredPath(): string | null {
  if (spawnSync('cloudflared', ['--version'], { shell: true }).status === 0) return 'cloudflared';
  const candidates = [
    'C:\\Program Files (x86)\\cloudflared\\cloudflared.exe',
    'C:\\Program Files\\cloudflared\\cloudflared.exe',
    path.join(process.env.LOCALAPPDATA ?? '', 'Microsoft', 'WinGet', 'Links', 'cloudflared.exe'),
  ];
  return candidates.find((c) => fs.existsSync(c)) ?? null;
}

export const cloudflaredAvailable = () => cloudflaredPath() !== null;

/**
 * Serve only the JPEGs in `dir`, under a random path, through a temporary Cloudflare quick tunnel
 * (no account needed). Meta downloads the images from there; the tunnel is closed right after.
 */
export async function tunnelHost(dir: string, log = console.log): Promise<ImageHost> {
  const exe = cloudflaredPath();
  if (!exe) {
    throw new Error(
      'Instagram downloads the images from a public URL. Install the Cloudflare tunnel tool once:\n' +
        '  winget install --id Cloudflare.cloudflared\n' +
        'and open a new terminal. Or set "publish.imageBaseUrl" in config/club.json to a web host that serves output/.',
    );
  }
  const secret = crypto.randomBytes(12).toString('hex');
  const server = http.createServer((req, res) => {
    const m = (req.url ?? '').match(/^\/([0-9a-f]+)\/([\w.-]+\.jpg)$/);
    const file = m && m[1] === secret ? path.join(dir, m[2]) : null;
    if (!file || !fs.existsSync(file)) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Content-Length': fs.statSync(file).size });
    fs.createReadStream(file).pipe(res);
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const port = (server.address() as AddressInfo).port;

  // No shell: then kill() stops cloudflared itself, not just a cmd.exe wrapper.
  const proc = spawn(exe, ['tunnel', '--no-autoupdate', '--url', `http://127.0.0.1:${port}`]);
  let output = '';
  const base = await new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('cloudflared did not connect within 60 s')), 60_000);
    const onData = (chunk: Buffer) => {
      output += chunk.toString();
      const url = output.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
      // The URL is printed before the tunnel works; wait until a connection is registered.
      if (url && /Registered tunnel connection/.test(output)) {
        clearTimeout(timer);
        resolve(url[0]);
      }
    };
    proc.stderr.on('data', onData);
    proc.stdout.on('data', onData);
    proc.on('exit', (code) => reject(new Error(`cloudflared exited (${code})`)));
  }).catch(async (e) => {
    proc.kill();
    await new Promise((r) => server.close(r));
    throw e;
  });

  const host: ImageHost = {
    url: (f) => `${base}/${secret}/${f}`,
    close: async () => {
      proc.kill();
      await new Promise((r) => server.close(r));
    },
  };

  // Best-effort self-check. Meta fetches the images over its own network; if that fails the API
  // reports an error and nothing is posted, so a failed local check (e.g. cached DNS) only warns.
  const probe = fs.readdirSync(dir).find((f) => f.endsWith('.jpg'));
  if (probe) {
    await new Promise((r) => setTimeout(r, 3000));
    let ok = false;
    for (let i = 0; i < 5 && !ok; i++) {
      ok = await fetch(host.url(probe), { method: 'HEAD' }).then((r) => r.ok, () => false);
      if (!ok) await new Promise((r) => setTimeout(r, 3000));
    }
    if (!ok) log(`Note: could not reach ${base} from this PC (often cached DNS); continuing, Instagram checks it itself.`);
  }
  log(`Images served temporarily via ${base}`);
  return host;
}
