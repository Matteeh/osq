/**
 * Harness-specific settings for the agy and opencode adapters. They live here
 * so `config.ts` stays within the source line budget; `config.ts` re-exports
 * both so existing imports keep resolving.
 */
export interface AgyConfig {
  readonly model?: string;
  readonly dangerouslySkipPermissions?: boolean;
}

export interface OpencodeConfig {
  readonly bin?: string;
  readonly model?: string;
  readonly agent?: string;
  readonly variant?: string;
}
