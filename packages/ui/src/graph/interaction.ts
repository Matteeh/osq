import type { Route } from '../router.js';

/** The canonical change route for one folder key. */
export function changeRoute(folderKey: string): Route {
  return { name: 'change', folderKey };
}

/** Invoke the supplied navigation callback with a change's folder-key route. */
export function navigateToChange(folderKey: string, onNavigate: (route: Route) => void): void {
  onNavigate(changeRoute(folderKey));
}

/** The minimal keyboard event an activatable SVG node receives. */
export interface ActivationKeyEvent {
  readonly key: string;
  preventDefault(): void;
}

/** Enter, Space, and the legacy Spacebar key activate a focused graph node. */
export function activationKey(event: ActivationKeyEvent, onActivate: () => void): void {
  if (event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar') {
    event.preventDefault();
    onActivate();
  }
}
