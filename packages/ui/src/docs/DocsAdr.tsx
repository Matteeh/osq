import type { ReactElement } from 'react';
import type { DocsSite } from '../contracts.js';
import type { Route } from '../router.js';
import { DocsLink } from './DocsLink.js';

type AdrPage = DocsSite['adrs'][number];

export interface DocsAdrProps {
  readonly page: AdrPage;
  readonly onNavigate: (route: Route) => void;
}

/** The capabilities an ADR applies to, as links or `none`. */
function AppliesTo({
  page,
  onNavigate,
}: {
  readonly page: AdrPage;
  readonly onNavigate: (route: Route) => void;
}): ReactElement {
  if (page.capabilities.length === 0) return <span>none</span>;
  return (
    <>
      {page.capabilities.map((name, index) => (
        <span key={name}>
          {index > 0 ? ', ' : null}
          <DocsLink route={{ name: 'docs-capability', capability: name }} onNavigate={onNavigate}>
            {name}
          </DocsLink>
        </span>
      ))}
    </>
  );
}

/**
 * One ADR page: its status, a link to its successor when superseded, links to
 * the capabilities it applies to, its rule, and its body as preformatted text.
 *
 * @scenario web-inspection: Capability and ADR views
 * @adr 016
 */
export function DocsAdr({ page, onNavigate }: DocsAdrProps): ReactElement {
  return (
    <section className="view docs-view" aria-labelledby="docs-adr-title">
      <h2 id="docs-adr-title">
        ADR {page.number}: {page.title}
      </h2>
      <p className="docs-meta">
        Status: {page.status}
        {page.supersededBy === null ? null : (
          <>
            , superseded by{' '}
            <DocsLink
              route={{ name: 'docs-adr', number: page.supersededBy }}
              onNavigate={onNavigate}
            >
              ADR {page.supersededBy}
            </DocsLink>
          </>
        )}
      </p>
      <p className="docs-meta">
        Applies to: <AppliesTo page={page} onNavigate={onNavigate} />
      </p>
      {page.rule === '' ? null : <p className="docs-rule">Rule: {page.rule}</p>}
      <pre className="docs-body">{page.body}</pre>
    </section>
  );
}
