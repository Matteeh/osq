import { SCOPE_RESOLVER_VERSION, computeTaskScopeHash } from '../core/run/scope-hash.js';
import { resolveProjectCommit } from './build-project.js';
import { resolveBuildInfo } from './build.js';
import type { DoneMarkerMetadata } from './outcome.js';

/** Resolve the metadata written to the done marker after a passing task. */
export async function buildDoneMetadata(
  projectRoot: string,
  scope: string[],
): Promise<DoneMarkerMetadata> {
  const [scopeHash, buildInfo, projectCommit] = await Promise.all([
    computeTaskScopeHash(projectRoot, scope),
    resolveBuildInfo(),
    resolveProjectCommit(projectRoot),
  ]);
  return {
    scopeHash: scopeHash.hash,
    buildStamp: buildInfo.commit,
    projectCommit,
    exitCode: 0,
    fileHashes: scopeHash.fileHashes,
    scopeResolver: SCOPE_RESOLVER_VERSION,
  };
}
