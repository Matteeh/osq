import type { ReactElement } from 'react';
import type { GraphControlAction, GraphControls, GraphFill } from './controls.js';

export interface GraphControlsBarProps {
  readonly controls: GraphControls;
  readonly dispatch: (action: GraphControlAction) => void;
}

const FILL_OPTIONS: readonly { readonly value: GraphFill; readonly label: string }[] = [
  { value: 'cost', label: 'Observed total cost' },
  { value: 'attempts', label: 'Execution attempts' },
];

const TOGGLES: readonly {
  readonly action: 'toggle-rejected' | 'toggle-reads' | 'toggle-depends';
  readonly field: 'rejectedVisible' | 'readsVisible' | 'dependsVisible';
  readonly label: string;
}[] = [
  { action: 'toggle-rejected', field: 'rejectedVisible', label: 'Show rejected changes' },
  { action: 'toggle-reads', field: 'readsVisible', label: 'Show reads relationships' },
  { action: 'toggle-depends', field: 'dependsVisible', label: 'Show dependency relationships' },
];

/** Native, visibly labelled controls that only change presentation state. */
export function GraphControlsBar({ controls, dispatch }: GraphControlsBarProps): ReactElement {
  return (
    <div className="graph-controls">
      <fieldset className="graph-fill-control">
        <legend>Change mark fill</legend>
        {FILL_OPTIONS.map((option) => (
          <label key={option.value}>
            <input
              type="radio"
              name="graph-fill"
              value={option.value}
              checked={controls.fill === option.value}
              onChange={() => dispatch({ type: 'set-fill', fill: option.value })}
            />
            {option.label}
          </label>
        ))}
      </fieldset>
      {TOGGLES.map((toggle) => (
        <label key={toggle.action}>
          <input
            type="checkbox"
            checked={controls[toggle.field]}
            onChange={() => dispatch({ type: toggle.action })}
          />
          {toggle.label}
        </label>
      ))}
    </div>
  );
}
