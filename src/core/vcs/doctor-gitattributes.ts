import fs from 'node:fs/promises';
import path from 'node:path';
import type { DoctorCheckResult } from '../foundation/doctor.js';
import { GITATTRIBUTES_BLOCK } from '../foundation/gitattributes-block.js';

/**
 * The passing `gitattributes` warning when the project root's `.gitattributes`
 * is missing or does not contain the current managed line-endings block, or
 * null when the file holds that block wherever it sits. The message names
 * `osq init`, and the warning never changes doctor's exit code.
 *
 * @scenario cli-foundation: Gitattributes warning text
 * @scenario cli-foundation: Gitattributes with version control off
 * @scenario cli-foundation: Gitattributes warning keeps exit code
 * @adr 003
 */
export async function gitattributesWarning(projectRoot: string): Promise<DoctorCheckResult | null> {
  const filePath = path.join(projectRoot, '.gitattributes');
  const content = await fs.readFile(filePath, 'utf8').catch(() => null);
  if (content?.includes(GITATTRIBUTES_BLOCK)) return null;
  return {
    name: 'gitattributes',
    ok: true,
    warning: true,
    message: '.gitattributes has no current osq line endings block; run osq init',
  };
}
