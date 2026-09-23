import path from 'node:path';
import { firstNonEmptyString } from '../stream.js';

const SUMMARY_MAX = 60;

/** Relativize an absolute path under the project root, leaving relative paths. */
export function toProjectRelative(target: string, projectRoot: string): string {
  return path.isAbsolute(target) ? path.relative(projectRoot, target) : target;
}

/** Short, human-readable tool summary following Pi's tool argument shapes. */
export function piToolSummary(toolName: string, args: Record<string, unknown> | undefined): string {
  const a = args ?? {};
  let raw: string | undefined;
  switch (toolName) {
    case 'bash':
      raw = firstNonEmptyString(a.command);
      break;
    case 'read':
    case 'edit':
    case 'write':
      raw = firstNonEmptyString(a.path);
      break;
    case 'grep':
    case 'find':
    case 'ls':
      raw = firstNonEmptyString(a.pattern, a.path);
      break;
    default:
      raw = JSON.stringify(a);
  }
  return (raw ?? '').slice(0, SUMMARY_MAX);
}
