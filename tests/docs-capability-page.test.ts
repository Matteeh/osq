/**
 * The capability page model and the docs config block, proved on the docs
 * fixture. Scenarios: "Pages of the docs fixture", "Recent change limit", and
 * "Docs config values".
 */

import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { type OsqConfig, loadConfig } from '../src/core/foundation/config.js';
import { buildCapabilityPages } from '../src/docs/capability-page.js';
import { DOCS_DEFAULTS, docsConfig, resolveDocsConfig } from '../src/docs/docs-config.js';
import type { CapabilityPage } from '../src/docs/docs-types.js';
import { cleanupDocsProjects, docsProject } from './docs-support.js';

afterEach(cleanupDocsProjects);

/** The docs fixture's loaded config, optionally overriding `docs.recentChanges`. */
async function fixtureConfig(root: string, recentChanges?: number): Promise<OsqConfig> {
  const loaded = await loadConfig(root);
  return recentChanges === undefined
    ? loaded
    : ({ ...loaded, docs: { recentChanges } } as OsqConfig);
}

function pageNamed(pages: readonly CapabilityPage[], name: string): CapabilityPage {
  const found = pages.find((page) => page.name === name);
  assert.ok(found, `missing page ${name}`);
  return found;
}

describe('docs capability pages', () => {
  it('resolves the docs config values', () => {
    assert.deepEqual(DOCS_DEFAULTS, { recentChanges: 5 });
    assert.deepEqual(resolveDocsConfig(undefined), { recentChanges: 5 });
    assert.deepEqual(resolveDocsConfig({ recentChanges: 2 }), { recentChanges: 2 });
    assert.throws(
      () => resolveDocsConfig({ recentChanges: 0 }),
      /docs\.recentChanges must be a positive integer/,
    );
  });

  it('defaults docsConfig when the config has no docs block', async () => {
    const root = await docsProject();
    const config = await loadConfig(root);
    assert.deepEqual(docsConfig(config), { recentChanges: 5 });
  });

  it('builds each page of the docs fixture', async () => {
    const root = await docsProject();
    const pages = await buildCapabilityPages(root, await fixtureConfig(root));
    assert.deepEqual(
      pages.map((page) => page.name),
      ['invoices', 'pricing'],
    );

    const invoices = pageNamed(pages, 'invoices');
    assert.equal(invoices.group, null);
    assert.equal(invoices.requirements[0]?.shall, 'The system SHALL number invoices without gaps.');
    assert.deepEqual(
      invoices.decisions.map((decision) => decision.number),
      ['002', '004'],
    );
    assert.equal(invoices.codeMap, null);
    assert.deepEqual(
      invoices.recentChanges.map((change) => change.id),
      ['008'],
    );

    const pricing = pageNamed(pages, 'pricing');
    assert.equal(pricing.group, 'billing');
    assert.deepEqual(
      pricing.requirements.map((requirement) => requirement.name),
      ['Volume pricing', 'Percentage codes', 'Code ownership'],
    );
    assert.equal(
      pricing.requirements[0]?.shall,
      'The engine SHALL price every unit in a quote at the tier its quantity falls in.',
    );
    assert.deepEqual(
      pricing.decisions.map((decision) => decision.number),
      ['001', '002'],
    );
    assert.deepEqual(pricing.ownership, ['src/pricing/**', 'tests/pricing-*.test.ts']);
  });

  it('maps the pricing code map from the system graph', async () => {
    const root = await docsProject();
    const pages = await buildCapabilityPages(root, await fixtureConfig(root));
    const pricing = pageNamed(pages, 'pricing');
    assert.ok(pricing.codeMap, 'pricing should have a code map');
    const volume = pricing.codeMap.find((entry) => entry.scenario === 'Volume discount tiers');
    assert.ok(volume, 'missing the volume discount tier entry');
    assert.equal(volume.requirement, 'Volume pricing');
    assert.deepEqual(volume.functions, [{ file: 'src/pricing/quote.ts', line: 33, name: 'quote' }]);
    assert.deepEqual(volume.tests, ['tests/pricing-quote.test.ts']);
  });

  it('lists the five newest archived changes of pricing', async () => {
    const root = await docsProject();
    const pages = await buildCapabilityPages(root, await fixtureConfig(root));
    const pricing = pageNamed(pages, 'pricing');
    assert.deepEqual(
      pricing.recentChanges.map((change) => change.id),
      ['007', '006', '005', '004', '003'],
    );
    const first = pricing.recentChanges[0];
    assert.ok(first);
    assert.equal(first.archivedOn, '2026-10-07');
    assert.equal(first.goal, 'Change 7 goal.');
  });

  it('honours the docs.recentChanges limit', async () => {
    const root = await docsProject();
    const pages = await buildCapabilityPages(root, await fixtureConfig(root, 2));
    const pricing = pageNamed(pages, 'pricing');
    assert.deepEqual(
      pricing.recentChanges.map((change) => change.id),
      ['007', '006'],
    );
  });
});
