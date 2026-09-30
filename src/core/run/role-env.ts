import type { ConfinementRole } from '../foundation/config-confinement.js';
import { DEFAULT_CONFIG, type OsqConfig } from '../foundation/config.js';
import { findHarness } from '../foundation/harness-catalog.js';

/**
 * Environment variable names every role inherits so a child can find its tools,
 * home, locale, terminal, temporary directory, certificates, and OS shell.
 */
export const BASE_ENV_NAMES = [
  'PATH',
  'HOME',
  'USER',
  'LOGNAME',
  'SHELL',
  'LANG',
  'LANGUAGE',
  'LC_ALL',
  'LC_CTYPE',
  'TERM',
  'TZ',
  'TMPDIR',
  'TMP',
  'TEMP',
  'XDG_CONFIG_HOME',
  'XDG_CACHE_HOME',
  'XDG_DATA_HOME',
  'XDG_STATE_HOME',
  'XDG_RUNTIME_DIR',
  'NODE_EXTRA_CA_CERTS',
  'SSL_CERT_FILE',
  'SSL_CERT_DIR',
  'CI',
  'NO_COLOR',
  'SYSTEMROOT',
  'COMSPEC',
  'PATHEXT',
  'WINDIR',
  'USERPROFILE',
  'APPDATA',
  'LOCALAPPDATA',
  'PROGRAMDATA',
] as const;

/** Inputs for one role's allowlisted environment. */
export interface RoleEnvOptions {
  readonly config?: OsqConfig;
  readonly harness?: string;
  readonly extraEnv?: Readonly<Record<string, string | undefined>>;
  readonly source?: Readonly<Record<string, string | undefined>>;
}

const IS_WINDOWS = process.platform === 'win32';

/**
 * Build the environment of a process osq spawns for `role` from an allowlist:
 * the base names, every `OSQ_` variable, the role's configured names, and, for
 * the agent role only, the harness's agent environment names. Extra variables
 * are set last and win. The returned object is new; the source is untouched.
 */
export function buildRoleEnv(
  role: ConfinementRole,
  options: RoleEnvOptions = {},
): Record<string, string> {
  const source = options.source ?? process.env;
  const config = options.config;
  const harnessName = options.harness ?? config?.harness ?? DEFAULT_CONFIG.harness;
  const agentEnv = findHarness(harnessName)?.agentEnv ?? [];
  const roleEnv = config?.confinement?.roles[role]?.env ?? [];
  const blocked = role === 'agent' ? [] : agentEnv;

  const result: Record<string, string> = {};
  for (const name of BASE_ENV_NAMES) copyFrom(source, name, result);
  for (const name of Object.keys(source)) {
    if (matchesOsqPrefix(name)) copyFrom(source, name, result);
  }
  for (const name of roleEnv) {
    if (!blocked.some((blockedName) => namesEqual(blockedName, name))) {
      copyFrom(source, name, result);
    }
  }
  if (role === 'agent') {
    for (const name of agentEnv) copyFrom(source, name, result);
  }
  for (const [name, value] of Object.entries(options.extraEnv ?? {})) {
    if (value !== undefined) result[name] = value;
  }
  return result;
}

/** Copy one source value into the result only when it is set. */
function copyFrom(
  source: Readonly<Record<string, string | undefined>>,
  name: string,
  target: Record<string, string>,
): void {
  const value = readSource(source, name);
  if (value !== undefined) target[name] = value;
}

/** Read a source value, matching without case on Windows. */
function readSource(
  source: Readonly<Record<string, string | undefined>>,
  name: string,
): string | undefined {
  if (Object.prototype.hasOwnProperty.call(source, name)) {
    const value = source[name];
    if (value !== undefined) return value;
  }
  if (!IS_WINDOWS) return undefined;
  const lowered = name.toLowerCase();
  for (const key of Object.keys(source)) {
    if (key.toLowerCase() === lowered && source[key] !== undefined) return source[key];
  }
  return undefined;
}

/** Whether a source name carries osq's own prefix. */
function matchesOsqPrefix(name: string): boolean {
  return (IS_WINDOWS ? name.toUpperCase() : name).startsWith('OSQ_');
}

/** Name comparison, case-insensitive on Windows. */
function namesEqual(a: string, b: string): boolean {
  return IS_WINDOWS ? a.toUpperCase() === b.toUpperCase() : a === b;
}
