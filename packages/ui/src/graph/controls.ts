/** Which observed metric fills a change mark. */
export type GraphFill = 'cost' | 'attempts';

/**
 * Independent presentation toggles for the archive graph. The reducer never
 * touches the graph document; it only selects how that document is drawn.
 */
export interface GraphControls {
  readonly rejectedVisible: boolean;
  readonly readsVisible: boolean;
  readonly dependsVisible: boolean;
  readonly fill: GraphFill;
  readonly selectedCapability: string | null;
}

/** The initial graph state: rejected hidden, both relationship layers on, cost fill. */
export const DEFAULT_GRAPH_CONTROLS: GraphControls = {
  rejectedVisible: false,
  readsVisible: true,
  dependsVisible: true,
  fill: 'cost',
  selectedCapability: null,
};

export type GraphControlAction =
  | { readonly type: 'toggle-rejected' }
  | { readonly type: 'toggle-reads' }
  | { readonly type: 'toggle-depends' }
  | { readonly type: 'set-fill'; readonly fill: GraphFill }
  | { readonly type: 'select-capability'; readonly capability: string };

/**
 * Pure presentation transition shared by the controls and the tests. Selecting
 * the already-open capability closes it again; every other action flips only
 * its own independent field.
 */
export function graphControlsReducer(
  state: GraphControls,
  action: GraphControlAction,
): GraphControls {
  switch (action.type) {
    case 'toggle-rejected':
      return { ...state, rejectedVisible: !state.rejectedVisible };
    case 'toggle-reads':
      return { ...state, readsVisible: !state.readsVisible };
    case 'toggle-depends':
      return { ...state, dependsVisible: !state.dependsVisible };
    case 'set-fill':
      return { ...state, fill: action.fill };
    case 'select-capability':
      return {
        ...state,
        selectedCapability:
          state.selectedCapability === action.capability ? null : action.capability,
      };
    default:
      return state;
  }
}
