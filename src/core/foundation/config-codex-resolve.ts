import type { OsqConfig } from './config.js';

/** Resolve the Codex executable: explicit `codex.bin`, then `CODEX_PATH`, then `codex`. */
export function codexExecutable(config?: Pick<OsqConfig, 'codex'>): string {
  const explicit = config?.codex?.bin?.trim();
  if (explicit) return explicit;
  const fromEnv = process.env.CODEX_PATH?.trim();
  if (fromEnv) return fromEnv;
  return 'codex';
}

/**
 * Codex model: explicit `codex.model`, then `OSQ_MODEL` only when Codex is the
 * selected executor. `undefined` defers to Codex's native default. The selected
 * boolean is supplied by the catalog so this module names no harness.
 */
export function codexModel(
  config?: Pick<OsqConfig, 'codex'>,
  selected = false,
): string | undefined {
  const explicit = config?.codex?.model?.trim();
  if (explicit) return explicit;
  if (!selected) return undefined;
  return process.env.OSQ_MODEL?.trim() || undefined;
}
