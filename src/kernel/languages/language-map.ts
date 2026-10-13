import fs from 'node:fs/promises';
import path from 'node:path';
import type { OsqConfig } from '../../core/foundation/config.js';
import { selectVcs } from '../../core/vcs/select.js';
import { LANGUAGE_PRESETS } from './presets.js';

/** A map from project-relative paths to the language each path is in. */
export interface LanguageMap {
  /** Every language with at least one package, in preset order. */
  readonly languages: readonly string[];
  /** The nearest package's language that claims `filePath`, or null. */
  languageOf(filePath: string): string | null;
}

/** A project-relative POSIX path, without a leading `./` or backslashes. */
function toPosix(input: string): string {
  return input.split('\\').join('/').replace(/^\.\//, '');
}

/** The folder part of a POSIX path, `''` for a root file. */
function folderOf(filePath: string): string {
  const slash = filePath.lastIndexOf('/');
  return slash === -1 ? '' : filePath.slice(0, slash);
}

/** The file part of a POSIX path. */
function baseNameOf(filePath: string): string {
  const slash = filePath.lastIndexOf('/');
  return slash === -1 ? filePath : filePath.slice(slash + 1);
}

/** The extension of a POSIX path, `''` when it has none. */
function extensionOf(filePath: string): string {
  const base = baseNameOf(filePath);
  const dot = base.lastIndexOf('.');
  return dot <= 0 ? '' : base.slice(dot);
}

/**
 * Build a language map from project-relative POSIX paths. A path that is one
 * of a preset's manifests marks its folder as a package of that preset's
 * language. This is pure: it reads no file.
 *
 * @scenario languages: Paths and their languages
 * @scenario languages: No manifest
 * @adr 017
 */
export function languageMap(paths: readonly string[]): LanguageMap {
  const packages = new Map<string, Set<string>>();
  for (const raw of paths) {
    const filePath = toPosix(raw);
    const base = baseNameOf(filePath);
    const folder = folderOf(filePath);
    for (const preset of LANGUAGE_PRESETS) {
      if (!preset.manifests.includes(base)) continue;
      const languages = packages.get(folder) ?? new Set<string>();
      languages.add(preset.name);
      packages.set(folder, languages);
    }
  }

  const languages = LANGUAGE_PRESETS.filter((preset) =>
    [...packages.values()].some((set) => set.has(preset.name)),
  ).map((preset) => preset.name);

  const languageOf = (rawPath: string): string | null => {
    const filePath = toPosix(rawPath);
    const base = baseNameOf(filePath);
    const extension = extensionOf(filePath);
    let folder = folderOf(filePath);
    for (;;) {
      const here = packages.get(folder);
      if (here !== undefined) {
        for (const preset of LANGUAGE_PRESETS) {
          if (!here.has(preset.name)) continue;
          if (preset.extensions.includes(extension)) return preset.name;
          if (preset.manifests.includes(base) || preset.lockFiles.includes(base)) {
            return preset.name;
          }
        }
        return null;
      }
      if (folder === '') return null;
      const slash = folder.lastIndexOf('/');
      folder = slash === -1 ? '' : folder.slice(0, slash);
    }
  };

  return { languages, languageOf };
}

/** Every preset manifest that exists at the project root, in preset order. */
async function existingRootManifests(projectRoot: string): Promise<string[]> {
  const found: string[] = [];
  for (const preset of LANGUAGE_PRESETS) {
    for (const manifest of preset.manifests) {
      const stats = await fs.stat(path.join(projectRoot, manifest)).catch(() => null);
      if (stats?.isFile()) found.push(manifest);
    }
  }
  return found;
}

/**
 * Build the language map of a project's tracked files, its root manifests and
 * the `extra` paths. It writes nothing.
 *
 * @scenario languages: Languages from manifests
 * @adr 017
 */
export async function readLanguageMap(
  projectRoot: string,
  config: OsqConfig,
  extra: readonly string[] = [],
): Promise<LanguageMap> {
  const vcs = await selectVcs(projectRoot, config);
  const tracked = (await vcs.lineEndings()).map((entry) => entry.path);
  const rootManifests = await existingRootManifests(projectRoot);
  return languageMap([...tracked, ...rootManifests, ...extra]);
}
