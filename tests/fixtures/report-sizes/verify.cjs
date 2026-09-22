const fs = require('node:fs');
const path = require('node:path');

// Deterministic local verification for this fixture's executed changes: the
// size fixture is only meaningful when its archived change tree is present.
const target = path.join(__dirname, 'openspec', 'changes', 'archive');
if (!fs.existsSync(target)) {
  console.error('report-sizes fixture is missing', target);
  process.exit(1);
}
process.exit(0);
