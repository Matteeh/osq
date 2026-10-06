import fs from 'node:fs/promises';
import path from 'node:path';

/** Change-folder-relative directory every verify log lives in. */
const LOGS_DIR = path.join('.run', 'logs');

/**
 * Write a run's whole output to the next free `.run/logs/<target>-<n>.log` of
 * the change folder and return that path relative to the change folder.
 */
export async function writeVerifyLog(
  changeFolder: string,
  target: string,
  output: string,
): Promise<string> {
  const logsDir = path.join(changeFolder, LOGS_DIR);
  await fs.mkdir(logsDir, { recursive: true });
  const gitignorePath = path.join(logsDir, '.gitignore');
  try {
    await fs.access(gitignorePath);
  } catch {
    await fs.writeFile(gitignorePath, '*\n', 'utf8');
  }

  const matcher = new RegExp(`^${target}-\\d+\\.log$`);
  const entries = await fs.readdir(logsDir);
  const next = entries.filter((entry) => matcher.test(entry)).length + 1;

  const relative = path.join(LOGS_DIR, `${target}-${next}.log`).split(path.sep).join('/');
  await fs.writeFile(path.join(changeFolder, relative), output, 'utf8');
  return relative;
}
