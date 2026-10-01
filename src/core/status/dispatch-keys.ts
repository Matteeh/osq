import type { DispatchCard } from './dispatch-cards.js';
import type { DispatchItem } from './dispatch-items.js';
import type { OrderedDispatchItem } from './dispatch-order.js';
import { formatDispatchCardBody } from './dispatch-text.js';

/** A key that runs one osq command, with the hint the card shows for it. */
export interface CardKey {
  /** The single character the reviewer presses. */
  readonly key: string;
  /** The full command the key runs, as the card shows it. */
  readonly label: string;
  /** The command's arguments without the leading `osq`. */
  readonly args: readonly string[];
  /** `reason` when the session must ask for one first, else null. */
  readonly asks: 'reason' | null;
}

/** One item's keyed commands and the commands the reviewer runs by hand. */
export interface CardKeys {
  readonly keys: CardKey[];
  readonly manual: string[];
}

const MAPPED_VERBS = new Set(['approve', 'plan', 'retry', 'reject', 'show']);

/** Split an `osq` command into its arguments without the leading `osq`. */
function argsOf(command: string): string[] {
  return command.split(' ').slice(1);
}

/** The keys one `osq` command maps to, or null when it gets none. */
function keysForCommand(command: string): CardKey[] | null {
  if (!command.startsWith('osq ')) return null;
  const verb = command.split(' ')[1] ?? '';
  if (!MAPPED_VERBS.has(verb)) return null;
  switch (verb) {
    case 'approve':
      return [{ key: 'a', label: command, args: argsOf(command), asks: null }];
    case 'plan':
      return [{ key: 'p', label: command, args: argsOf(command), asks: null }];
    case 'retry':
      return [{ key: 'r', label: command, args: argsOf(command), asks: null }];
    case 'reject': {
      const id = command.split(' ')[2] ?? '';
      return [{ key: 'x', label: command, args: ['reject', id, '--reason'], asks: 'reason' }];
    }
    default:
      return [{ key: 's', label: command, args: argsOf(command), asks: null }];
  }
}

/**
 * Map an item's commands to keys in its command order, returning every command
 * that gets no key among `manual`, unchanged.
 */
export function cardKeys(item: DispatchItem): CardKeys {
  const keys: CardKey[] = [];
  const manual: string[] = [];
  for (const command of item.commands) {
    const mapped = keysForCommand(command);
    if (mapped === null) manual.push(command);
    else keys.push(...mapped);
  }
  return { keys, manual };
}

/** The card screen: header, card body, keys, and the commands to run by hand. */
export function formatCardScreen(
  total: number,
  item: OrderedDispatchItem,
  card: DispatchCard,
  keys: CardKeys,
): string {
  const lines = [`Needs you (${total}):`, ...formatDispatchCardBody(item, card), 'Keys:'];
  for (const key of keys.keys) lines.push(`  ${key.key}  ${key.label}`);
  lines.push('  n  skip', '  q  quit');
  if (keys.manual.length > 0) {
    lines.push('Run yourself:');
    for (const command of keys.manual) lines.push(`  ${command}`);
  }
  return lines.join('\n');
}
