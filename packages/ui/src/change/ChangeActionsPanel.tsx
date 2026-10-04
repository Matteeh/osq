import type { ReactElement } from 'react';
import { useCallback, useEffect, useState } from 'react';
import type { WebAction, WebActionResult, WebActionsDocument } from '../contracts.js';
import { ChangeActions } from './ChangeActions.js';
import type { ActionClient, WebActionInput } from './actions-client.js';

export interface ChangeActionsPanelProps {
  readonly selector: string;
  readonly asOf: string;
  readonly client: ActionClient;
}

/** The request body for one tap, without the selector the client adds. */
function requestFor(action: WebAction, reason: string): WebActionInput {
  switch (action.verb) {
    case 'reject':
      return { verb: 'reject', reason };
    case 'retry':
      return { verb: 'retry', target: action.target ?? '' };
    case 'approve':
      return { verb: 'approve' };
    case 'land':
      return { verb: 'land' };
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

/**
 * Owns the change view's action state: load on mount and on every fresh
 * document, run one tap through the client, then show the answer and load
 * again. A static export passes no client, so no panel is mounted.
 */
export function ChangeActionsPanel({
  selector,
  asOf,
  client,
}: ChangeActionsPanelProps): ReactElement | null {
  const [actions, setActions] = useState<WebActionsDocument | null>(null);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<WebActionResult | null>(null);
  const [reason, setReason] = useState('');

  // biome-ignore lint/correctness/useExhaustiveDependencies: a fresh change document reloads the actions
  useEffect(() => {
    let active = true;
    void client.load(selector).then(
      (loaded) => {
        if (active) setActions(loaded);
      },
      () => {
        if (active) setActions(null);
      },
    );
    return () => {
      active = false;
    };
  }, [client, selector, asOf]);

  const run = useCallback(
    (action: WebAction): void => {
      if (actions === null || pending) return;
      setPending(true);
      setResult(null);
      void client
        .run(selector, actions.token, requestFor(action, reason))
        .then(
          (answer) => setResult(answer),
          (cause) => setResult(failureResult(cause)),
        )
        .then(() => client.load(selector))
        .then(
          (loaded) => {
            setActions(loaded);
            setPending(false);
          },
          () => setPending(false),
        );
    },
    [actions, client, pending, reason, selector],
  );

  if (actions === null) return null;
  return (
    <ChangeActions
      document={actions}
      pending={pending}
      result={result}
      reason={reason}
      onReasonChange={setReason}
      onRun={run}
    />
  );
}
