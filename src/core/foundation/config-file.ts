import fs from 'node:fs/promises';
import path from 'node:path';
import { createJiti } from 'jiti';
import type { OsqUserConfig } from './config-user.js';
import { PACKAGE_ENTRY } from './package-root.js';

/** A config file that exists but fails to import or validate. */
export class ConfigLoadError extends Error {
  constructor(configPath: string, cause: unknown) {
    const message = cause instanceof Error ? cause.message : String(cause);
    super(`Failed to load ${configPath}: ${message}`);
    this.name = 'ConfigLoadError';
  }
}

/** The user config a project declares, and the file it came from if any. */
export interface LoadedConfigFile {
  readonly userConfig: OsqUserConfig;
  readonly path?: string;
}

const CONFIG_FILES = ['osq.config.ts', 'osq.config.js', 'osq.config.mjs'];

const isFile = (target: string): Promise<boolean> =>
  fs
    .stat(target)
    .then(() => true)
    .catch(() => false);

/**
 * Import the first existing config file through jiti, aliasing `@matteeh/osq`
 * to the running osq so a project without its own `node_modules` still loads a
 * scaffolded config. A file that fails to import rejects with a `ConfigLoadError`
 * naming it; no config file resolves to an empty user config.
 */
export async function loadConfigFile(projectRoot: string): Promise<LoadedConfigFile> {
  for (const file of CONFIG_FILES) {
    const fullPath = path.join(projectRoot, file);
    if (!(await isFile(fullPath))) continue;
    try {
      const jiti = createJiti(import.meta.url, {
        moduleCache: false,
        interopDefault: true,
        alias: { '@matteeh/osq': PACKAGE_ENTRY },
      });
      const loaded = await jiti.import(fullPath);
      const resolved = (loaded as { default?: OsqUserConfig })?.default || loaded;
      const userConfig =
        typeof resolved === 'object' && resolved !== null ? (resolved as OsqUserConfig) : {};
      return { userConfig, path: fullPath };
    } catch (err) {
      throw new ConfigLoadError(fullPath, err);
    }
  }
  return { userConfig: {} };
}
