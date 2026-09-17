import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseFrontmatter, parseSpecMd, parseTaskMd } from '../src/core/parser.js';

describe('Spec and Task Parser', () => {
  it('parseFrontmatter extracts YAML metadata and markdown content', () => {
    const raw = `---
title: Sample Title
count: 42
---
# Body Heading
Some text here.`;

    const { data, body } = parseFrontmatter(raw);
    assert.equal(data.title, 'Sample Title');
    assert.equal(data.count, 42);
    assert.ok(body.includes('# Body Heading'));
  });

  it('parseSpecMd extracts title, depends_on, features, and markdown sections', () => {
    const raw = `---
title: Order Cancellation
depends_on: [001, 002]
features:
  reads: [inventory]
  writes: [orders, states]
---
## Goal
Cancel orders cleanly.

## Contract
| Event | Action |
|---|---|
| cancel | release inventory |

## Non-goals
Refund handling.

## Delta
Modify orders feature doc.`;

    const spec = parseSpecMd(raw);
    assert.equal(spec.title, 'Order Cancellation');
    assert.deepEqual(spec.dependsOn, ['001', '002']);
    assert.deepEqual(spec.features.reads, ['inventory']);
    assert.deepEqual(spec.features.writes, ['orders', 'states']);
    assert.ok(spec.goal.includes('Cancel orders cleanly.'));
    assert.equal(spec.contractTablesCount, 1);
    assert.ok(spec.nonGoals.includes('Refund handling.'));
    assert.ok(spec.delta.includes('Modify orders feature doc.'));
  });

  it('parseTaskMd extracts task metadata and acceptance criteria list', () => {
    const raw = `---
title: When order is cancelled, reservation is released
verify: pnpm test tests/cancel.test.ts
scope: [src/orders/**, tests/orders/**]
entry: [src/orders/service.ts]
skills: []
---
## Acceptance
- [ ] reservation is released immediately
- [ ] event is emitted to bus
- [ ] order status updates to CANCELLED`;

    const task = parseTaskMd(raw);
    assert.equal(task.title, 'When order is cancelled, reservation is released');
    assert.equal(task.verify, 'pnpm test tests/cancel.test.ts');
    assert.deepEqual(task.scope, ['src/orders/**', 'tests/orders/**']);
    assert.deepEqual(task.entry, ['src/orders/service.ts']);
    assert.deepEqual(task.skills, []);
    assert.equal(task.acceptance.length, 3);
    assert.equal(task.acceptance[0], 'reservation is released immediately');
    assert.equal(task.acceptance[1], 'event is emitted to bus');
    assert.equal(task.acceptance[2], 'order status updates to CANCELLED');
  });

  it('handles empty sections or missing frontmatter safely', () => {
    const raw = 'Just plain markdown without frontmatter.';
    const spec = parseSpecMd(raw);
    assert.equal(spec.title, '');
    assert.deepEqual(spec.dependsOn, []);
    assert.deepEqual(spec.features.reads, []);
    assert.deepEqual(spec.features.writes, []);
    assert.equal(spec.contractTablesCount, 0);
  });
});
