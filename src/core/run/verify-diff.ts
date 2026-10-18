import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { DEFAULT_CONFIG, type OsqConfig } from '../foundation/config.js';
import { selectVcs } from '../vcs/select.js';
import { buildRoleEnv } from './role-env.js';

/** A temporary file holding a change's diff, with the cleanup that removes it. */
export interface VerifyDiff {
  /** The diff file's absolute path. */
  readonly path: string;
  /** Remove the diff file and its temporary folder. */
  readonly cleanup: () => Promise<void>;
}

/** What `runVerificationCommand` hands to `prepareVerifyEnv`. */
export interface VerifyEnvOptions {
  /** The role whose allowlist the command gets; `verify` unless the caller is prepare. */
  readonly role?: 'verify' | 'prepare';
  /** The config whose `confinement.roles.<role>.env` names the command may see. */
  readonly config?: OsqConfig;
  /** Variables set last, after `OSQ_CHANGE` and `OSQ_DIFF`. */
  readonly extraEnv?: Readonly<Record<string, string>>;
}

/** One verification command's environment and the cleanup of its diff file. */
export interface VerifyEnv {
  readonly env: NodeJS.ProcessEnv;
  readonly cleanup: () => Promise<void>;
}

/** The change folder marker holding the commit its diff starts from. */
const BASE_MARKER = path.join('.run', 'base');

/** Read `<changeFolder>/.run/base` trimmed; null when it is missing, unreadable or blank. */
async function readBase(changeFolder: string): Promise<string | null> {
  const text = await fs.readFile(path.join(changeFolder, BASE_MARKER), 'utf8').catch(() => '');
  const trimmed = text.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * The change's diff since its base commit, written to a file in a temporary
 * folder outside the project, or null when the change has none.
 *
 * A missing or blank `.run/base`, a project whose `Vcs` is not git, and a
 * `patch` that fails all read as null, so a verify command never fails because
 * of the diff. The caller owns the returned `cleanup`.
 */
export async function prepareVerifyDiff(
  projectRoot: string,
  changeFolder: string | null,
  config: OsqConfig,
): Promise<VerifyDiff | null> {
  if (changeFolder === null) return null;
  const base = await readBase(changeFolder);
  if (base === null) return null;
  const vcs = await selectVcs(projectRoot, config);
  if (vcs.kind !== 'git') return null;
  const diff = await vcs.patch(base).catch(() => null);
  if (diff === null) return null;
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-diff-'));
  const file = path.join(dir, 'change.patch');
  await fs.writeFile(file, diff, 'utf8');
  return { path: file, cleanup: () => fs.rm(dir, { recursive: true, force: true }) };
}

/** A cleanup that does nothing, for a run with no diff file. */
async function noCleanup(): Promise<void> {}

/**
 * Assemble one verification command's environment: the role allowlist, then
 * `OSQ_CHANGE`, then `OSQ_DIFF` when the change has a diff, then any extra
 * variables last, plus the cleanup that removes the diff file.
 *
 * `config` falls back to `DEFAULT_CONFIG`. With no change folder, or no diff,
 * `OSQ_CHANGE` or `OSQ_DIFF` is removed even when osq's own environment has it.
 */
export async function prepareVerifyEnv(
  projectRoot: string,
  changeFolder: string | null,
  options: VerifyEnvOptions = {},
): Promise<VerifyEnv> {
  const config = options.config ?? DEFAULT_CONFIG;
  const diff = await prepareVerifyDiff(projectRoot, changeFolder, config);
  const env: NodeJS.ProcessEnv = buildRoleEnv(options.role ?? 'verify', { config });
  setOrRemove(env, 'OSQ_CHANGE', changeFolder);
  setOrRemove(env, 'OSQ_DIFF', diff?.path ?? null);
  for (const [name, value] of Object.entries(options.extraEnv ?? {})) env[name] = value;
  return { env, cleanup: diff?.cleanup ?? noCleanup };
}

/** Set one environment name, or remove it when the value is null. */
function setOrRemove(env: NodeJS.ProcessEnv, name: string, value: string | null): void {
  if (value === null) Reflect.deleteProperty(env, name);
  else env[name] = value;
}
