/**
 * The ADR page model and the docs site groups, proved on the docs fixture.
 * Scenarios: "ADR pages of the docs fixture" and "Groups of the docs fixture".
 */

import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { loadConfig } from '../src/core/foundation/config.js';
import { serializeWebJson } from '../src/core/web/web-http.js';
import { buildAdrPages } from '../src/docs/adr-page.js';
import { buildDocsSite } from '../src/docs/docs-site.js';
import type { AdrPage } from '../src/docs/docs-types.js';
import { cleanupDocsProjects, docsProject } from './docs-support.js';

afterEach(cleanupDocsProjects);

function adrNamed(pages: readonly AdrPage[], number: string): AdrPage {
  const found = pages.find((page) => page.number === number);
  assert.ok(found, `missing ADR ${number}`);
  return found;
}

describe('docs ADR pages', () => {
  it('builds each ADR page of the docs fixture', async () => {
    const root = await docsProject();
    const pages = await buildAdrPages(root, await loadConfig(root));
    assert.deepEqual(
      pages.map((page) => page.number),
      ['001', '002', '003', '004'],
    );

    const adr001 = adrNamed(pages, '001');
    assert.equal(adr001.title, 'Money in Integer Cents');
    assert.deepEqual(adr001.capabilities, ['pricing']);
    assert.ok(
      adr001.body.startsWith('Date: 2026-09-20'),
      `ADR 001 body should start with its date, got ${JSON.stringify(adr001.body.slice(0, 40))}`,
    );

    const adr002 = adrNamed(pages, '002');
    assert.deepEqual(adr002.capabilities, ['invoices', 'pricing']);

    const adr003 = adrNamed(pages, '003');
    assert.equal(adr003.status, 'superseded');
    assert.equal(adr003.supersededBy, '004');
  });
});

describe('docs site groups', () => {
  it('orders the groups of the docs fixture and builds deterministically', async () => {
    const root = await docsProject();
    const config = await loadConfig(root);
    const site = await buildDocsSite(root, config);
    assert.equal(site.version, 1);
    assert.deepEqual(site.groups, [
      { name: 'billing', capabilities: ['pricing'] },
      { name: 'ungrouped', capabilities: ['invoices'] },
    ]);
    assert.deepEqual(
      site.capabilities.map((page) => page.name),
      ['invoices', 'pricing'],
    );
    assert.deepEqual(
      site.adrs.map((page) => page.number),
      ['001', '002', '003', '004'],
    );

    const second = await buildDocsSite(root, config);
    assert.equal(serializeWebJson(site), serializeWebJson(second));
  });
});
