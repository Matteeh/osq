import fs from 'node:fs/promises';
import path from 'node:path';

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export async function getNextSpecNumber(specsDir: string): Promise<string> {
  const dirsToScan = [specsDir, path.join(specsDir, 'archive')];
  let maxNum = 0;

  for (const dir of dirsToScan) {
    let entries: string[] = [];
    try {
      entries = await fs.readdir(dir);
    } catch {
      continue;
    }

    for (const entry of entries) {
      const match = entry.match(/^(\d+)/);
      if (match) {
        const num = Number.parseInt(match[1], 10);
        if (!Number.isNaN(num) && num > maxNum) {
          maxNum = num;
        }
      }
    }
  }

  return String(maxNum + 1).padStart(3, '0');
}

export interface NewSpecResult {
  specId: string;
  folderName: string;
  folderPath: string;
}

export async function createNewSpec(
  projectDir: string,
  title: string,
  options: { specsDirName?: string } = {},
): Promise<NewSpecResult> {
  const trimmedTitle = title.trim();
  if (!trimmedTitle) {
    throw new Error('Spec name cannot be empty');
  }

  const slug = slugify(trimmedTitle);
  if (!slug) {
    throw new Error('Spec name cannot be empty');
  }

  const specsDir = path.join(projectDir, options.specsDirName || 'specs');
  const templateDir = path.join(specsDir, '_template');

  const templateExists = await fs
    .stat(templateDir)
    .then(() => true)
    .catch(() => false);
  if (!templateExists) {
    throw new Error(`Template directory not found at ${templateDir}. Run osq init first.`);
  }

  const specId = await getNextSpecNumber(specsDir);
  const folderName = `${specId}-${slug}`;
  const targetDir = path.join(specsDir, folderName);

  const targetExists = await fs
    .stat(targetDir)
    .then(() => true)
    .catch(() => false);
  if (targetExists) {
    throw new Error(`Spec folder already exists at ${targetDir}`);
  }

  // Copy template folder recursively
  await fs.cp(templateDir, targetDir, { recursive: true });

  // Update spec.md title
  const specMdPath = path.join(targetDir, 'spec.md');
  try {
    const specContent = await fs.readFile(specMdPath, 'utf8');
    const updatedContent = specContent.replace(/^title:\s*.*$/m, `title: ${trimmedTitle}`);
    await fs.writeFile(specMdPath, updatedContent, 'utf8');
  } catch {
    // If spec.md doesn't exist, proceed
  }

  return {
    specId,
    folderName,
    folderPath: targetDir,
  };
}
