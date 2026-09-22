const fs = require('node:fs');
const path = require('node:path');

// Deterministic local verification for this fixture's executed changes: the
// inbox fixture is only meaningful when its OpenSpec change tree is present.
const target = path.join(__dirname, 'openspec', 'changes');
if (!fs.existsSync(target)) {
  console.error('fixture inbox is missing', target);
  process.exit(1);
}
process.exit(0);
