---
status: accepted
applies_to: [alpha, group:core]
rule: "  Keep the full record.  "
checks:
  - ./tests/a.test.ts
  - 'tests\b.rs'
denies: [left-pad]
enforced_by: validator
---
# 001. Full record

Date: 2026-01-02, revised 2026-03-04

Every field is set.
