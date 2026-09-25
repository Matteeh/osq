import { DEFAULT_CONFIG, loadConfig } from '../core/foundation/config.js';
import { scaffoldProject } from '../core/foundation/init.js';

export async function initCommand(
  options: { cwd?: string; refreshSchema?: boolean } = {},
): Promise<void> {
  const cwd = options.cwd || process.cwd();
  const config = await loadConfig(cwd).catch(() => DEFAULT_CONFIG);
  const result = await scaffoldProject(cwd, { refreshSchema: options.refreshSchema, config });

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
  if (result.updatedProjectRules) {
    console.log('  updated  AGENTS.md (project rules)');
  }
  console.log('\nosq initialized successfully.');
}
