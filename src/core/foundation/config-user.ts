import type { CapabilitiesConfig } from './config-capability-groups.js';
import type { ClaudeConfig } from './config-claude.js';
import type { CodexConfig } from './config-codex.js';
import type { ConfinementRole } from './config-confinement.js';
import type { GatesConfig } from './config-gates.js';
import type { InboxConfig } from './config-inbox.js';
import type { PiConfig } from './config-pi.js';
import type { PlanningConfig } from './config-planning.js';
import type { QueueConfig } from './config-queue.js';
import type { TraceabilityConfig } from './config-traceability.js';
import type { ValidatorConfig } from './config-validator.js';
import type { VcsConfig } from './config-vcs.js';
import type { WatchConfig } from './config-watch.js';
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
    | 'vcs'
    | 'inbox'
    | 'capabilities'
    | 'confinement'
    | 'validator'
    | 'watch'
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
  readonly vcs?: Partial<VcsConfig>;
  readonly inbox?: Partial<InboxConfig>;
  readonly capabilities?: Partial<CapabilitiesConfig>;
  readonly confinement?: {
    readonly roles?: Partial<Record<ConfinementRole, { readonly env?: readonly string[] }>>;
  };
  readonly validator?: Partial<ValidatorConfig>;
  readonly watch?: Partial<WatchConfig>;
};
