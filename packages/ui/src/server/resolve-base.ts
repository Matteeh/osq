/**
 * The API base for a page path. A dashboard served under `/p/<project>/`
 * requests every document under `/p/<project>`; anywhere else the base is the
 * empty string and requests stay at the bare `/api` paths.
 */
const PROJECT_PATH = /^\/p\/([A-Za-z0-9][A-Za-z0-9._-]*)\//;

/** Resolve the `/p/<project>` prefix a page path is served under, or `''`. */
export function resolveApiBase(pathname: string): string {
  const match = PROJECT_PATH.exec(pathname);
  return match === null ? '' : `/p/${match[1]}`;
}
