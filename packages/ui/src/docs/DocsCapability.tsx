import type { ReactElement } from 'react';
import type { DocsSite } from '../contracts.js';
import type { Route } from '../router.js';
import { DocsLink } from './DocsLink.js';

type CapabilityPage = DocsSite['capabilities'][number];

export interface DocsCapabilityProps {
  readonly page: CapabilityPage;
  readonly onNavigate: (route: Route) => void;
}

/**
 * One capability page: group, purpose, requirements with their SHALL sentence
 * and scenario names, decisions, code ownership, the code map when present,
 * and recent changes, each linking to its change view.
 *
 * @scenario web-inspection: Capability and ADR views
 * @adr 016
 */
export function DocsCapability({ page, onNavigate }: DocsCapabilityProps): ReactElement {
  return (
    <section className="view docs-view" aria-labelledby="docs-capability-title">
      <h2 id="docs-capability-title">{page.name}</h2>
      <p className="docs-meta">Group: {page.group ?? 'ungrouped'}</p>
      <p className="docs-purpose">{page.purpose}</p>

      <h3>Requirements</h3>
      <ul className="docs-requirements">
        {page.requirements.map((requirement) => (
          <li key={requirement.name}>
            <h4>{requirement.name}</h4>
            <p className="docs-body">{requirement.shall}</p>
            <ul className="docs-scenarios">
              {requirement.scenarios.map((scenario) => (
                <li key={scenario}>Scenario: {scenario}</li>
              ))}
            </ul>
          </li>
        ))}
      </ul>

      <h3>Decisions</h3>
      {page.decisions.length === 0 ? (
        <p className="docs-none">None</p>
      ) : (
        <ul className="docs-list">
          {page.decisions.map((decision) => (
            <li key={decision.number}>
              <DocsLink
                route={{ name: 'docs-adr', number: decision.number }}
                onNavigate={onNavigate}
              >
                ADR {decision.number}: {decision.title}
              </DocsLink>
              : {decision.rule}
            </li>
          ))}
        </ul>
      )}

      <h3>Code ownership</h3>
      <ul className="docs-list">
        {page.ownership.map((glob) => (
          <li key={glob}>
            <code className="docs-glob">{glob}</code>
          </li>
        ))}
      </ul>

      {page.codeMap === null ? null : (
        <>
          <h3>Code map</h3>
          {page.codeMap.map((entry) => (
            <section key={`${entry.requirement}: ${entry.scenario}`} className="docs-code-map">
              <h4>
                {entry.requirement}: {entry.scenario}
              </h4>
              <ul className="docs-list">
                {entry.functions.map((fn) => (
                  <li key={`${fn.file}:${fn.line}`}>
                    <code className="docs-path">
                      {fn.file}:{fn.line}
                    </code>{' '}
                    {fn.name}
                  </li>
                ))}
                {entry.tests.map((test) => (
                  <li key={test}>
                    <code className="docs-path">test {test}</code>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </>
      )}

      <h3>Recent changes</h3>
      {page.recentChanges.length === 0 ? (
        <p className="docs-none">None</p>
      ) : (
        <ul className="docs-list">
          {page.recentChanges.map((change) => (
            <li key={change.id}>
              <DocsLink
                route={{ name: 'change', folderKey: change.folder }}
                onNavigate={onNavigate}
              >
                {change.id}
              </DocsLink>{' '}
              {change.archivedOn ?? 'undated'}: {change.goal}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
