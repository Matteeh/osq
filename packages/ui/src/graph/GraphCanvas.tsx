import type { ReactElement } from 'react';
import type { Route } from '../router.js';
import { ChangeMark } from './ChangeMark.js';
import type { GraphControlAction, GraphControls } from './controls.js';
import { activationKey } from './interaction.js';
import type { GraphLayout } from './types.js';
import { round } from './types.js';

export interface GraphCanvasProps {
  readonly layout: GraphLayout;
  readonly controls: GraphControls;
  readonly dispatch: (action: GraphControlAction) => void;
  readonly onNavigate: (route: Route) => void;
}

const LEGEND_STEP = 132;

/** The horizontally scrollable SVG surface: lanes, relationships, and marks. */
export function GraphCanvas({
  layout,
  controls,
  dispatch,
  onNavigate,
}: GraphCanvasProps): ReactElement {
  const left = layout.laneLabelWidth + 16;
  const legendY = layout.height - 18;
  return (
    <section
      className="graph-scroll"
      aria-label="Capability archive graph"
      // biome-ignore lint/a11y/noNoninteractiveTabindex: a scroll region needs keyboard focus to scroll
      tabIndex={0}
      style={{ overflowX: 'auto' }}
    >
      <svg
        className="graph-svg"
        width={layout.width}
        height={layout.height}
        viewBox={`0 0 ${layout.width} ${layout.height}`}
        role="img"
        aria-label="Capability lanes with change marks and typed relationships"
      >
        <title>Capability archive</title>
        <desc>
          One horizontal lane per current capability with landed changes increasing left to right,
          active changes in a right gutter, and optional rejected, reads, and dependency layers.
        </desc>
        <defs>
          <marker
            id="graph-arrow-depends"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="7"
            markerHeight="7"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#6b7280" />
          </marker>
          <marker
            id="graph-arrow-reads"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="7"
            markerHeight="7"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#8a5a2f" />
          </marker>
          <pattern id="graph-fill-missing" width="6" height="6" patternUnits="userSpaceOnUse">
            <rect width="6" height="6" fill="#e3e3de" />
            <path d="M0,6 L6,0" stroke="#8a8a86" strokeWidth="1" />
          </pattern>
          <pattern id="graph-fill-partial" width="6" height="6" patternUnits="userSpaceOnUse">
            <rect width="6" height="6" fill="#b9cbdb" />
            <path d="M0,6 L6,0" stroke="#2f5d8a" strokeWidth="1" />
          </pattern>
        </defs>

        <g className="graph-band graph-band-active">
          <rect
            x={layout.activeBand.start}
            y={0}
            width={layout.activeBand.width}
            height={layout.height}
          />
          <text x={round(layout.activeBand.start + 6)} y={round(layout.height - 6)}>
            {layout.activeBand.label}
          </text>
        </g>
        {layout.rejectedBand !== null ? (
          <g className="graph-band graph-band-rejected">
            <rect
              x={layout.rejectedBand.start}
              y={0}
              width={layout.rejectedBand.width}
              height={layout.height}
            />
            <text x={round(layout.rejectedBand.start + 6)} y={round(layout.height - 6)}>
              {layout.rejectedBand.label}
            </text>
          </g>
        ) : null}

        <g className="graph-lanes">
          {layout.lanes.map((lane) => (
            <g key={lane.id} className="graph-lane" data-capability={lane.id}>
              <line
                className="graph-lane-line"
                x1={layout.laneLabelWidth}
                y1={round(lane.y)}
                x2={layout.plotRight}
                y2={round(lane.y)}
              />
              <g
                className="graph-lane-header"
                tabIndex={0}
                aria-label={`Read the current ${lane.id} specification`}
                onClick={() => dispatch({ type: 'select-capability', capability: lane.id })}
                onKeyDown={(event) =>
                  activationKey(event, () =>
                    dispatch({ type: 'select-capability', capability: lane.id }),
                  )
                }
              >
                <text x={layout.laneLabelWidth - 8} y={round(lane.y + 4)} textAnchor="end">
                  {lane.id}
                </text>
              </g>
            </g>
          ))}
        </g>

        {controls.dependsVisible ? (
          <g className="graph-relationships graph-relationships-depends">
            {layout.depends.map((edge) => (
              <path
                key={edge.key}
                className="graph-edge graph-edge-depends"
                d={edge.path}
                strokeDasharray="6 3"
                markerEnd="url(#graph-arrow-depends)"
              />
            ))}
          </g>
        ) : null}
        {controls.readsVisible ? (
          <g className="graph-relationships graph-relationships-reads">
            {layout.reads.map((edge) => (
              <path
                key={edge.key}
                className="graph-edge graph-edge-reads"
                d={edge.path}
                strokeDasharray="2 4"
                markerEnd="url(#graph-arrow-reads)"
              />
            ))}
          </g>
        ) : null}

        <g className="graph-marks">
          {layout.marks.map((mark) => (
            <ChangeMark key={mark.folderKey} mark={mark} onNavigate={onNavigate} />
          ))}
        </g>

        <g className="graph-legend" aria-label="Graph legend">
          <line
            className="graph-edge-depends"
            x1={left}
            y1={legendY}
            x2={left + 22}
            y2={legendY}
            strokeDasharray="6 3"
          />
          <text x={left + 28} y={legendY + 4} fontSize={10}>
            Dependency
          </text>
          <line
            className="graph-edge-reads"
            x1={left + LEGEND_STEP}
            y1={legendY}
            x2={left + LEGEND_STEP + 22}
            y2={legendY}
            strokeDasharray="2 4"
          />
          <text x={left + LEGEND_STEP + 28} y={legendY + 4} fontSize={10}>
            Reads
          </text>
          <rect
            x={left + LEGEND_STEP * 2}
            y={legendY - 6}
            width={12}
            height={12}
            fill="url(#graph-fill-missing)"
          />
          <text x={left + LEGEND_STEP * 2 + 18} y={legendY + 4} fontSize={10}>
            Missing cost
          </text>
          <rect
            x={left + LEGEND_STEP * 3}
            y={legendY - 6}
            width={12}
            height={12}
            fill="url(#graph-fill-partial)"
          />
          <text x={left + LEGEND_STEP * 3 + 18} y={legendY + 4} fontSize={10}>
            Partial coverage
          </text>
        </g>
      </svg>
    </section>
  );
}
