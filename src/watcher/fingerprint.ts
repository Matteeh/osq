import { createHash } from 'node:crypto';
import { parseFrontmatter } from '../core/spec/parser.js';

// Built from a char code so the escape byte never appears as a regex control
// character literal.
const ANSI_PATTERN = new RegExp(
  `${String.fromCharCode(27)}\\[[0-9;?]*[ -/]*[@-~]|${String.fromCharCode(27)}\\][^\\u0007]*(?:\\u0007|${String.fromCharCode(27)}\\\\)`,
  'g',
);

const ISO_TIMESTAMP = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?/g;
const DURATION = /\(?\b\d+(?:\.\d+)?(?:ms|s|m|h)\b\)?/g;
const PID = /\bpid\s*[:=]?\s*\d+/gi;

/** Strip ANSI escape sequences (CSI and OSC) from terminal text. */
export function stripAnsi(text: string): string {
  return text.replace(ANSI_PATTERN, '');
}

/**
 * Normalize a dead marker body for fingerprinting: drop ANSI codes, replace the
 * project root, timestamps, durations, and PIDs with fixed placeholders, and
 * leave every other byte untouched.
 */
export function normalizeFailureBody(body: string, projectRoot?: string): string {
  let normalized = stripAnsi(body);
  if (projectRoot) {
    normalized = normalized.split(projectRoot).join('<root>');
  }
  return normalized
    .replace(ISO_TIMESTAMP, '<time>')
    .replace(DURATION, '<duration>')
    .replace(PID, 'pid <pid>');
}

/**
 * `sha256:<hex>` over the frontmatter `reason`, a newline, and the normalized
 * body after the frontmatter. Content without frontmatter has an empty reason.
 */
export function markerFingerprint(content: string, projectRoot?: string): string {
  const { data, body } = parseFrontmatter(content);
  const reason = typeof data.reason === 'string' ? data.reason : '';
  const digest = createHash('sha256')
    .update(`${reason}\n${normalizeFailureBody(body, projectRoot)}`)
    .digest('hex');
  return `sha256:${digest}`;
}

/**
 * Insert `fingerprint: sha256:<hex>` inside the marker's frontmatter. Content
 * without frontmatter gains a minimal block; every other byte is preserved.
 */
export function addFingerprint(content: string, projectRoot?: string): string {
  const fingerprint = markerFingerprint(content, projectRoot);
  const match = content.match(/^(---\r?\n(?:[\s\S]*?\r?\n)?)(---)/);
  if (!match) {
    return `---\nfingerprint: ${fingerprint}\n---\n${content}`;
  }
  const head = match[1];
  return `${head}fingerprint: ${fingerprint}\n${content.slice(head.length)}`;
}
