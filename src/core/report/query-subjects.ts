/**
 * Subjects and table shapes shared by the trial query tables: the archived
 * changes, in folder order, each with its folder name, path, and leading-number
 * id.
 */

/** One history table's name and ordered columns. */
export interface HistoryTable {
  readonly name: string;
  readonly columns: readonly string[];
}

/** One archived change a trial table draws rows from. */
export interface TrialSubject {
  readonly folder: string;
  readonly folderPath: string;
  /** The folder's leading digits, as written, or an empty string. */
  readonly id: string;
}

/**
 * The folder's leading digits, as written, or an empty string.
 *
 * @scenario metrics-and-reporting: Trial rows of one archived change
 * @adr 008
 */
export function folderId(folderName: string): string {
  const match = /^(\d+)/.exec(folderName);
  return match ? match[1] : '';
}
