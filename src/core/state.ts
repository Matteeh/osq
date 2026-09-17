import fs from 'node:fs/promises';
import path from 'node:path';
import { parseFrontmatter, parseSpecMd, parseTaskMd } from './parser.js';

export type TaskStatus = 'pending' | 'running' | 'done' | 'dead';

export interface TaskState {
  taskNumber: string;
  fileName: string;
  title: string;
  status: TaskStatus;
  verify: string;
  deadReason?: string;
  resultFile?: string;
}

export type SpecStatus = 'unapproved' | 'blocked' | 'dead' | 'running' | 'pending' | 'done';

export interface SpecState {
  id: string;
  folderName: string;
  folderPath: string;
  title: string;
  status: SpecStatus;
  approvedHash: string | null;
  tasks: TaskState[];
  nextTask: TaskState | null;
}

export function compareNumericPrefix(a: string, b: string): number {
  const matchA = a.match(/^(\d+)/);
  const matchB = b.match(/^(\d+)/);
  if (matchA && matchB) {
    const numA = Number.parseInt(matchA[1], 10);
    const numB = Number.parseInt(matchB[1], 10);
    if (numA !== numB) {
      return numA - numB;
    }
  }
  return a.localeCompare(b);
}

export async function deriveTaskState(
  specFolderPath: string,
  taskFileName: string,
): Promise<TaskState> {
  const taskNumber = taskFileName.replace(/\.md$/, '');
  const taskPath = path.join(specFolderPath, 'tasks', taskFileName);
  const content = await fs.readFile(taskPath, 'utf8');
  const taskData = parseTaskMd(content);

  const runDir = path.join(specFolderPath, '.run');

  const donePath = path.join(runDir, 'done', taskNumber);
  try {
    await fs.stat(donePath);
    return {
      taskNumber,
      fileName: taskFileName,
      title: taskData.title,
      status: 'done',
      verify: taskData.verify,
    };
  } catch {}

  const deadPath = path.join(runDir, 'dead', `${taskNumber}.md`);
  try {
    const deadContent = await fs.readFile(deadPath, 'utf8');
    const { data } = parseFrontmatter(deadContent);
    return {
      taskNumber,
      fileName: taskFileName,
      title: taskData.title,
      status: 'dead',
      verify: taskData.verify,
      deadReason: typeof data.reason === 'string' ? data.reason : undefined,
    };
  } catch {}

  const runningPath = path.join(runDir, 'running', `${taskNumber}.pid`);
  try {
    await fs.stat(runningPath);
    return {
      taskNumber,
      fileName: taskFileName,
      title: taskData.title,
      status: 'running',
      verify: taskData.verify,
    };
  } catch {}

  const resultPath = path.join(runDir, 'results', `${taskNumber}.md`);
  let resultFile: string | undefined;
  try {
    await fs.stat(resultPath);
    resultFile = resultPath;
  } catch {}

  return {
    taskNumber,
    fileName: taskFileName,
    title: taskData.title,
    status: 'pending',
    verify: taskData.verify,
    resultFile,
  };
}

export async function deriveSpecState(
  projectRoot: string,
  specFolderPath: string,
): Promise<SpecState> {
  const folderName = path.basename(specFolderPath);
  const idMatch = folderName.match(/^(\d+)/);
  const id = idMatch ? idMatch[1] : folderName;

  const specMdPath = path.join(specFolderPath, 'spec.md');
  const specContent = await fs.readFile(specMdPath, 'utf8');
  const specData = parseSpecMd(specContent);

  const runDir = path.join(specFolderPath, '.run');
  const approvedPath = path.join(runDir, 'approved');

  let approvedHash: string | null = null;
  try {
    const hashContent = await fs.readFile(approvedPath, 'utf8');
    approvedHash = hashContent.trim();
  } catch {}

  const tasksDir = path.join(specFolderPath, 'tasks');
  let taskEntries: string[] = [];
  try {
    taskEntries = (await fs.readdir(tasksDir))
      .filter((e) => e.endsWith('.md'))
      .sort(compareNumericPrefix);
  } catch {}

  const tasks: TaskState[] = [];
  for (const entry of taskEntries) {
    tasks.push(await deriveTaskState(specFolderPath, entry));
  }

  let status: SpecStatus = 'pending';
  let nextTask: TaskState | null = null;

  if (!approvedHash) {
    status = 'unapproved';
  } else if (tasks.some((t) => t.status === 'dead')) {
    status = 'dead';
  } else if (tasks.some((t) => t.status === 'running')) {
    status = 'running';
  } else if (tasks.length > 0 && tasks.every((t) => t.status === 'done')) {
    status = 'done';
  } else {
    // Check prerequisites
    let blocked = false;
    for (const dep of specData.dependsOn) {
      const depPadded = dep.padStart(3, '0');
      const archiveDir = path.join(projectRoot, 'specs', 'archive');
      let inArchive = false;
      try {
        const archiveEntries = await fs.readdir(archiveDir);
        inArchive = archiveEntries.some((e) => e === depPadded || e.startsWith(`${depPadded}-`));
      } catch {}

      if (!inArchive) {
        const activeSpecsDir = path.join(projectRoot, 'specs');
        let isDepDone = false;
        try {
          const activeEntries = await fs.readdir(activeSpecsDir);
          const depFolder = activeEntries.find(
            (e) => e === depPadded || e.startsWith(`${depPadded}-`),
          );
          if (depFolder) {
            const depPath = path.join(activeSpecsDir, depFolder);
            const depRunDir = path.join(depPath, '.run');
            const depTasks = await fs.readdir(path.join(depPath, 'tasks'));
            const mdTasks = depTasks.filter((t) => t.endsWith('.md'));
            let allDone = mdTasks.length > 0;
            for (const t of mdTasks) {
              const num = t.replace(/\.md$/, '');
              try {
                await fs.stat(path.join(depRunDir, 'done', num));
              } catch {
                allDone = false;
                break;
              }
            }
            isDepDone = allDone;
          }
        } catch {}

        if (!isDepDone) {
          blocked = true;
          break;
        }
      }
    }

    if (blocked) {
      status = 'blocked';
    } else {
      nextTask = tasks.find((t) => t.status === 'pending') || null;
      status = nextTask ? 'pending' : 'done';
    }
  }

  return {
    id,
    folderName,
    folderPath: specFolderPath,
    title: specData.title,
    status,
    approvedHash,
    tasks,
    nextTask,
  };
}
