/**
 * The dashboard docs section: the App nav link, the index, and each capability
 * and ADR page, over the site `buildDocsSite` builds for the docs fixture.
 * Scenarios: "Docs index view" and "Capability and ADR views".
 */

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { App, type AppProps } from '../packages/ui/src/app.js';
import type { DashboardSnapshot } from '../packages/ui/src/data.js';
import type { Route } from '../packages/ui/src/router.js';
import { loadConfig } from '../src/core/foundation/config.js';
import { buildDocsSite } from '../src/docs/docs-site.js';
import type { DocsSite } from '../src/docs/docs-types.js';
import { cleanupDocsProjects, docsProject } from './docs-support.js';

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const DOCS_CSS = path.join(ROOT, 'packages', 'ui', 'src', 'docs', 'docs.css');

let site: DocsSite;

before(async () => {
  const projectRoot = await docsProject();
  site = await buildDocsSite(projectRoot, await loadConfig(projectRoot));
});

after(async () => {
  await cleanupDocsProjects();
});

function renderDocs(route: Route, docs: DocsSite | null = site): string {
  const documents: DashboardSnapshot = {
    report: null,
    graph: null,
    inbox: null,
    change: null,
    docs,
  };
  const props: AppProps = {
    route,
    documents,
    loading: false,
    error: null,
    onNavigate: () => {},
    onRefresh: () => {},
  };
  return renderToStaticMarkup(createElement(App, props));
}

describe('docs index view', () => {
  it('lists the groups with ungrouped last, links each capability, and marks a superseded ADR', () => {
    const html = renderDocs({ name: 'docs' });
    const billing = html.indexOf('billing');
    const ungrouped = html.indexOf('ungrouped');
    assert.ok(billing >= 0, 'the billing group should render');
    assert.ok(ungrouped >= 0, 'the ungrouped group should render');
    assert.ok(billing < ungrouped, 'billing should come before ungrouped');
    assert.match(html, /href="#\/docs\/capabilities\/pricing"/);
    assert.ok(
      html.includes('ADR 003: Yearly Invoice Numbers (superseded)'),
      'ADR 003 should be marked superseded',
    );
    assert.match(html, /href="#\/docs\/adrs\/003"/);
  });

  it('adds the Docs nav link after Graph and marks it active on every docs route', () => {
    const routes: readonly Route[] = [
      { name: 'docs' },
      { name: 'docs-capability', capability: 'pricing' },
      { name: 'docs-adr', number: '003' },
    ];
    for (const route of routes) {
      const html = renderDocs(route);
      const graph = html.indexOf('href="#/graph"');
      const docs = html.indexOf('href="#/docs"');
      assert.ok(graph >= 0 && docs > graph, 'the Docs link should follow the Graph link');
      assert.match(html, /class="nav-link nav-link-active" href="#\/docs"/);
    }
  });

  it('shows an empty state while the docs document is null', () => {
    const html = renderDocs({ name: 'docs' }, null);
    assert.match(html, /No docs are available yet\./);
  });
});

describe('capability and ADR views', () => {
  it('shows the pricing SHALL sentence, the code map, and a link to change 007', () => {
    const html = renderDocs({ name: 'docs-capability', capability: 'pricing' });
    assert.ok(
      html.includes(
        'The engine SHALL price every unit in a quote at the tier its quantity falls in.',
      ),
    );
    assert.ok(html.includes('src/pricing/quote.ts:33'));
    assert.match(html, /href="#\/changes\/007-change-7"/);
  });

  it('links a superseded ADR to its successor', () => {
    const html = renderDocs({ name: 'docs-adr', number: '003' });
    assert.match(html, /href="#\/docs\/adrs\/004"/);
  });

  it('says No such page. for a name or number the site lacks', () => {
    assert.ok(renderDocs({ name: 'docs-adr', number: '999' }).includes('No such page.'));
    assert.ok(
      renderDocs({ name: 'docs-capability', capability: 'missing' }).includes('No such page.'),
    );
  });

  it('styles the docs body, paths, and globs to wrap at phone width', async () => {
    const css = await fs.readFile(DOCS_CSS, 'utf8');
    assert.match(css, /\.docs-body\s*\{[^}]*white-space:\s*pre-wrap/);
    assert.match(css, /\.docs-body\s*\{[^}]*overflow-wrap:\s*anywhere/);
    assert.match(css, /\.docs-path\s*\{[^}]*overflow-wrap:\s*anywhere/);
    assert.match(css, /\.docs-glob\s*\{[^}]*overflow-wrap:\s*anywhere/);
  });
});
