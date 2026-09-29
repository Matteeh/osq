import type { VcsStash, VcsStatusEntry } from './vcs.js';

export function nonEmpty(text: string): string | null {
  const trimmed = text.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parseStashBranch(subject: string): string | null {
  const match = /^(?:WIP on|On) (.+?): /.exec(subject);
  if (match === null) return null;
  const branch = match[1] ?? '';
  return branch === '(no branch)' ? null : branch;
}

export function parseStashes(output: string): VcsStash[] {
  const stashes: VcsStash[] = [];
  for (const line of output.split('\n')) {
    const [sha, subject] = line.split('\0');
    if (!sha) continue;
    stashes.push({ sha, branch: parseStashBranch(subject ?? '') });
  }
  return stashes;
}

export function parseStatus(output: string): VcsStatusEntry[] {
  const fields = output.split('\0');
  const entries: VcsStatusEntry[] = [];
  let index = 0;
  while (index < fields.length) {
    const field = fields[index] ?? '';
    index += 1;
    if (field.length < 4) continue;
    const code = field.slice(0, 2);
    const entry: { path: string; code: string; from?: string } = {
      path: field.slice(3),
      code,
    };
    if (code.includes('R') || code.includes('C')) {
      const from = fields[index];
      index += 1;
      if (from !== undefined && from !== '') entry.from = from;
    }
    entries.push(entry);
  }
  return entries;
}
