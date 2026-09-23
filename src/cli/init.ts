import { scaffoldProject } from '../core/foundation/init.js';

export async function initCommand(
  options: { cwd?: string; refreshSchema?: boolean } = {},
): Promise<void> {
  const cwd = options.cwd || process.cwd();
  const result = await scaffoldProject(cwd, { refreshSchema: options.refreshSchema });

  for (const dir of result.createdDirs) {
    console.log(`  created  ${dir}/`);
  }
  for (const file of result.createdFiles) {
    console.log(`  created  ${file}`);
  }
  for (const file of result.existingFiles) {
    console.log(`  exists   ${file}`);
  }
  for (const file of result.refreshedFiles) {
    console.log(`  refreshed ${file}`);
  }
  for (const file of result.currentFiles) {
    console.log(`  current   ${file}`);
  }
  if (result.updatedAgentsMd) {
    console.log('  updated  AGENTS.md (refreshed managed block)');
  }
  console.log('\nosq initialized successfully.');
}
