import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';
import {
  hasOptedInCapability,
  isCapabilityOptedIn,
} from '../src/core/foundation/config-traceability.js';

/** The four files that must consume the one opt-in definition. */
const CONSUMER_SOURCES = [
  'src/core/trace/mutation-pick.ts',
  'src/core/run/focused-tests.ts',
  'src/watcher/mutation-check.ts',
  'src/core/report/report-mutation.ts',
];

const TRACEABILITY_IMPORT = /from\s+['"][^'"]*foundation\/config-traceability\.js['"]/;
const OWN_DEFINITION =
  /\b(?:function\s+(?:isOptedIn|hasOptedInCapability)\b|const\s+(?:isOptedIn|hasOptedInCapability)\s*=)/;
const OWN_ALL_COMPARISON = /capabilities\s*(?:===|!==)\s*['"]all['"]/;

describe('opt-in answers', () => {
  it('answers every capabilities value as the table says', () => {
    const cases: readonly {
      readonly capabilities: 'all' | readonly string[];
      readonly isPricing: boolean;
      readonly any: boolean;
    }[] = [
      { capabilities: 'all', isPricing: true, any: true },
      { capabilities: ['pricing', 'billing'], isPricing: true, any: true },
      { capabilities: ['billing'], isPricing: false, any: true },
      { capabilities: [], isPricing: false, any: false },
    ];
    for (const row of cases) {
      assert.equal(
        isCapabilityOptedIn(row.capabilities, 'pricing'),
        row.isPricing,
        `isCapabilityOptedIn(${JSON.stringify(row.capabilities)}, pricing)`,
      );
      assert.equal(
        hasOptedInCapability(row.capabilities),
        row.any,
        `hasOptedInCapability(${JSON.stringify(row.capabilities)})`,
      );
    }
  });
});

describe('one opt-in definition', () => {
  it('has every consumer call the exported functions and define none of its own', async () => {
    for (const relative of CONSUMER_SOURCES) {
      const source = await fs.readFile(path.join(process.cwd(), relative), 'utf8');
      assert.equal(OWN_DEFINITION.test(source), false, `${relative} defines its own opt-in`);
      assert.equal(
        OWN_ALL_COMPARISON.test(source),
        false,
        `${relative} compares capabilities with 'all' itself`,
      );
      assert.match(
        source,
        TRACEABILITY_IMPORT,
        `${relative} must import from foundation/config-traceability.js`,
      );
    }
  });
});
