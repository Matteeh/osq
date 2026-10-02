import { claudeContainment } from './config-claude.js';
import type { OsqConfig } from './config.js';
import type { HarnessName } from './harness-catalog.js';

/** Whether and how a harness's configuration confines the agent it spawns. */
export interface HarnessContainment {
  readonly ok: boolean;
  readonly warning?: boolean;
  readonly message: string;
}

/** A catalog harness's containment reporter. */
export type HarnessContainmentReporter = (config: OsqConfig) => HarnessContainment;

function passing(message: string): HarnessContainment {
  return { ok: true, message };
}

function warns(message: string): HarnessContainment {
  return { ok: true, warning: true, message };
}

function failing(message: string): HarnessContainment {
  return { ok: false, message };
}

const AGY_BYPASS =
  'agy.dangerouslySkipPermissions is true: agy approves every tool call, so nothing stops git, network tools, or sudo';
const AGY_PROMPTS =
  'agy asks before every tool call and a headless task cannot answer; set agy.dangerouslySkipPermissions: true to accept that, or choose another harness';
const CODEX = 'workspace-write sandbox: writes confined to the project, .git read-only, no network';
const OPENCODE_DEFAULT =
  'osq-coder agent denies git, curl, wget, ssh, scp, sudo, and web tools; shell unconfined with open network';
const OPENCODE_OTHER_SUFFIX =
  "not osq-coder: that agent's own permissions apply, not osq's denials";
const PI = 'nothing confines the agent: no permission prompts, no sandbox, open network';

/** agy confines nothing without its bypass, and denies every tool call without it. */
export function agyContainment(config: OsqConfig): HarnessContainment {
  return config.agy?.dangerouslySkipPermissions === true ? warns(AGY_BYPASS) : failing(AGY_PROMPTS);
}

/** opencode confines what its selected agent's own permission rules deny. */
export function opencodeContainment(config: OsqConfig): HarnessContainment {
  const agent = config.opencode?.agent;
  return agent === 'osq-coder' ? passing(OPENCODE_DEFAULT) : warns(opencodeOtherMessage(agent));
}

function opencodeOtherMessage(agent: string | undefined): string {
  return `opencode.agent is ${agent}, ${OPENCODE_OTHER_SUFFIX}`;
}

/** mock spawns no agent process. */
export function mockContainment(): HarnessContainment {
  return passing('no agent process');
}

/** codex runs in its own workspace-write sandbox. */
export function codexContainment(): HarnessContainment {
  return passing(CODEX);
}

/** pi has no permission prompts, sandbox, or network restriction. */
export function piContainment(): HarnessContainment {
  return passing(PI);
}

// Claude's containment text lives with its other configuration helpers.
export { claudeContainment };

/** Containment reporters for every catalog harness, keyed by catalog name. */
export const HARNESS_CONTAINMENT: Record<HarnessName, HarnessContainmentReporter> = {
  agy: agyContainment,
  opencode: opencodeContainment,
  mock: mockContainment,
  codex: codexContainment,
  pi: piContainment,
  claude: claudeContainment as unknown as HarnessContainmentReporter,
};

/**
 * Attach the matching containment reporter to a catalog definition. The
 * catalog owns harness names; this module owns the containment reporters.
 */
export function attachContainment<T extends object>(
  name: HarnessName,
  definition: T,
): { readonly name: HarnessName } & T & { readonly containment: HarnessContainmentReporter } {
  return { name, ...definition, containment: HARNESS_CONTAINMENT[name] };
}
