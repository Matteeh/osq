/**
 * A brace group is a `{`, text holding at least one comma and no other brace,
 * and a `}`. osq's scope matcher does not expand it, so an entry such as
 * `tests/golden/{a,b}.json` is an exact path that never matches the files it
 * means. A brace without a comma stays allowed because a real path may hold one.
 */
const BRACE_GROUP_REGEX = /\{[^{}]*,[^{}]*\}/;

/** The error message for one entry in the given task frontmatter field. */
function braceGroupError(taskFile: string, field: 'scope' | 'entry', entry: string): string {
  const label = field === 'scope' ? 'scope entry' : 'entry';
  return `Task in ${taskFile} ${label} "${entry}" holds a brace group, which osq scope globs do not expand; they support only *, **, ? and a trailing /. Use a folder glob such as dir/** or one entry per file`;
}

/**
 * Reports every task entry that holds a brace group osq's scope matcher does
 * not support. Scope entries come first, then entry entries, each in list
 * order, and the check is pure on the entry text.
 *
 * @scenario spec-lint-and-approve: Brace group cases
 */
export function braceGroupErrors(
  taskFile: string,
  scope: readonly string[],
  entry: readonly string[],
): string[] {
  const errors: string[] = [];
  for (const [field, entries] of [
    ['scope', scope],
    ['entry', entry],
  ] as const) {
    for (const raw of entries) {
      const candidate = raw.trim();
      if (BRACE_GROUP_REGEX.test(candidate)) {
        errors.push(braceGroupError(taskFile, field, candidate));
      }
    }
  }
  return errors;
}
