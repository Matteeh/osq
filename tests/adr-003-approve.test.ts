import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { DEFAULT_CONFIG } from '../src/core/foundation/config.js';
import { readDecisions } from '../src/core/foundation/decisions.js';
import { checkProjectRules, renderRulesBlock } from '../src/core/foundation/rules-block.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const adrPath = path.join(repoRoot, 'decisions', '003-git-strategy.md');

const NEW_RULE =
  "Agents never run git. osq alone writes to git, never rewrites history, and writes the human's checkout or main only through commands the human runs.";

/** The text of decision `n`, from its `### n.` heading to the next decision. */
function decision(text: string, n: number): string {
  const start = text.indexOf(`### ${n}.`);
  assert.ok(start >= 0, `decision ${n} must exist`);
  const next = text.indexOf(`### ${n + 1}.`, start + 1);
  assert.ok(next > start, `decision ${n} must end before decision ${n + 1}`);
  return text.slice(start, next);
}

describe('ADR 003: approval owns the draft', () => {
  it('reads ADR 003 with the rule that osq writes the checkout only through human-run commands', async () => {
    const records = await readDecisions(repoRoot, DEFAULT_CONFIG);
    const adr = records.adrs.find((entry) => entry.number === '003');

    assert.ok(adr, 'ADR 003 must be read');
    assert.equal(adr.rule, NEW_RULE);
  });

  it('renders the rules block with the new ADR 003 line and passes the project rules check', async () => {
    const records = await readDecisions(repoRoot, DEFAULT_CONFIG);
    const block = renderRulesBlock(records);

    assert.ok(block, 'the rules block must render');
    assert.ok(
      block.includes(`- ${NEW_RULE} ADR 003`),
      'the rules block must hold the new ADR 003 rule',
    );
    assert.deepEqual(await checkProjectRules(repoRoot, DEFAULT_CONFIG), []);
  });

  it('decision 2 removes the checkout copy', async () => {
    const two = decision(await fs.readFile(adrPath, 'utf8'), 2);

    assert.ok(
      two.includes('remove the folder from the checkout'),
      'decision 2 must remove the folder from the checkout',
    );
    assert.ok(
      !two.includes('It writes nothing to the checkout and deletes nothing'),
      'decision 2 must not keep the old claim that approval writes nothing to the checkout',
    );
  });

  it('decision 8 names osq reject of a stacked change', async () => {
    const eight = decision(await fs.readFile(adrPath, 'utf8'), 8);

    assert.ok(
      eight.includes('`osq reject` of a stacked change'),
      'decision 8 must name osq reject of a stacked change',
    );
  });

  it('README and AGENTS no longer name osq done or manual done', async () => {
    const [readme, agents] = await Promise.all([
      fs.readFile(path.join(repoRoot, 'README.md'), 'utf8'),
      fs.readFile(path.join(repoRoot, 'AGENTS.md'), 'utf8'),
    ]);

    assert.ok(!readme.includes('osq done'), 'README must not name osq done');
    assert.ok(!agents.includes('osq done'), 'AGENTS.md must not name osq done');
    assert.ok(!readme.includes('manual `done`'), 'README must not name manual `done`');
    assert.ok(!agents.includes('manual `done`'), 'AGENTS.md must not name manual `done`');
  });
});
