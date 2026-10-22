---
title: Beta reads alpha's count
depends_on: []
verify: node --test tests/beta.test.ts
check: node scripts/check.mjs
features:
  reads: [alpha]
---
## Goal

Beta reads alpha's count through the alpha module.

## Contract

### Requirement: Beta reads
Beta SHALL read alpha's count.

## Human steps

### Before approval

None

### After landing

Restart the beta service.
