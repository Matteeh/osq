const fs = require('node:fs');
const path = require('node:path');

// Deterministic local verification for this fixture's executed changes: the
// report fixture is only meaningful when its archived change tree is present.
const target = path.join(__dirname, 'specs', 'archive');
if (!fs.existsSync(target)) {
  console.error('fixture report is missing', target);
  process.exit(1);
}
process.exit(0);
