/**
 * Human attention inbox settings. `defineConfig` validates and defaults this
 * block here, so a consumer never sees a partial inbox configuration.
 */
export interface InboxConfig {
  /** `default`, `bell`, `off`, or a sound file path relative to the project root. */
  readonly sound: string;
  /** Local-time quiet window `HH:MM-HH:MM`, or `null` when sound always plays. */
  readonly quietHours: string | null;
  /** Minimum seconds between two sounds; the first always plays. */
  readonly soundWindowSeconds: number;
  /** Debounce window, in milliseconds, for inbox change events. */
  readonly eventDebounceMs: number;
  /** Safety-net derivation interval, in seconds. */
  readonly pollSeconds: number;
}

/** A quiet window as minutes after local midnight. */
export interface QuietHours {
  readonly start: number;
  readonly end: number;
}

export const DEFAULT_INBOX_CONFIG: InboxConfig = {
  sound: 'default',
  quietHours: null,
  soundWindowSeconds: 5,
  eventDebounceMs: 200,
  pollSeconds: 30,
};

const QUIET_HOURS_PATTERN = /^(\d{2}):(\d{2})-(\d{2}):(\d{2})$/;

const QUIET_HOURS_ERROR = 'inbox.quietHours must be HH:MM-HH:MM with two different times';

/**
 * Parse `HH:MM-HH:MM` into minutes after local midnight. Each hour is `00`
 * to `23`, each minute `00` to `59`, and the two times must differ.
 */
export function parseQuietHours(value: string): QuietHours {
  const match = QUIET_HOURS_PATTERN.exec(value);
  if (match === null) throw new Error(QUIET_HOURS_ERROR);
  const start = clockMinutes(match[1] ?? '', match[2] ?? '');
  const end = clockMinutes(match[3] ?? '', match[4] ?? '');
  if (start === null || end === null || start === end) throw new Error(QUIET_HOURS_ERROR);
  return { start, end };
}

/** `HH` and `MM` as minutes after midnight, or null when out of range. */
function clockMinutes(hour: string, minute: string): number | null {
  const h = Number(hour);
  const m = Number(minute);
  if (h > 23 || m > 59) return null;
  return h * 60 + m;
}

/**
 * Validate an optional `inbox` block over the defaults. A partial block keeps
 * each missing default; an empty sound, a malformed quiet window, and
 * non-finite or out-of-range numbers are rejected with the key named.
 */
export function validateInboxConfig(inbox: unknown): InboxConfig {
  if (inbox === undefined) return DEFAULT_INBOX_CONFIG;
  if (typeof inbox !== 'object' || inbox === null || Array.isArray(inbox)) {
    throw new Error('inbox configuration must be an object');
  }
  const record = inbox as Record<string, unknown>;
  const { sound, quietHours } = soundFields(record);
  const soundWindowSeconds = numberField(
    record,
    'soundWindowSeconds',
    DEFAULT_INBOX_CONFIG.soundWindowSeconds,
    (value) => value >= 0,
    'inbox.soundWindowSeconds must be a finite non-negative number',
  );
  const eventDebounceMs = numberField(
    record,
    'eventDebounceMs',
    DEFAULT_INBOX_CONFIG.eventDebounceMs,
    (value) => value >= 0,
    'inbox.eventDebounceMs must be a finite non-negative number',
  );
  const pollSeconds = numberField(
    record,
    'pollSeconds',
    DEFAULT_INBOX_CONFIG.pollSeconds,
    (value) => value > 0,
    'inbox.pollSeconds must be a finite number greater than zero',
  );
  return { sound, quietHours, soundWindowSeconds, eventDebounceMs, pollSeconds };
}

/** The validated `sound` and `quietHours` pair from an inbox record. */
function soundFields(record: Record<string, unknown>): {
  sound: string;
  quietHours: string | null;
} {
  const sound = record.sound === undefined ? DEFAULT_INBOX_CONFIG.sound : record.sound;
  if (typeof sound !== 'string' || sound.length === 0) {
    throw new Error('inbox.sound must be "default", "bell", "off", or a non-empty path');
  }
  const rawQuiet = record.quietHours;
  let quietHours: string | null = DEFAULT_INBOX_CONFIG.quietHours;
  if (rawQuiet !== undefined && rawQuiet !== null) {
    if (typeof rawQuiet !== 'string') throw new Error(QUIET_HOURS_ERROR);
    parseQuietHours(rawQuiet);
    quietHours = rawQuiet;
  }
  return { sound, quietHours };
}

/** A present numeric field validated by `valid`, or its default. */
function numberField(
  record: Record<string, unknown>,
  field: string,
  fallback: number,
  valid: (value: number) => boolean,
  message: string,
): number {
  const value = record[field] === undefined ? fallback : record[field];
  if (typeof value !== 'number' || !Number.isFinite(value) || !valid(value)) {
    throw new Error(message);
  }
  return value;
}
