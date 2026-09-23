import type { ReactElement } from 'react';
import type { Inbox } from '../contracts.js';
import type { Route } from '../router.js';
import { LandedGroup } from './LandedGroup.js';
import { NeedsYouGroup } from './NeedsYouGroup.js';
import { RunningGroup } from './RunningGroup.js';

export interface HomeViewProps {
  readonly inbox: Inbox;
  readonly onNavigate: (route: Route) => void;
}

/**
 * The home route: the inbox's three groups, each with its own heading, in the
 * same order and from the same projection as the CLI inbox.
 */
export function HomeView({ inbox, onNavigate }: HomeViewProps): ReactElement {
  return (
    <section className="view home-view" aria-labelledby="home-view-title">
      <h2 id="home-view-title">Home</h2>
      <NeedsYouGroup items={inbox.needsYou} onNavigate={onNavigate} />
      <RunningGroup items={inbox.running} onNavigate={onNavigate} />
      <LandedGroup items={inbox.landed} onNavigate={onNavigate} />
    </section>
  );
}
