import path from 'node:path';
import { firstNonEmptyString } from '../stream.js';

const SUMMARY_MAX = 60;

/** Relativize an absolute path under the project root, leaving relative paths. */
export function toProjectRelative(target: string, projectRoot: string): string {
  return path.isAbsolute(target) ? path.relative(projectRoot, target) : target;
}

/** Short, human-readable tool summary following Claude Code's tool input shapes. */
export function claudeToolSummary(
  toolName: string,
  input: Record<string, unknown> | undefined,
): string {
  const i = input ?? {};
  let raw: string | undefined;
  switch (toolName) {
    case 'Bash':
      raw = firstNonEmptyString(i.command);
      break;
    case 'Read':
    case 'Edit':
    case 'Write':
      raw = firstNonEmptyString(i.file_path);
      break;
    case 'Glob':
    case 'Grep':
      raw = firstNonEmptyString(i.pattern);
      break;
    default:
      raw = JSON.stringify(i);
  }
  return (raw ?? '').slice(0, SUMMARY_MAX);
}
