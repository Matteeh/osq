import type { ReactElement } from 'react';
import { useReducer } from 'react';
import type { WebGraph } from '../contracts.js';
import type { Route } from '../router.js';
import { CapabilityPanel } from './CapabilityPanel.js';
import { GraphCanvas } from './GraphCanvas.js';
import { GraphControlsBar } from './GraphControlsBar.js';
import { DEFAULT_GRAPH_CONTROLS, type GraphControls, graphControlsReducer } from './controls.js';
import { graphLayout } from './layout.js';

export interface GraphViewProps {
  readonly graph: WebGraph;
  readonly onNavigate: (route: Route) => void;
  /** Injectable initial state so a transition can be server-rendered. */
  readonly initialControls?: GraphControls;
}

/**
 * The graph route: one labelled lane per current capability, a time-ordered
 * mark per change, typed relationship layers, and independent presentation
 * controls. The graph document is treated as immutable.
 */
export function GraphView({ graph, onNavigate, initialControls }: GraphViewProps): ReactElement {
  const [controls, dispatch] = useReducer(
    graphControlsReducer,
    initialControls ?? DEFAULT_GRAPH_CONTROLS,
  );
  const layout = graphLayout(graph, controls);
  return (
    <section className="view graph-view" aria-labelledby="graph-view-title">
      <h2 id="graph-view-title">Capability archive</h2>
      <GraphControlsBar controls={controls} dispatch={dispatch} />
      <CapabilityPanel capabilities={graph.capabilities} selected={controls.selectedCapability} />
      <GraphCanvas
        layout={layout}
        controls={controls}
        dispatch={dispatch}
        onNavigate={onNavigate}
      />
    </section>
  );
}
