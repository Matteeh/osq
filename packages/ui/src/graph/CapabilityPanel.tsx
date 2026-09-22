import type { ReactElement } from 'react';
import type { WebCapabilityNode } from '../../../../src/core/web/web-data-types.js';

export interface CapabilityPanelProps {
  readonly capabilities: readonly WebCapabilityNode[];
  readonly selected: string | null;
}

/**
 * The complete current spec text of the activated capability lane, taken from
 * the graph document. With no selection it only explains how to open one.
 */
export function CapabilityPanel({ capabilities, selected }: CapabilityPanelProps): ReactElement {
  const capability =
    selected === null ? undefined : capabilities.find((node) => node.id === selected);
  if (capability === undefined) {
    return (
      <p className="graph-hint">
        Activate a capability lane to read its complete current specification.
      </p>
    );
  }
  return (
    <section className="graph-capability" aria-labelledby="graph-capability-title">
      <h3 id="graph-capability-title">{capability.id} specification</h3>
      <pre className="graph-capability-spec">{capability.spec}</pre>
    </section>
  );
}
