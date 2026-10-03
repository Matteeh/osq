import { scaffoldProject } from '../core/foundation/init.js';
import { type CommandInputs, resolveInputs } from './command-inputs.js';

export interface InitCommandOptions extends CommandInputs {
  refreshSchema?: boolean;
}

export async function initCommand(options: InitCommandOptions = {}): Promise<void> {
  const inputs = resolveInputs(options);
  const config = await inputs.config();
  const result = await scaffoldProject(inputs.cwd, {
    refreshSchema: options.refreshSchema,
    config,
  });

  for (const dir of result.createdDirs) {
    inputs.stdout(`  created  ${dir}/\n`);
  }
  for (const file of result.createdFiles) {
    inputs.stdout(`  created  ${file}\n`);
  }
  for (const file of result.existingFiles) {
    inputs.stdout(`  exists   ${file}\n`);
  }
  for (const file of result.refreshedFiles) {
    inputs.stdout(`  refreshed ${file}\n`);
  }
  for (const file of result.currentFiles) {
    inputs.stdout(`  current   ${file}\n`);
  }
  if (result.updatedAgentsMd) {
    inputs.stdout('  updated  AGENTS.md (refreshed managed block)\n');
  }
  if (result.updatedProjectRules) {
    inputs.stdout('  updated  AGENTS.md (project rules)\n');
  }
  inputs.stdout('\nosq initialized successfully.\n');
}
