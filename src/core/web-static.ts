import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Static dashboard delivery. Every request resolves to one regular file below
 * the package-root `ui/dist` directory; there is no SPA fallback beyond the
 * index request, no traversal, and no directory listing.
 */

const UI_SUBPATH = ['ui', 'dist'];
const INDEX_FILE = 'index.html';

/** Package-root `ui/dist` for both `src/core` under tsx and `dist/core` shipped. */
export function resolveUiDir(): string {
  return path.join(fileURLToPath(new URL('../../', import.meta.url)), ...UI_SUBPATH);
}

/** Self-only policy for the generated application plus same-origin SSE. */
export const UI_CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self'",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join('; ');

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

const REVALIDATE = 'no-cache';
const IMMUTABLE = 'public, max-age=31536000, immutable';
const FINGERPRINT = /-[A-Za-z0-9_]{8,}\./;

/** Fingerprinted build assets may be cached immutably; everything else revalidates. */
export function isFingerprintedAsset(fileName: string): boolean {
  return FINGERPRINT.test(fileName);
}

/** One resolved static file with its delivery metadata. */
export interface StaticAsset {
  readonly body: Buffer;
  readonly contentType: string;
  readonly cacheControl: string;
  readonly isHtml: boolean;
}

/** Decode a URL pathname once, rejecting malformed escapes and null bytes. */
function decodePathname(pathname: string): string | null {
  try {
    const decoded = decodeURIComponent(pathname);
    return decoded.includes('\0') ? null : decoded;
  } catch {
    return null;
  }
}

function isInside(root: string, target: string): boolean {
  const relative = path.relative(root, target);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

/**
 * Resolve `pathname` to one regular file inside `uiDir`. Returns null for
 * malformed escapes, traversal, dot segments, directories, and absent files.
 * `/` and `/index.html` both resolve to the application shell.
 */
export async function resolveStaticFile(
  pathname: string,
  uiDir: string = resolveUiDir(),
): Promise<StaticAsset | null> {
  const decoded = decodePathname(pathname);
  if (decoded === null) return null;
  const segments = decoded.split('/').filter((segment) => segment !== '');
  if (segments.some((segment) => segment === '.' || segment === '..')) return null;

  const root = path.resolve(uiDir);
  const target =
    segments.length === 0
      ? path.join(root, INDEX_FILE)
      : path.resolve(root, segments.join(path.sep));
  if (!isInside(root, target)) return null;

  const stat = await fs.lstat(target).catch(() => null);
  if (!stat || !stat.isFile()) return null;

  const body = await fs.readFile(target);
  const extension = path.extname(target).toLowerCase();
  const isHtml = extension === '.html';
  const cacheControl = isHtml
    ? REVALIDATE
    : isFingerprintedAsset(path.basename(target))
      ? IMMUTABLE
      : REVALIDATE;
  return {
    body,
    contentType: CONTENT_TYPES[extension] ?? 'application/octet-stream',
    cacheControl,
    isHtml,
  };
}
