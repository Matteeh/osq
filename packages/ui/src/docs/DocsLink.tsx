import type { ReactElement, ReactNode } from 'react';
import type { Route } from '../router.js';
import { routeToHash } from '../router.js';

export interface DocsLinkProps {
  readonly route: Route;
  readonly onNavigate: (route: Route) => void;
  readonly children: ReactNode;
}

/** One internal docs link: a real anchor that routes without a page load. */
export function DocsLink({ route, onNavigate, children }: DocsLinkProps): ReactElement {
  return (
    <a
      href={routeToHash(route)}
      onClick={(event) => {
        event.preventDefault();
        onNavigate(route);
      }}
    >
      {children}
    </a>
  );
}
