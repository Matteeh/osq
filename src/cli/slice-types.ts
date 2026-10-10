/**
 * The slice port. Each `src/<capability>/slice.ts` or
 * `src/kernel/<capability>/slice.ts` exports one `Slice` named after its
 * folder, and `SLICES` in `slices.ts` lists them. A slice loads its command
 * and tool code through `import()` inside a function, so its static runtime
 * imports never reach `config.ts` or `slices.ts`.
 */
import type { Command } from 'commander';
import type { SliceConfigBlock } from '../core/foundation/config-slices.js';
import type { McpTool } from './mcp-protocol.js';
import type { McpTarget } from './mcp-tools.js';

/** The four root-help groups a slice command declares. */
export type HelpGroupTitle = 'Everyday' | 'Setup and running' | 'Inspection' | 'Plumbing';

/** One command a slice adds to the program. */
export interface SliceCommand {
  readonly name: string;
  readonly group: HelpGroupTitle;
  /** Adds the command named `name` to `program`. */
  readonly register: (program: Command) => void;
}

/** What one slice folder registers: its name, config blocks, commands, tools. */
export interface Slice {
  readonly name: string;
  readonly config?: readonly SliceConfigBlock[];
  readonly commands?: readonly SliceCommand[];
  readonly tools?: (target: McpTarget) => readonly McpTool[];
}
