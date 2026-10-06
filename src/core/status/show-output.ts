import { formatApprovalDigest, formatApprovalFlags } from '../spec/digest.js';
import { landLines } from './show-land-lines.js';
import { formatSpecDetails } from './show-text.js';
import type { SpecDetails } from './show-types.js';

/** Render the model as text, appending the land and digest lines when present. */
export function formatShowText(details: SpecDetails): string {
  let formatted = formatSpecDetails(details);
  const land = landLines(details);
  if (land.length > 0) {
    formatted += `\n${land.join('\n')}`;
  }
  if (details.digest) {
    formatted += `\n${formatApprovalDigest(details.digest)}`;
    for (const line of formatApprovalFlags(details.digest.flags)) {
      formatted += `\n${line}`;
    }
  }
  return formatted;
}

/** Render the model as JSON, without the proposal fields and with digest last. */
export function formatShowJson(details: SpecDetails): string {
  const { surface, decisions, beforeApproval, digest, ...rest } = details;
  void surface;
  void decisions;
  void beforeApproval;
  return JSON.stringify({ ...rest, digest }, null, 2);
}
