import fs from 'node:fs/promises';
import path from 'node:path';
import {
  CLAUDE_PLAN_COMMAND_PATH,
  MANAGED_AGENTS_MD_BODY,
  MANAGED_CLAUDE_PLAN_COMMAND,
  MANAGED_PLANNER_BLOCK,
} from './init-blocks.js';
import { type ManagedBlockProblem, inspectManagedBlock } from './init-managed.js';

export interface ManagedBlocksResult {
  ok: boolean;
  message: string;
}

interface ManagedFile {
  relPath: string;
  canonical: string;
}

/**
 * Every planning entry point osq manages. Codex reads `AGENTS.md`, the human
 * planner model reads `PLANNER.md`, and Claude Code expands the command below.
 */
const MANAGED_FILES: readonly ManagedFile[] = [
  { relPath: 'AGENTS.md', canonical: MANAGED_AGENTS_MD_BODY },
  { relPath: 'PLANNER.md', canonical: MANAGED_PLANNER_BLOCK },
  { relPath: CLAUDE_PLAN_COMMAND_PATH, canonical: MANAGED_CLAUDE_PLAN_COMMAND },
];

const PROBLEM_TEXT: Record<ManagedBlockProblem, string> = {
  'missing-block': 'is missing its managed block',
  partial: 'has a partial managed block',
  reversed: 'has a reversed managed block',
  duplicated: 'has duplicate managed blocks',
  stale: 'has a stale managed block',
};

/**
 * Compare each managed file's osq block bytes with the installed canonical
 * values, so marker presence alone never counts as healthy.
 */
export async function checkManagedBlocks(projectRoot: string): Promise<ManagedBlocksResult> {
  const failures: string[] = [];
  for (const { relPath, canonical } of MANAGED_FILES) {
    const fullPath = path.join(projectRoot, relPath);
    let content: string;
    try {
      content = await fs.readFile(fullPath, 'utf8');
    } catch {
      failures.push(`${relPath} is missing`);
      continue;
    }
    const problem = inspectManagedBlock(content, canonical);
    if (problem) failures.push(`${relPath} ${PROBLEM_TEXT[problem]}`);
  }

  if (failures.length === 0) {
    return { ok: true, message: 'managed blocks valid' };
  }
  return { ok: false, message: `${failures.join('; ')} (run osq init)` };
}
