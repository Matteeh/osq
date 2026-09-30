import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { formatCapabilitySpecsSection } from '../src/cli/plan-sections.js';
import { parseFrontmatter } from '../src/core/spec/parser.js';
import { OPENCODE_PLANNER_AGENT_TEMPLATE } from '../src/harness/opencode/opencode.js';

const SPEC_LIST_SENTENCE =
  'All living specs. Read the requirements this change writes or whose code it uses, not whole specs: `osq spec <capability>` lists them and `osq spec <capability> <requirement>` prints one.';

/**
 * Translate an OpenCode permission pattern into an anchored regular
 * expression. `*` matches any characters, including spaces and newlines.
 */
function globToRegExp(pattern: string): RegExp {
  const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\*/g, '[\\s\\S]*');
  return new RegExp(`^${escaped}$`);
}

/** Apply OpenCode's last-matching-pattern-wins rule to a command. */
function evaluateBashRule(bashMap: Record<string, string>, command: string): string | undefined {
  let decision: string | undefined;
  for (const [pattern, rule] of Object.entries(bashMap)) {
    if (globToRegExp(pattern).test(command)) {
      decision = rule;
    }
  }
  return decision;
}

describe('plan prompt spec list label', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-planner-spec-command-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('labels the list and still lists every living spec', async () => {
    const specsDir = path.join(tmpDir, 'openspec', 'specs');
    await fs.mkdir(path.join(specsDir, 'alpha'), { recursive: true });
    await fs.mkdir(path.join(specsDir, 'beta'), { recursive: true });
    await fs.writeFile(path.join(specsDir, 'alpha', 'spec.md'), '# alpha\n', 'utf8');
    await fs.writeFile(path.join(specsDir, 'beta', 'spec.md'), '# beta\n', 'utf8');

    const section = await formatCapabilitySpecsSection(tmpDir, 'openspec');

    assert.ok(
      section.startsWith(`## Capability Specs\n\n${SPEC_LIST_SENTENCE}\n\n`),
      'the section must start with the labeled sentence',
    );
    assert.ok(
      section.includes('- openspec/specs/alpha/spec.md'),
      'the section must list every living spec',
    );
    assert.ok(
      section.includes('- openspec/specs/beta/spec.md'),
      'the section must list every living spec',
    );
  });
});

describe('opencode planner agent spec command permission', () => {
  /** Parse the planner template's `bash` permission map. */
  function plannerBashMap(): Record<string, string> {
    const { data } = parseFrontmatter(OPENCODE_PLANNER_AGENT_TEMPLATE);
    const perms = data.permission as Record<string, unknown>;
    return perms.bash as Record<string, string>;
  }

  it('allows the osq spec commands and denies chained ones', () => {
    const bash = plannerBashMap();

    assert.equal(
      evaluateBashRule(bash, 'osq spec cli-foundation "Spec command"'),
      'allow',
      'osq spec must be allowed',
    );
    assert.equal(
      evaluateBashRule(bash, 'pnpm osq spec cli-foundation'),
      'allow',
      'pnpm osq spec must be allowed',
    );
    assert.equal(
      evaluateBashRule(bash, 'osq spec cli-foundation; rm -rf x'),
      'deny',
      'a chained osq spec command must be denied',
    );
  });
});
