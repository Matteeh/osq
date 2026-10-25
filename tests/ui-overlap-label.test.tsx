import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { needsYouKindLabel } from '../packages/ui/src/home/labels.js';

describe('web-inspection: Overlap approved again label', () => {
  it('labels overlap-reapproved as overlap approved again', () => {
    assert.equal(needsYouKindLabel('overlap-reapproved'), 'overlap approved again');
  });
});
