const fs = require('node:fs');
const path = require('node:path');

// Deterministic local verification for this fixture family: every case must
// carry its declaration and at least one change folder to compare.
const cases = fs
  .readdirSync(__dirname, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);
if (cases.length === 0) {
  console.error('openspec-diff fixture has no cases');
  process.exit(1);
}
for (const name of cases) {
  const caseFile = path.join(__dirname, name, 'case.json');
  if (!fs.existsSync(caseFile)) {
    console.error('openspec-diff fixture case is missing case.json', caseFile);
    process.exit(1);
  }
}
process.exit(0);
