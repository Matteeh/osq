import type { ReactElement } from 'react';
import { useState } from 'react';
import type { WebPlanHandoff } from '../../../../src/core/web/web-data.js';

/** The subset of `navigator.clipboard` the hand-off needs. */
export interface ClipboardLike {
  writeText(text: string): Promise<unknown>;
}

/**
 * Copy `text` through `clipboard`. Resolves true after `writeText(text)`
 * succeeds and false when the clipboard is missing or `writeText` rejects.
 *
 * @scenario web-inspection: Copy outcome
 * @adr 013
 */
export async function copyText(
  text: string,
  clipboard: ClipboardLike | undefined,
): Promise<boolean> {
  if (clipboard === undefined || clipboard === null) return false;
  try {
    await clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** The live clipboard when the runtime has one, else undefined. */
function readClipboard(): ClipboardLike | undefined {
  if (typeof navigator === 'undefined') return undefined;
  return navigator.clipboard as ClipboardLike | undefined;
}

/** A tap that starts the planner for this change, and whether one is pending. */
export interface HandoffStart {
  readonly pending: boolean;
  readonly onStart: () => void;
}

export interface HandoffBlockProps {
  readonly handoff: WebPlanHandoff;
  /** The Start planning affordance when the change's actions hold a plan. */
  readonly start?: HandoffStart | null;
  /** `planRunLine(change)`: the last planner run's outcome, or null. */
  readonly outcome?: string | null;
}

/**
 * The plan hand-off: the paste block for the change, the no-prompt line when
 * the folder has no `plan-prompt.md`, and a button that copies the block. With
 * a `start` it leads with the Start planning button and its line, disabled
 * while an action is pending; with an `outcome` it shows the last planner run
 * line before the paste text. The `Copied` state lasts until the next render,
 * with no timer.
 *
 * @scenario web-inspection: Hand-off text
 * @scenario web-inspection: Prompt ready
 * @scenario web-inspection: Top block per state
 * @scenario web-inspection: Start planning button
 * @scenario web-inspection: Start planning after Plan it
 * @scenario web-inspection: No start without the action
 * @scenario web-inspection: Last run outcome
 * @adr 013
 * @adr 019
 */
export function HandoffBlock({
  handoff,
  start = null,
  outcome = null,
}: HandoffBlockProps): ReactElement {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);

  const onCopy = (): void => {
    void copyText(handoff.text, readClipboard()).then((ok) => {
      setCopied(ok);
      setFailed(!ok);
    });
  };

  return (
    <section className="handoff">
      {start === null ? null : (
        <>
          <button
            type="button"
            className="page-button handoff-start"
            disabled={start.pending}
            onClick={start.onStart}
          >
            Start planning
          </button>
          <p className="handoff-start-note">
            Runs the planner on the server, in its own tree, and brings the plan back here.
          </p>
        </>
      )}
      {outcome === null ? null : <p className="handoff-outcome">{outcome}</p>}
      <h3>Hand it to your planning agent</h3>
      <p>Paste this into a new agent session.</p>
      <pre className="handoff-text">{handoff.text}</pre>
      {handoff.promptReady ? null : (
        <p className="handoff-no-prompt">
          This folder has no plan-prompt.md yet; run osq plan for this change first.
        </p>
      )}
      <button type="button" className="page-button" onClick={onCopy}>
        {copied ? 'Copied' : 'Copy hand-off'}
      </button>
      {failed ? <p className="handoff-failed">Copy failed; select the text above.</p> : null}
    </section>
  );
}
