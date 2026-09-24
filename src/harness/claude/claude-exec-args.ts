import { resolveClaudeModel } from '../../core/foundation/config-claude.js';
import type { OsqConfig } from '../../core/foundation/config.js';
import { buildExecutorPrompt } from '../prompt.js';
import type { SpawnTaskOptions } from '../types.js';

/** Fixed flags that keep a Claude task headless, session-free, and extension-free. */
const CLAUDE_BASE_ARGS = [
  '-p',
  '--output-format',
  'stream-json',
  '--verbose',
  '--no-session-persistence',
  '--permission-mode',
  'dontAsk',
  '--tools',
  'Bash,Read,Edit,Write,Glob,Grep',
  '--allowedTools',
  'Bash',
  'Read',
  'Edit(./**)',
  'Write(./**)',
  'Glob',
  'Grep',
  '--disallowedTools',
  'Bash(git:*)',
  '--strict-mcp-config',
  '--disable-slash-commands',
  '--setting-sources',
  '',
] as const;

/** `--bare` only makes sense with an API key; it never reads a login. */
export function usesClaudeBare(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env.ANTHROPIC_API_KEY?.trim());
}

/** Claude Code settings JSON: auto-memory off, plus the sandbox block when asked. */
export function claudeSettingsJson(config?: OsqConfig): string {
  const settings: Record<string, unknown> = { autoMemoryEnabled: false };
  if (config?.claude?.sandbox) {
    settings.sandbox = {
      enabled: true,
      failIfUnavailable: true,
      autoAllowBashIfSandboxed: true,
      allowUnsandboxedCommands: false,
      network: { allowedDomains: [], strictAllowlist: true },
    };
  }
  return JSON.stringify(settings);
}

/**
 * Noninteractive Claude Code argv with the shared executor prompt as one literal
 * argument. The configured model and, with an API key, `--bare` are inserted in
 * that order; unset flags are omitted so Claude Code uses its native selection.
 */
export function buildClaudeArgs(options: SpawnTaskOptions, config?: OsqConfig): string[] {
  const args: string[] = [...CLAUDE_BASE_ARGS, '--settings', claudeSettingsJson(config)];

  const model = resolveClaudeModel(config, true);
  if (model) args.push('--model', model);

  if (usesClaudeBare()) args.push('--bare');

  args.push('--', buildExecutorPrompt(options));
  return args;
}
