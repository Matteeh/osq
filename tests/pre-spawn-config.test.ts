import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  DEFAULT_GATES_CONFIG,
  type PreSpawnVerifyMode,
} from '../src/core/foundation/config-gates.js';
import { DEFAULT_CONFIG, defineConfig } from '../src/core/foundation/config.js';
import { parseTaskMd } from '../src/core/spec/parser.js';

describe('pre-spawn verify configuration', () => {
  it('defaults the pre-spawn verify mode to warn', () => {
    const mode: PreSpawnVerifyMode | undefined = DEFAULT_GATES_CONFIG.preSpawnVerify;
    assert.equal(mode, 'warn');
    assert.equal(DEFAULT_CONFIG.gates?.preSpawnVerify, 'warn');
    assert.equal(defineConfig({}).gates?.preSpawnVerify, 'warn');
    assert.equal(defineConfig({}).gates?.changeVerifyAfterTask, true);
  });

  it('retains a declared pre-spawn mode while keeping the task gate', () => {
    const config = defineConfig({ gates: { preSpawnVerify: 'fail' } });
    assert.equal(config.gates?.preSpawnVerify, 'fail');
    assert.equal(config.gates?.changeVerifyAfterTask, true);
  });

  it('rejects an invalid pre-spawn mode', () => {
    assert.throws(
      () => defineConfig({ gates: { preSpawnVerify: 'sometimes' } as never }),
      /gates\.preSpawnVerify/,
    );
  });
});

describe('task start state parsing', () => {
  function task(frontmatter: string): string {
    return `---\n${frontmatter}\n---\n## Acceptance\n- [ ] task parses\n`;
  }

  it('defaults an absent verify_starts to red', () => {
    assert.equal(parseTaskMd(task('title: t\nverify: node x.cjs')).verifyStarts, 'red');
  });

  it('reads green and any declarations', () => {
    assert.equal(
      parseTaskMd(task('title: t\nverify: node x.cjs\nverify_starts: green')).verifyStarts,
      'green',
    );
    assert.equal(
      parseTaskMd(task('title: t\nverify: node x.cjs\nverify_starts: any')).verifyStarts,
      'any',
    );
  });

  it('treats an unrecognized verify_starts as red', () => {
    assert.equal(
      parseTaskMd(task('title: t\nverify: node x.cjs\nverify_starts: blue')).verifyStarts,
      'red',
    );
  });
});
