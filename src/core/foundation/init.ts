import fs from 'node:fs/promises';
import path from 'node:path';
import { DEFAULT_CONFIG, type OsqConfig } from './config.js';
import { CLAUDE_PLAN_COMMAND_PATH } from './init-blocks.js';
import { updateAgentsMd, updateClaudePlanCommand, updatePlannerMd } from './init-managed.js';
import { TEMPLATES_ROOT } from './package-root.js';
import { writeRulesBlock } from './rules-block.js';

export { TEMPLATES_ROOT } from './package-root.js';
export {
  CLAUDE_PLAN_COMMAND_PATH,
  MANAGED_AGENTS_BLOCK,
  MANAGED_AGENTS_MD_BODY,
  MANAGED_CLAUDE_PLAN_COMMAND,
  MANAGED_PLANNER_BLOCK,
  OSQ_END_MARKER,
  OSQ_START_MARKER,
} from './init-blocks.js';
export {
  inspectManagedBlock,
  updateAgentsMd,
  updateClaudePlanCommand,
  updatePlannerMd,
} from './init-managed.js';
export type { ManagedBlockProblem } from './init-managed.js';

const DEFAULT_CONFIG_CONTENT = `import { defineConfig } from '@matteeh/osq';

export default defineConfig({
  harness: process.env.OSQ_HARNESS || 'agy',
  maxConcurrency: 1,
});
`;

const DEFAULT_ENV_EXAMPLE = `OSQ_HARNESS=agy
# GEMINI_API_KEY=
# ANTHROPIC_API_KEY=

# Codex CLI (optional): select it with OSQ_HARNESS=codex here, or with
# harness: 'codex' in osq.config.ts. An explicit harness in osq.config.ts wins
# over this environment fallback. Codex needs no generated config or credentials.
# CODEX_PATH=/path/to/codex        # binary: codex.bin -> CODEX_PATH -> codex
# OSQ_MODEL=<your-codex-model>     # model: codex.model -> OSQ_MODEL (Codex executor) -> native
# codex.effort in osq.config.ts sets reasoning effort; the default is native.
`;

export interface InitResult {
  createdDirs: string[];
  createdFiles: string[];
  existingFiles: string[];
  refreshedFiles: string[];
  currentFiles: string[];
  updatedAgentsMd: boolean;
  updatedProjectRules: boolean;
  updatedPlannerMd: boolean;
  updatedClaudePlanCommand: boolean;
}

async function pathExists(targetPath: string): Promise<boolean> {
  return fs
    .stat(targetPath)
    .then(() => true)
    .catch(() => false);
}

/**
 * Create a scaffolded file, or, when `refresh` is set, overwrite it from the
 * template only if its bytes differ. Matching files stay untouched.
 */
async function writeOrRefreshFile(
  targetDir: string,
  file: { relPath: string; content: string },
  refresh: boolean,
  result: InitResult,
): Promise<void> {
  const fullPath = path.join(targetDir, file.relPath);
  if (!(await pathExists(fullPath))) {
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, file.content, 'utf8');
    result.createdFiles.push(file.relPath);
    return;
  }
  if (!refresh) {
    result.existingFiles.push(file.relPath);
    return;
  }
  const current = await fs.readFile(fullPath);
  if (current.equals(Buffer.from(file.content, 'utf8'))) {
    result.currentFiles.push(file.relPath);
    return;
  }
  await fs.writeFile(fullPath, file.content, 'utf8');
  result.refreshedFiles.push(file.relPath);
}

export async function scaffoldProject(
  targetDir: string,
  options: { refreshSchema?: boolean; config?: OsqConfig } = {},
): Promise<InitResult> {
  const result: InitResult = {
    createdDirs: [],
    createdFiles: [],
    existingFiles: [],
    refreshedFiles: [],
    currentFiles: [],
    updatedAgentsMd: false,
    updatedProjectRules: false,
    updatedPlannerMd: false,
    updatedClaudePlanCommand: false,
  };

  const dirsToCreate = [
    'openspec',
    path.join('openspec', 'schemas'),
    path.join('openspec', 'schemas', 'osq'),
    path.join('openspec', 'schemas', 'osq', 'templates'),
    path.join('openspec', 'specs'),
    path.join('openspec', 'changes'),
    path.join('openspec', 'changes', 'archive'),
  ];

  for (const relDir of dirsToCreate) {
    const fullDir = path.join(targetDir, relDir);
    if (!(await pathExists(fullDir))) {
      await fs.mkdir(fullDir, { recursive: true });
      result.createdDirs.push(relDir);
    }
  }

  const baseFiles: Array<{ relPath: string; content: string }> = [
    { relPath: 'osq.config.ts', content: DEFAULT_CONFIG_CONTENT },
    { relPath: '.env.example', content: DEFAULT_ENV_EXAMPLE },
  ];

  const bundledTemplates = [
    path.join('openspec', 'config.yaml'),
    path.join('openspec', 'schemas', 'osq', 'schema.yaml'),
    path.join('openspec', 'schemas', 'osq', 'README.md'),
    path.join('openspec', 'schemas', 'osq', 'templates', 'proposal.md'),
    path.join('openspec', 'schemas', 'osq', 'templates', 'spec.md'),
    path.join('openspec', 'schemas', 'osq', 'templates', 'tasks.md'),
  ];

  for (const file of baseFiles) {
    await writeOrRefreshFile(targetDir, file, false, result);
  }

  for (const relPath of bundledTemplates) {
    const content = await fs.readFile(path.join(TEMPLATES_ROOT, relPath), 'utf8');
    await writeOrRefreshFile(
      targetDir,
      { relPath, content },
      options.refreshSchema ?? false,
      result,
    );
  }

  const claudeCommandExisted = await pathExists(path.join(targetDir, CLAUDE_PLAN_COMMAND_PATH));
  result.updatedAgentsMd = await updateAgentsMd(targetDir);
  result.updatedProjectRules = await writeRulesBlock(targetDir, options.config ?? DEFAULT_CONFIG);
  result.updatedPlannerMd = await updatePlannerMd(targetDir);
  result.updatedClaudePlanCommand = await updateClaudePlanCommand(targetDir);

  if (claudeCommandExisted) result.existingFiles.push(CLAUDE_PLAN_COMMAND_PATH);
  else result.createdFiles.push(CLAUDE_PLAN_COMMAND_PATH);

  return result;
}
