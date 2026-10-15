import { useCallback, useEffect, useState } from 'react';
import type { WebAction, WebActionResult, WebActionsDocument } from '../contracts.js';
import type { TaskRetry } from './ActionRetry.js';
import type { ActionClient, WebActionInput } from './actions-client.js';
import { approveInput } from './notice-state.js';

/** Everything the change view needs from its loaded actions. */
export interface ChangeActionsState {
  /** The loaded actions, or null before the first load and without a client. */
  readonly document: WebActionsDocument | null;
  readonly pending: boolean;
  readonly result: WebActionResult | null;
  readonly reason: string;
  readonly setReason: (reason: string) => void;
  /** Run one action: post it, show the answer, then load the actions again. */
  readonly run: (action: WebAction) => void;
  /** The task-table retry controls, derived from the same loaded document. */
  readonly retry: TaskRetry;
}

/** The request body for one tap, without the selector the client adds. */
function requestFor(
  action: WebAction,
  reason: string,
  opened: readonly string[] | undefined,
): WebActionInput {
  switch (action.verb) {
    case 'reject':
      return { verb: 'reject', reason };
    case 'retry':
      return { verb: 'retry', target: action.target ?? '' };
    case 'approve':
      return approveInput(opened);
    case 'land':
      return { verb: 'land' };
    case 'plan':
      return { verb: 'plan' };
  }
}

/** A result standing in for a client failure the view can render like any other. */
function failureResult(cause: unknown): WebActionResult {
  return {
    exitCode: 1,
    stdout: '',
    stderr: '',
    error: { message: cause instanceof Error ? cause.message : String(cause), next: null },
  };
}

function taskTargets(document: WebActionsDocument | null): string[] {
  if (document === null) return [];
  const targets: string[] = [];
  for (const action of document.actions) {
    if (action.verb !== 'retry' || action.target === null) continue;
    if (action.target === 'change') continue;
    targets.push(action.target);
  }
  return targets;
}

/**
 * Owns the change view's action state: load on mount and on every fresh
 * document, run one tap through the client, then show the answer and load
 * again. A static export passes no client, so it loads nothing and every
 * action affordance stays hidden.
 *
 * @scenario web-inspection: Approval buttons
 * @scenario web-inspection: Result after a tap
 * @scenario web-inspection: Static export has no buttons
 * @scenario web-inspection: Reject in the menu
 * @adr 013
 * @adr 019
 */
export function useChangeActions(
  selector: string,
  asOf: string,
  client: ActionClient | undefined,
  opened: readonly string[] | undefined,
): ChangeActionsState {
  const [document, setDocument] = useState<WebActionsDocument | null>(null);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<WebActionResult | null>(null);
  const [reason, setReason] = useState('');

  // biome-ignore lint/correctness/useExhaustiveDependencies: a fresh change document reloads the actions
  useEffect(() => {
    if (client === undefined) return;
    let active = true;
    void client.load(selector).then(
      (loaded) => {
        if (active) setDocument(loaded);
      },
      () => {
        if (active) setDocument(null);
      },
    );
    return () => {
      active = false;
    };
  }, [client, selector, asOf]);

  const run = useCallback(
    (action: WebAction): void => {
      if (client === undefined || document === null || pending) return;
      setPending(true);
      setResult(null);
      void client
        .run(selector, document.token, requestFor(action, reason, opened))
        .then(
          (answer) => setResult(answer),
          (cause) => setResult(failureResult(cause)),
        )
        .then(() => client.load(selector))
        .then(
          (loaded) => {
            setDocument(loaded);
            setPending(false);
          },
          () => setPending(false),
        );
    },
    [client, document, opened, pending, reason, selector],
  );

  const retry: TaskRetry = {
    targets: taskTargets(document),
    pending,
    onRetry: (target: string) => run({ verb: 'retry', command: '', target }),
  };

  return { document, pending, result, reason, setReason, run, retry };
}
