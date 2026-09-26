import type { ClaudeConfig } from './config-claude.js';
import type { CodexConfig } from './config-codex.js';
import type { GatesConfig } from './config-gates.js';
import type { PiConfig } from './config-pi.js';
import type { PlanningConfig } from './config-planning.js';
import type { QueueConfig } from './config-queue.js';
import type { TraceabilityConfig } from './config-traceability.js';
import type {
  AgyConfig,
  LogConfig,
  OpencodeConfig,
  OsqConfig,
  OsqLimits,
  OsqPaths,
  OsqTimeouts,
  PlannerConfig,
} from './config.js';

/**
 * Consumer-authored partial configuration accepted by `defineConfig`. Harness
 * sections with extra resolved fields (codex, pi, claude) are re-declared as
 * partial so callers never have to spell out defaults.
 */
export type OsqUserConfig = Partial<
  Omit<
    OsqConfig,
    | 'limits'
    | 'paths'
    | 'timeouts'
    | 'codex'
    | 'pi'
    | 'claude'
    | 'log'
    | 'planner'
    | 'planning'
    | 'queue'
    | 'gates'
    | 'traceability'
  >
> & {
  readonly limits?: Partial<OsqLimits>;
  readonly paths?: Partial<OsqPaths>;
  readonly timeouts?: Partial<OsqTimeouts>;
  readonly agy?: Partial<AgyConfig>;
  readonly opencode?: Partial<OpencodeConfig>;
  readonly codex?: Partial<CodexConfig>;
  readonly pi?: Partial<PiConfig>;
  readonly claude?: Partial<ClaudeConfig>;
  readonly log?: Partial<LogConfig>;
  readonly planner?: Partial<PlannerConfig>;
  readonly planning?: Partial<PlanningConfig>;
  readonly queue?: Partial<QueueConfig>;
  readonly gates?: Partial<GatesConfig>;
  readonly traceability?: Partial<TraceabilityConfig>;
};
