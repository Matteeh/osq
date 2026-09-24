import { execFile } from 'node:child_process';

/** Short HEAD commit for `cwd`, or null when git is missing / not a repo. */
export function readGitCommit(cwd: string): Promise<string | null> {
  return new Promise((resolve) => {
    execFile('git', ['rev-parse', '--short', 'HEAD'], { cwd }, (error, stdout) => {
      if (error) {
        resolve(null);
        return;
      }
      const commit = String(stdout).trim();
      resolve(commit.length > 0 ? commit : null);
    });
  });
}

/** Top of the git work tree containing `cwd`, or null when not in a repo. */
export function readGitTopLevel(cwd: string): Promise<string | null> {
  return new Promise((resolve) => {
    execFile('git', ['rev-parse', '--show-toplevel'], { cwd }, (error, stdout) => {
      if (error) {
        resolve(null);
        return;
      }
      const top = String(stdout).trim();
      resolve(top.length > 0 ? top : null);
    });
  });
}

/**
 * Short HEAD commit of the project root, or null when it is not inside a git
 * repository. Unlike osq's own identity this may resolve to an enclosing work
 * tree, which is exactly what the project commit means for an installed osq.
 */
export async function resolveProjectCommit(projectRoot: string): Promise<string | null> {
  return readGitCommit(projectRoot);
}
