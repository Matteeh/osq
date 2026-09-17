import fs from 'node:fs/promises';
import path from 'node:path';
import type { OsqConfig } from './config.js';
import { parseSpecMd, parseTaskMd } from './parser.js';

export interface LintResult {
  readonly valid: boolean;
  readonly errors: string[];
  readonly warnings: string[];
}

async function checkDependencyExists(
  projectRoot: string,
  depId: string,
  specsDirName: string,
): Promise<boolean> {
  const specsDir = path.join(projectRoot, specsDirName);
  const archiveDir = path.join(specsDir, 'archive');

  const dirsToCheck = [specsDir, archiveDir];
  const paddedDep = depId.padStart(3, '0');

  for (const dir of dirsToCheck) {
    try {
      const entries = await fs.readdir(dir);
      for (const entry of entries) {
        if (entry.startsWith(`${paddedDep}-`) || entry === paddedDep) {
          return true;
        }
      }
    } catch {
      // Directory may not exist yet
    }
  }

  return false;
}

export async function lintChangeFolder(
  projectRoot: string,
  folderPath: string,
  config: OsqConfig,
): Promise<LintResult> {
  const errors: string[] = [];
  const warnings: string[] = [];

  const specMdPath = path.join(folderPath, 'spec.md');
  let specContent = '';
  try {
    specContent = await fs.readFile(specMdPath, 'utf8');
  } catch {
    errors.push('spec.md not found in change folder');
    return { valid: false, errors, warnings };
  }

  const spec = parseSpecMd(specContent);

  // Check: features.writes max entries
  if (spec.features.writes.length > config.limits.maxFeatureWrites) {
    errors.push(
      `features.writes has ${spec.features.writes.length} entries (max allowed is ${config.limits.maxFeatureWrites})`,
    );
  }

  // Check: contract tables count
  if (spec.contractTablesCount > config.limits.maxContractTables) {
    errors.push(
      `Contract has ${spec.contractTablesCount} tables (max allowed is ${config.limits.maxContractTables})`,
    );
  }

  // Check: Delta empty while features.writes is not
  if (spec.features.writes.length > 0 && !spec.delta.trim()) {
    errors.push('Delta is empty while features.writes contains entries');
  }

  // Check: depends_on exists
  for (const dep of spec.dependsOn) {
    const exists = await checkDependencyExists(projectRoot, dep, config.paths.specs);
    if (!exists) {
      errors.push(`depends_on names missing change: ${dep}`);
    }
  }

  // Tasks checks
  const tasksDir = path.join(folderPath, 'tasks');
  let taskEntries: string[] = [];
  try {
    taskEntries = (await fs.readdir(tasksDir)).filter((e) => e.endsWith('.md'));
  } catch {
    errors.push('tasks directory not found in change folder');
  }

  if (taskEntries.length === 0) {
    errors.push('No task files found under tasks/');
  }

  for (const taskFile of taskEntries) {
    const taskPath = path.join(tasksDir, taskFile);
    const taskContent = await fs.readFile(taskPath, 'utf8');
    const task = parseTaskMd(taskContent);

    // Warning: task title contains " and "
    if (task.title.toLowerCase().includes(' and ')) {
      warnings.push(`Task in ${taskFile} title contains " and ": "${task.title}"`);
    }

    // Check: verify command empty or chains commands
    if (!task.verify) {
      errors.push(`Task in ${taskFile} verify command is empty`);
    } else if (
      task.verify.includes('&&') ||
      task.verify.includes(';') ||
      task.verify.includes('|')
    ) {
      errors.push(`Task in ${taskFile} verify chains commands ("${task.verify}")`);
    }

    // Check: acceptance checklist length
    if (task.acceptance.length > config.limits.maxAcceptanceLines) {
      errors.push(
        `Task in ${taskFile} acceptance lines (${task.acceptance.length}) exceeds limit ${config.limits.maxAcceptanceLines}`,
      );
    }

    // Check: scope expands to more than maxScopeFiles
    if (task.scope.length > config.limits.maxScopeFiles) {
      errors.push(
        `Task in ${taskFile} scope specifies ${task.scope.length} patterns, exceeding limit ${config.limits.maxScopeFiles}`,
      );
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}
