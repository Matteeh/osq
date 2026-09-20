import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { findSpecFolder } from '../core/approve.js';
import { resolvePlannerSelection } from '../core/config-codex.js';
import { loadConfig } from '../core/config.js';
import { getChangesDir, getSpecsDir } from '../core/layout.js';
import { buildManifest, writeManifest } from '../core/manifest.js';
import { createNewSpec } from '../core/new.js';
import { parseFrontmatter } from '../core/parser.js';
import { getHarnessAdapter } from '../harness/index.js';
import type { HarnessAdapter } from '../harness/types.js';

export async function readBriefInput(briefOption?: string): Promise<string> {
  if (briefOption === '-') {
    return new Promise<string>((resolve, reject) => {
      let data = '';
      process.stdin.setEncoding('utf8');
      process.stdin.on('data', (chunk) => {
        data += chunk;
      });
      process.stdin.on('end', () => resolve(data));
      process.stdin.on('error', reject);
    });
  }

  if (briefOption) {
    return await fs.readFile(briefOption, 'utf8');
  }

  const editor = process.env.VISUAL || process.env.EDITOR;
  if (editor) {
    const tempFile = path.join(os.tmpdir(), `osq-brief-${Date.now()}.md`);
    await fs.writeFile(
      tempFile,
      '# Feature Brief\n\nDescribe the goal, background, and requirements here.\n',
      'utf8',
    );
    try {
      const parts = editor.trim().split(/\s+/);
      const res = spawnSync(parts[0], [...parts.slice(1), tempFile], {
        stdio: 'inherit',
      });
      if (res.error || res.status !== 0) {
        throw new Error(`Editor ${editor} exited with code ${res.status}`);
      }
      return await fs.readFile(tempFile, 'utf8');
    } finally {
      await fs.rm(tempFile, { force: true }).catch(() => {});
    }
  }

  throw new Error('No brief provided. Specify --brief <file> or set $EDITOR.');
}

export function formatBriefContent(body: string, plannerModel: string, today: string): string {
  const trimmed = body.trim();
  const parsed = parseFrontmatter(trimmed);
  const frontmatterData = {
    ...parsed.data,
    planner: plannerModel,
    date: today,
  };

  const yamlLines = Object.entries(frontmatterData).map(([k, v]) => `${k}: ${v}`);
  const fm = `---\n${yamlLines.join('\n')}\n---\n\n`;
  const cleanBody = parsed.body.trim();

  return `${fm}${cleanBody}\n`;
}

export async function buildOpeningPrompt(options: {
  projectRoot: string;
  folderPath: string;
  specId: string;
  specTitle: string;
  briefContent: string;
  openspecRoot: string;
}): Promise<string> {
  const { projectRoot, folderPath, specId, specTitle, briefContent, openspecRoot } = options;

  let plannerMd = '';
  try {
    plannerMd = await fs.readFile(path.join(projectRoot, 'PLANNER.md'), 'utf8');
  } catch {
    plannerMd = '# Planning a change for osq\n';
  }

  const changeHeader = `# Change: ${specId} - ${specTitle}\nChange ID: ${specId}\nChange Folder: ${path.basename(folderPath)}`;

  const specsDir = getSpecsDir(openspecRoot, projectRoot);
  const specPaths: string[] = [];
  try {
    const entries = await fs.readdir(specsDir, { withFileTypes: true });
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.isDirectory()) {
        const rel = path.relative(projectRoot, path.join(specsDir, entry.name, 'spec.md'));
        specPaths.push(rel);
      }
    }
  } catch {}
  const specsHeader = `## Capability Specs\n\n${specPaths.map((p) => `- ${p}`).join('\n')}`;

  const briefHeader = `## Brief\n\n${briefContent.trim()}`;

  return [plannerMd.trim(), changeHeader.trim(), specsHeader.trim(), briefHeader.trim()].join(
    '\n\n',
  );
}

export async function planCommand(
  nameOrId: string,
  options: { brief?: string; print?: boolean; cwd?: string; adapter?: HarnessAdapter } = {},
): Promise<void> {
  const cwd = options.cwd || process.cwd();
  const config = await loadConfig(cwd);
  const plannerSelection = resolvePlannerSelection(config);
  const changesDir = getChangesDir(config.paths.openspecRoot, cwd);

  let folderPath: string | null = null;
  let specId: string | null = null;
  let isResumed = false;

  try {
    folderPath = await findSpecFolder(changesDir, nameOrId);
    const briefExists = await fs
      .stat(path.join(folderPath, 'brief.md'))
      .then(() => true)
      .catch(() => false);
    if (briefExists) {
      isResumed = true;
      const folderName = path.basename(folderPath);
      specId = folderName.match(/^(\d+)/)?.[1] || folderName;
    }
  } catch {}

  if (!isResumed) {
    const newResult = await createNewSpec(cwd, nameOrId);
    folderPath = newResult.folderPath;
    specId = newResult.specId;
    if (!options.print) {
      console.log(`Created spec ${specId}: ${newResult.folderName}`);
      console.log(`  Path: ${folderPath}`);
    }

    const rawBrief = await readBriefInput(options.brief);
    const today = new Date().toISOString().split('T')[0];
    const formattedBrief = formatBriefContent(rawBrief, plannerSelection.briefModel, today);

    const briefPath = path.join(folderPath, 'brief.md');
    await fs.writeFile(briefPath, formattedBrief, 'utf8');

    const runDir = path.join(folderPath, '.run');
    await fs.mkdir(runDir, { recursive: true });
    const manifest = await buildManifest(cwd, folderPath, config);
    await writeManifest(runDir, manifest);
  }

  if (!folderPath || !specId) {
    throw new Error('Failed to resolve change folder');
  }

  const briefPath = path.join(folderPath, 'brief.md');
  const briefContent = await fs.readFile(briefPath, 'utf8');

  let specTitle = nameOrId;
  try {
    const proposalContent = await fs.readFile(path.join(folderPath, 'proposal.md'), 'utf8');
    const parsed = parseFrontmatter(proposalContent);
    if (parsed.data.title) {
      specTitle = String(parsed.data.title);
    }
  } catch {}

  const openingPrompt = await buildOpeningPrompt({
    projectRoot: cwd,
    folderPath,
    specId,
    specTitle,
    briefContent,
    openspecRoot: config.paths.openspecRoot,
  });

  if (options.print) {
    process.stdout.write(`${openingPrompt}\n`);
    return;
  }

  const adapter = options.adapter || getHarnessAdapter(plannerSelection.harness);
  if (!adapter.spawnInteractive) {
    throw new Error(
      `Harness adapter for '${plannerSelection.harness}' does not support interactive sessions.`,
    );
  }
  const exitCode = await adapter.spawnInteractive({
    prompt: openingPrompt,
    cwd,
    model: plannerSelection.model,
    agent: plannerSelection.agent,
  });

  if (exitCode !== 0) {
    process.exitCode = exitCode;
  }
}
