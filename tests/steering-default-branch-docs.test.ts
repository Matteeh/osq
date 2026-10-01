import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function readReadme(): Promise<string> {
  const raw = await fs.readFile(path.join(REPO_ROOT, 'README.md'), 'utf8');
  // Collapse line wrapping so prose phrases match regardless of where they break.
  return raw.replace(/\s+/g, ' ');
}

function section(readme: string, heading: string, next: string): string {
  const start = readme.indexOf(heading);
  assert.ok(start >= 0, `README must contain ${heading}`);
  const end = readme.indexOf(next, start + heading.length);
  assert.ok(end >= 0, `README must contain ${next} after ${heading}`);
  return readme.slice(start, end);
}

describe('README default-branch steering', () => {
  it("the steering bullet names the default-branch triggers and approval's branch", async () => {
    const readme = await readReadme();
    const gates = section(readme, '## Gates and permissions', '## Change folder');

    const steeringStart = gates.indexOf('**Steering.**');
    const recert = gates.indexOf('**Scope recertification.**');
    assert.ok(steeringStart >= 0, 'Gates and permissions must hold a **Steering.** bullet');
    assert.ok(
      recert > steeringStart,
      'the steering bullet must come before **Scope recertification.**',
    );

    const bullet = gates.slice(steeringStart, recert);
    for (const trigger of [
      'stuck',
      'blocked',
      'regression',
      'conflict',
      'requirement_changed',
      'sync_verify_red',
    ]) {
      assert.ok(bullet.includes(trigger), `the steering bullet must name the ${trigger} trigger`);
    }
    assert.ok(bullet.includes('osq land'), 'the steering bullet must name osq land');
    assert.match(
      bullet,
      /records? an archived change's stop/i,
      'it must say osq land records the stop',
    );
    assert.match(bullet, /restart/i, 'it must say approval restarts after a conflict');
    assert.match(bullet, /default branch/i, 'it must say the restart is from the default branch');
    assert.match(bullet, /keeps? the old branch/i, 'it must say the old branch is kept');
    assert.ok(
      bullet.includes('-restarted-'),
      'it must name the kept branch osq/<folder>-restarted-<n>',
    );
    assert.match(
      bullet,
      /every task runs again/i,
      'it must say every task runs again after a restart',
    );
    assert.match(
      bullet,
      /without running verify/i,
      'it must say the other default-branch approvals merge without running verify',
    );
    assert.match(bullet, /done task/i, 'it must say the merge keeps done tasks');
    assert.match(
      bullet,
      /default branch's current text/i,
      "it must say a revised requirement is judged against the default branch's current text",
    );
  });

  it('the sync paragraph names the three stop reasons and asks for steering', async () => {
    const readme = await readReadme();
    const vc = section(readme, '## Version control', '### Working with version control on');
    const syncStart = vc.indexOf("Before a change's first task");
    assert.ok(syncStart >= 0, 'Version control must describe the watcher sync');
    const paragraph = vc.slice(syncStart);

    assert.match(paragraph, /`?sync_conflict`?/, 'the sync paragraph must name sync_conflict');
    assert.match(
      paragraph,
      /`?requirement_changed`?/,
      'the sync paragraph must name requirement_changed',
    );
    assert.match(paragraph, /`?sync_verify_red`?/, 'the sync paragraph must name sync_verify_red');
    assert.ok(
      paragraph.includes('osq plan <id>'),
      'the sync paragraph must ask for steering with osq plan <id>',
    );
    assert.doesNotMatch(
      paragraph,
      /sync_failed/,
      'the sync paragraph must not keep the old sync_failed stop',
    );
    assert.doesNotMatch(
      paragraph,
      /merge by hand/i,
      'the sync paragraph must not tell you to merge by hand',
    );
  });

  it('the loop diagram shows the steering step', async () => {
    const readme = await readReadme();
    const loop = section(readme, '## The loop', '## Gates and permissions');
    assert.ok(loop.includes('steer when osq asks'), 'the loop diagram must show the steering step');
    assert.match(
      loop,
      /osq plan <id> -> revise the plan -> osq approve <id>, the run continues/,
      'the steering step must name osq plan, revise the plan, osq approve, and the run continues',
    );
  });

  it('CHANGELOG records the default-branch change under 129', async () => {
    const changelog = await fs.readFile(path.join(REPO_ROOT, 'CHANGELOG.md'), 'utf8');
    const entry = changelog.indexOf('(129)');
    assert.ok(entry >= 0, 'CHANGELOG.md must hold an entry ending (129)');
    const start = changelog.lastIndexOf('## [', entry);
    const nextRelease = changelog.indexOf('## [', entry);
    assert.ok(
      start >= 0 && nextRelease > entry,
      'the entry must sit in a section followed by a release',
    );
    const unreleased = changelog.slice(start, nextRelease);

    assert.match(unreleased, /\(129\)/, 'the entry must end (129)');
    assert.match(unreleased, /default branch/i, 'it must name the default branch');
    assert.match(unreleased, /archived or not/i, 'it must say archived or not');
    assert.match(
      unreleased,
      /osq plan <id>/,
      'it must say the change shows once with osq plan <id>',
    );
    assert.match(unreleased, /conflict/i, 'it must say approval restarts after a conflict');
    assert.match(unreleased, /merge/i, 'it must say approval merges the default branch otherwise');
  });
});
