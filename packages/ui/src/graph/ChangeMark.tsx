import type { ReactElement } from 'react';
import type { Route } from '../router.js';
import { markAriaLabel } from './format.js';
import { activationKey, navigateToChange } from './interaction.js';
import type { GraphMark } from './types.js';
import { round } from './types.js';

export interface ChangeMarkProps {
  readonly mark: GraphMark;
  readonly onNavigate: (route: Route) => void;
}

const DOT_RADIUS = 10;

function paint(mark: GraphMark): string {
  if (mark.fill.state === 'missing') return 'url(#graph-fill-missing)';
  if (mark.fill.state === 'partial') return 'url(#graph-fill-partial)';
  return mark.fill.mode === 'cost' ? '#2f5d8a' : '#8a5a2f';
}

/**
 * One focusable mark per change. A change that writes several lanes draws one
 * vertical connector between its first and last anchor instead of one node per
 * lane. Enter, Space, and pointer activation navigate to its change route.
 */
export function ChangeMark({ mark, onNavigate }: ChangeMarkProps): ReactElement {
  const label = markAriaLabel(mark);
  const activate = (): void => navigateToChange(mark.folderKey, onNavigate);
  const first = mark.laneTargets[0];
  const last = mark.laneTargets[mark.laneTargets.length - 1];
  return (
    <g
      className={`graph-mark graph-mark-${mark.location} graph-fill-${mark.fill.state}`}
      data-change={mark.folderKey}
      tabIndex={0}
      aria-label={label}
      onClick={activate}
      onKeyDown={(event) => activationKey(event, activate)}
    >
      {first !== undefined && last !== undefined && mark.laneTargets.length > 1 ? (
        <line
          className="graph-mark-connector"
          x1={round(mark.x)}
          y1={round(first.y)}
          x2={round(mark.x)}
          y2={round(last.y)}
        />
      ) : null}
      <circle
        className="graph-mark-dot"
        cx={round(mark.x)}
        cy={round(mark.y)}
        r={DOT_RADIUS}
        fill={paint(mark)}
      >
        <title>{label}</title>
      </circle>
      <text
        className="graph-mark-key"
        x={round(mark.x)}
        y={round(mark.y + DOT_RADIUS + 12)}
        textAnchor="middle"
      >
        {mark.folderKey}
      </text>
    </g>
  );
}
