import {
  type ApprovalDigest,
  formatApprovalFlags,
  summarizeApprovalFlags,
} from '../core/spec/digest.js';

/** Injectable prompt ports so callers and tests never need a real terminal. */
export interface ApprovalConfirmOptions {
  /** Defaults to a `node:readline/promises` question on stdin/stdout. */
  ask: (question: string) => Promise<string | null>;
  /** Defaults to `console.log`. */
  print?: (line: string) => void;
}

/** The exact confirmation prompt; defaults to no. */
export function approvalQuestion(id: string, flagCount: number): string {
  return `Approve ${id} with ${flagCount} flag(s)? [y/N]`;
}

/** The refusal message shown when `--confirm` runs without a terminal. */
export function refusalMessage(id: string, digest: ApprovalDigest): string {
  return `Refusing to approve ${id} without a terminal: ${summarizeApprovalFlags(digest.flags)}`;
}

/** Only `y` or `yes`, case-insensitive or trimmed, confirms; anything else declines. */
export function isAffirmative(answer: string | null | undefined): boolean {
  const value = (answer ?? '').trim().toLowerCase();
  return value === 'y' || value === 'yes';
}

/**
 * Prints every fired flag with its excerpt and asks the approver to confirm.
 * Returns `confirmed` only for an explicit affirmative answer; an empty line,
 * end of input, or any other answer declines.
 */
export async function requestApproval(
  id: string,
  digest: ApprovalDigest,
  options: ApprovalConfirmOptions,
): Promise<'confirmed' | 'declined'> {
  const print = options.print ?? ((line: string) => console.log(line));
  for (const line of formatApprovalFlags(digest.flags)) {
    print(line);
  }
  const answer = await options.ask(approvalQuestion(id, digest.flags.length));
  return isAffirmative(answer) ? 'confirmed' : 'declined';
}
