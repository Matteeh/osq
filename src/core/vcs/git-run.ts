import { execFile } from 'node:child_process';

/** Default bound in seconds for each git read when `timeouts.gitSeconds` is unset. */
export const DEFAULT_GIT_SECONDS = 10;
/** Environment variables that would redirect osq's own git reads. */
const GIT_ENV_VARS = ['GIT_DIR', 'GIT_INDEX_FILE', 'GIT_WORK_TREE'] as const;

export interface GitResult {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}

/** Child env with redirecting variables removed and optional locks off, then `extra`. */
function childGitEnv(extra?: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const env = { ...process.env };
  for (const key of GIT_ENV_VARS) delete env[key];
  env.GIT_OPTIONAL_LOCKS = '0';
  if (extra !== undefined) Object.assign(env, extra);
  return env;
}

/** Run `git` with an argument list, never a shell, bounded by `timeoutSeconds`.
 * @scenario version-control: Prune past its time limit */
export function runGit(
  binary: string,
  args: string[],
  cwd: string,
  timeoutSeconds: number,
  extraEnv?: NodeJS.ProcessEnv,
): Promise<GitResult> {
  return new Promise((resolve) => {
    execFile(
      binary,
      args,
      // A patch carries a change's event logs, which outgrow execFile's 1 MiB default.
      {
        cwd,
        timeout: timeoutSeconds * 1000,
        env: childGitEnv(extraEnv),
        maxBuffer: Number.POSITIVE_INFINITY,
      },
      (error, stdout, stderr) => {
        const code = error ? (typeof error.code === 'number' ? error.code : 1) : 0;
        const suffix = `git ${args.join(' ')} timed out after ${timeoutSeconds}s`;
        const text = error?.killed === true ? `${String(stderr)}${suffix}` : String(stderr);
        resolve({ code, stdout: String(stdout), stderr: text });
      },
    );
  });
}
