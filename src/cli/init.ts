import { scaffoldProject } from '../core/foundation/init.js';

export async function initCommand(options: { cwd?: string } = {}): Promise<void> {
  const cwd = options.cwd || process.cwd();
  const result = await scaffoldProject(cwd);

  for (const dir of result.createdDirs) {
    console.log(`  created  ${dir}/`);
  }
  for (const file of result.createdFiles) {
    console.log(`  created  ${file}`);
  }
  for (const file of result.existingFiles) {
    console.log(`  exists   ${file}`);
  }
  if (result.updatedAgentsMd) {
    console.log('  updated  AGENTS.md (refreshed managed block)');
  }
  console.log('\nosq initialized successfully.');
}
