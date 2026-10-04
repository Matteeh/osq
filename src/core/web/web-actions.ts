import type { OsqConfig } from '../foundation/config.js';
import { readDispatchItems } from '../status/dispatch-items.js';
import { readNextStep } from '../status/next-step.js';
import { resolveChangeFolder } from './web-data-folders.js';

/** The four commands the dashboard can run. */
export type WebActionVerb = 'approve' | 'land' | 'reject' | 'retry';

/** One action the change view can tap, with the CLI command it runs. */
export interface WebAction {
  readonly verb: WebActionVerb;
  readonly command: string;
  /** The retry target (`<n>` or `change`); null for every other verb. */
  readonly target: string | null;
}

/** What `getWebActions` derives for one change. */
export interface WebActions {
  readonly folderKey: string;
  readonly actions: readonly WebAction[];
  /** Commands the human runs in a shell, such as `osq plan <id>`. */
  readonly manual: readonly string[];
}

/** The `GET /api/actions/<id>` body: the actions plus the server's token. */
export interface WebActionsDocument extends WebActions {
  readonly token: string;
}

export type WebActionRequest =
  | { readonly verb: 'approve'; readonly change: string }
  | { readonly verb: 'land'; readonly change: string }
  | { readonly verb: 'reject'; readonly change: string; readonly reason: string }
  | { readonly verb: 'retry'; readonly change: string; readonly target: string };

export interface WebActionResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
  readonly error: { readonly message: string; readonly next: string | null } | null;
}

/** Runs one action; supplied by `osq serve` so core never imports `src/cli/`. */
export type WebActionRunner = (request: WebActionRequest) => Promise<WebActionResult>;

const PREFIXES: readonly WebActionVerb[] = ['approve', 'land', 'reject', 'retry'];

/** The action a dispatch command names, or null when it is not an action. */
function actionFromCommand(command: string): WebAction | null {
  for (const verb of PREFIXES) {
    if (!command.startsWith(`osq ${verb} `)) continue;
    const target = verb === 'retry' ? (command.split(/\s+/).at(-1) ?? null) : null;
    return { verb, command, target };
  }
  return null;
}

/**
 * The actions and manual commands `osq inbox` offers for one change, plus the
 * unplanned change's next step when it has no dispatch item.
 */
export async function getWebActions(
  projectRoot: string,
  selector: string,
  config: OsqConfig,
): Promise<WebActions> {
  const resolved = await resolveChangeFolder(projectRoot, selector, config);
  const dispatch = await readDispatchItems(projectRoot, config);
  const items = dispatch.items.filter((item) => item.change.folder === resolved.folderKey);
  const actions: WebAction[] = [];
  const manual: string[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    for (const command of item.commands) {
      if (seen.has(command)) continue;
      seen.add(command);
      if (command.startsWith('osq show ')) continue;
      const action = actionFromCommand(command);
      if (action !== null) actions.push(action);
      else manual.push(command);
    }
  }
  if (items.length === 0) {
    const next = await readNextStep(projectRoot, resolved.folderPath, config);
    if (next.state === 'unplanned' && next.command !== null) manual.push(next.command);
  }
  return { folderKey: resolved.folderKey, actions, manual };
}
