import type { ReactElement } from 'react';
import type { LandDisclosure, LandGate, LandView } from '../contracts.js';

export interface LandPanelProps {
  readonly land: LandView;
}

/** The one-line verdict a lander reads first. */
function headline(land: LandView): string {
  if (land.landed === null) return 'Git is off';
  if (land.landed) return 'Landed';
  const branch = land.defaultBranch ?? 'main';
  if (land.mainCommits === null) {
    return `Not landed. Branch osq/${land.folderName} not found`;
  }
  if (land.mainCommits === 0) {
    return `Not landed. ${branch} has not moved since archive`;
  }
  const noun = land.mainCommits === 1 ? 'commit' : 'commits';
  return `Not landed. ${branch} has ${land.mainCommits} new ${noun} since archive; Land will merge them and run verify again`;
}

function gateName(gate: LandGate): string {
  if (gate.kind === 'task') return `Task ${gate.task ?? ''}`.trimEnd();
  if (gate.kind === 'verify') return 'Verify';
  if (gate.kind === 'check') return 'Check';
  return 'Validator';
}

function GateItem({ gate }: { readonly gate: LandGate }): ReactElement {
  const duration = gate.durationSeconds === null ? null : `in ${Math.round(gate.durationSeconds)}s`;
  const exit = gate.outcome === 'failed' && gate.exitCode !== null ? `exit ${gate.exitCode}` : null;
  const findings =
    gate.kind === 'validator' && gate.findings !== null ? `${gate.findings} findings` : null;
  return (
    <li className="land-gate">
      <strong>{gateName(gate)}</strong>
      {': '}
      <span className="land-outcome">{gate.outcome}</span>
      {duration !== null ? ` ${duration}` : ''}
      {exit !== null ? ` ${exit}` : ''}
      {findings !== null ? `, ${findings}` : ''}{' '}
      <code className="land-command">{gate.command}</code>
    </li>
  );
}

function GateList({ gates }: { readonly gates: readonly LandGate[] }): ReactElement {
  if (gates.length === 0) return <p className="review-none">None recorded</p>;
  return (
    <ul className="land-gates">
      {gates.map((gate, index) => (
        <GateItem key={`${gate.kind}-${gate.task ?? index}-${gate.timestamp}`} gate={gate} />
      ))}
    </ul>
  );
}

function DiffLine({ land }: { readonly land: LandView }): ReactElement {
  if (land.diff === null) return <p className="land-diff">Unavailable</p>;
  return (
    <p className="land-diff">
      {land.diff.files} files changed, +{land.diff.added} -{land.diff.removed}
    </p>
  );
}

function SpecChanges({
  capabilities,
}: {
  readonly capabilities: LandView['capabilities'];
}): ReactElement {
  if (capabilities.length === 0) return <p className="review-none">None</p>;
  return (
    <div className="land-spec-changes">
      {capabilities.map((capability) => (
        <div className="land-capability" key={capability.name}>
          <p className="land-capability-name">{capability.name}</p>
          <ul className="land-spec-list">
            {capability.added.length > 0 ? <li>added: {capability.added.join(', ')}</li> : null}
            {capability.modified.length > 0 ? (
              <li>modified: {capability.modified.join(', ')}</li>
            ) : null}
            {capability.removed.length > 0 ? (
              <li>removed: {capability.removed.join(', ')}</li>
            ) : null}
            {capability.renamed.length > 0 ? (
              <li>
                renamed:{' '}
                {capability.renamed.map((rename) => `${rename.from} → ${rename.to}`).join(', ')}
              </li>
            ) : null}
          </ul>
        </div>
      ))}
    </div>
  );
}

function Disclosures({
  disclosures,
}: {
  readonly disclosures: readonly LandDisclosure[];
}): ReactElement {
  if (disclosures.length === 0) return <p className="review-none">None</p>;
  return (
    <div className="land-disclosures">
      {disclosures.map((entry) => (
        <div className="land-disclosure" key={entry.task}>
          <p className="land-task">Task {entry.task}</p>
          {entry.deviated !== null ? (
            <>
              <p className="land-label">deviated</p>
              <pre className="review-text">{entry.deviated}</pre>
            </>
          ) : null}
          {entry.outsideScope !== null ? (
            <>
              <p className="land-label">outside scope</p>
              <pre className="review-text">{entry.outsideScope}</pre>
            </>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function MessageSection({
  title,
  reason,
  message,
}: {
  readonly title: string;
  readonly reason: string | null;
  readonly message: string;
}): ReactElement {
  return (
    <section className="land-subsection">
      <h4>{title}</h4>
      {reason !== null ? <p className="land-reason">{reason}</p> : null}
      <pre className="review-text land-text">{message}</pre>
    </section>
  );
}

/**
 * What landing an archived change will do: its archive gates, diff, spec
 * changes, executor disclosures, and any halt or sync stop. It only reads the
 * `LandView` it is given.
 */
export function LandPanel({ land }: LandPanelProps): ReactElement {
  return (
    <section className="land" aria-labelledby="land-title">
      <h3 id="land-title">Land</h3>
      <p className="land-headline">{headline(land)}</p>
      <h4>Gates at archive</h4>
      <GateList gates={land.gates} />
      <h4>Diff</h4>
      <DiffLine land={land} />
      <h4>Spec changes</h4>
      <SpecChanges capabilities={land.capabilities} />
      <h4>Executor disclosures</h4>
      <Disclosures disclosures={land.disclosures} />
      {land.halt !== null ? (
        <MessageSection title="Halted" reason={land.halt.reason} message={land.halt.message} />
      ) : null}
      {land.lastSyncStop !== null ? (
        <MessageSection
          title="Sync stopped"
          reason={land.lastSyncStop.reason}
          message={land.lastSyncStop.message}
        />
      ) : null}
    </section>
  );
}
