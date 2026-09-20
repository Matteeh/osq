import { execFile } from 'node:child_process';
import type { OsqConfig } from './config.js';
import { findHarness, resolveHarnessExecutable } from './harness-catalog.js';

/**
 * Resolve the binary the doctor must probe for the active harness, using the
 * catalog's executable resolution. Returns `null` for harnesses with no binary
 * (the mock adapter). Uncatalogued names are echoed back so doctor can still
 * report them as unavailable.
 */
export function harnessBinary(config: OsqConfig): string | null {
  const name = typeof config.harness === 'string' ? config.harness.trim() : '';
  if (name === '') return null;
  const entry = findHarness(name);
  return entry ? resolveHarnessExecutable(entry.name, config) : name;
}

/**
 * Probe `<bin> --version`, returning the first trimmed output line. The default
 * deadline matches the configured harness preflight value used elsewhere.
 */
export function probeVersion(bin: string, root: string, timeoutSeconds = 10): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      bin,
      ['--version'],
      { cwd: root, timeout: timeoutSeconds * 1000 },
      (err, out, errOut) => {
        if (err) return reject(err);
        resolve((out || errOut).trim().split('\n')[0].trim());
      },
    );
  });
}
