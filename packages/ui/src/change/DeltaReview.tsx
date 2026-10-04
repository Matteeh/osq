import type { ReactElement } from 'react';
import type { WebDeltaCapability, WebDeltaRequirement } from '../contracts.js';

export interface DeltaReviewProps {
  readonly deltas: readonly WebDeltaCapability[];
}

/** The living side text for one requirement, worded for its operation. */
function livingText(requirement: WebDeltaRequirement): string {
  if (requirement.operation === 'added') return 'New requirement';
  if (requirement.living === null) return 'No living requirement matched.';
  if (requirement.operation === 'renamed' && requirement.from !== null) {
    return `Renamed from ${requirement.from}\n\n${requirement.living}`;
  }
  return requirement.living;
}

/** The proposed side text for one requirement, worded for its operation. */
function proposedText(requirement: WebDeltaRequirement): string {
  if (requirement.operation === 'removed') return 'Removed';
  return requirement.proposed ?? 'None';
}

function DeltaColumn({
  title,
  text,
}: { readonly title: string; readonly text: string }): ReactElement {
  return (
    <div className="delta-column">
      <h5>{title}</h5>
      <pre className="review-text">{text}</pre>
    </div>
  );
}

function DeltaRequirement({
  requirement,
}: { readonly requirement: WebDeltaRequirement }): ReactElement {
  return (
    <li className="delta-requirement">
      <p className="delta-heading">
        <strong>{requirement.operation}</strong> {requirement.name}
      </p>
      <div className="delta-pair">
        <DeltaColumn title="Living" text={livingText(requirement)} />
        <DeltaColumn title="Proposed" text={proposedText(requirement)} />
      </div>
    </li>
  );
}

/** Every delta capability and its requirements beside the living text. */
export function DeltaReview({ deltas }: DeltaReviewProps): ReactElement {
  return (
    <section className="review-deltas">
      <h3>Deltas</h3>
      {deltas.map((capability) => (
        <div key={capability.capability} className="delta-capability">
          <h4>{capability.capability}</h4>
          <ul className="delta-list">
            {capability.requirements.map((requirement, index) => (
              <DeltaRequirement
                key={`${requirement.operation}:${requirement.name}:${index}`}
                requirement={requirement}
              />
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}
