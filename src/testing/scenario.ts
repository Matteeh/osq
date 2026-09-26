import test from 'node:test';
import type { ScenarioOutcome } from '../core/spec/delta.js';
import { lookupScenario } from '../core/trace/scenario-lookup.js';

/**
 * The opt-in scenario test helper. `scenario` registers one `node:test` test
 * that looks a scenario up in the effective spec and proves it: the covered
 * function must run through `run`, every outcome must be asserted by a `then`
 * or `each` that completed after a call settled, and no check may fail.
 */

/** One table row, keyed by the table's trimmed header cells. */
export type ScenarioRow = Record<string, string>;

/** A check passed to `then`. */
export type ScenarioThenCheck = () => void | Promise<void>;

/** A check passed to `each`, called once per table row. */
export type ScenarioEachCheck = (row: ScenarioRow) => void | Promise<void>;

/** The helpers `scenario` passes to a test body. */
export interface ScenarioBody<Args extends unknown[], Result> {
  run: (...args: Args) => Result;
  then: (outcome: string, check: ScenarioThenCheck) => Promise<void>;
  each: (outcome: string, check: ScenarioEachCheck) => Promise<void>;
}

/** The covered function a scenario test proves. */
export interface ScenarioOptions<Args extends unknown[], Result> {
  covers: (...args: Args) => Result;
}

/** Per-test bookkeeping for one scenario run. */
interface ScenarioState {
  started: number;
  settled: number;
  readonly asserted: Set<string>;
  failure: Error | undefined;
  readonly pending: Promise<void>[];
}

function toError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value));
}

function isThenable(value: unknown): value is PromiseLike<unknown> {
  if (value === null) return false;
  const kind = typeof value;
  if (kind !== 'object' && kind !== 'function') return false;
  return typeof (value as { then?: unknown }).then === 'function';
}

function outcomeOrThrow(outcomes: readonly ScenarioOutcome[], text: string): ScenarioOutcome {
  const found = outcomes.find((outcome) => outcome.text === text);
  if (found === undefined) throw new Error(`"${text}" is not a THEN of this scenario`);
  return found;
}

/** A table row's columns in header order, for one failed `each` check. */
function rowFailure(text: string, row: ScenarioRow, cause: unknown): Error {
  const fields = Object.entries(row)
    .map(([column, value]) => `${column} ${value}`)
    .join(', ');
  return new Error(`THEN ${text}: failed at ${fields}`, { cause });
}

/** Record an assertion, or fail because no call had settled in time. */
function complete(state: ScenarioState, fn: string, outcome: ScenarioOutcome): void {
  if (state.started === 0) throw new Error(`THEN ${outcome.text}: checked before ${fn} ran`);
  if (state.settled === 0) throw new Error(`THEN ${outcome.text}: checked before ${fn} settled`);
  state.asserted.add(outcome.text);
}

/** Keep a check's promise from rejecting unobserved; its error fails the test. */
function track(state: ScenarioState, promise: Promise<void>): Promise<void> {
  const guarded = promise.catch((error: unknown) => {
    if (state.failure === undefined) state.failure = toError(error);
  });
  state.pending.push(guarded);
  return guarded;
}

function thenCheck(
  state: ScenarioState,
  outcomes: readonly ScenarioOutcome[],
  fn: string,
  text: string,
  check: ScenarioThenCheck,
): Promise<void> {
  const outcome = outcomeOrThrow(outcomes, text);
  if (outcome.rows !== undefined) {
    throw new Error(`THEN ${text}: has a table, so check it with each`);
  }
  let result: unknown;
  try {
    result = check();
  } catch (cause) {
    throw new Error(`THEN ${text}: failed`, { cause });
  }
  if (!isThenable(result)) {
    complete(state, fn, outcome);
    return Promise.resolve();
  }
  return track(
    state,
    Promise.resolve(result).then(
      () => complete(state, fn, outcome),
      (cause: unknown) => {
        throw new Error(`THEN ${text}: failed`, { cause });
      },
    ),
  );
}

function eachCheck(
  state: ScenarioState,
  outcomes: readonly ScenarioOutcome[],
  fn: string,
  text: string,
  check: ScenarioEachCheck,
): Promise<void> {
  const outcome = outcomeOrThrow(outcomes, text);
  if (outcome.rows === undefined) throw new Error(`THEN ${text}: has no table`);
  const work = (async () => {
    for (const row of outcome.rows ?? []) {
      let result: unknown;
      try {
        result = check(row);
      } catch (cause) {
        throw rowFailure(text, row, cause);
      }
      if (isThenable(result)) {
        try {
          await result;
        } catch (cause) {
          throw rowFailure(text, row, cause);
        }
      }
    }
    complete(state, fn, outcome);
  })();
  return track(state, work);
}

async function drain(state: ScenarioState): Promise<void> {
  while (state.pending.length > 0) {
    const pending = state.pending.splice(0, state.pending.length);
    await Promise.all(pending);
  }
}

function finish(state: ScenarioState, fn: string, outcomes: readonly ScenarioOutcome[]): void {
  if (state.started === 0) throw new Error(`${fn} never ran`);
  const missing = outcomes.filter((outcome) => !state.asserted.has(outcome.text));
  if (missing.length > 0) {
    throw new Error(`No assertion for: ${missing.map((outcome) => outcome.text).join('; ')}`);
  }
}

/**
 * Register one `node:test` test titled `Scenario: <name>` that looks the
 * scenario up with `process.cwd()` and `process.env`, then calls `body` with
 * `run`, `then`, and `each` and awaits what it returns.
 */
export function scenario<Args extends unknown[], Result>(
  capability: string,
  name: string,
  options: ScenarioOptions<Args, Result>,
  body: (helpers: ScenarioBody<Args, Result>) => void | Promise<void>,
): void {
  test(`Scenario: ${name}`, async () => {
    const outcomes = lookupScenario(capability, name, process.cwd(), process.env);
    const state: ScenarioState = {
      started: 0,
      settled: 0,
      asserted: new Set<string>(),
      failure: undefined,
      pending: [],
    };
    const fn = options.covers.name === '' ? 'the covered function' : options.covers.name;
    const run = (...args: Args): Result => {
      state.started += 1;
      const result = options.covers(...args);
      if (isThenable(result)) {
        const settle = () => {
          state.settled += 1;
        };
        Promise.resolve(result).then(settle, settle);
      } else {
        state.settled += 1;
      }
      return result;
    };
    const helpers: ScenarioBody<Args, Result> = {
      run,
      // biome-ignore lint/suspicious/noThenProperty: the helper API names this method then
      then: (outcome, check) => thenCheck(state, outcomes, fn, outcome, check),
      each: (outcome, check) => eachCheck(state, outcomes, fn, outcome, check),
    };

    let bodyError: unknown;
    let threw = false;
    try {
      await body(helpers);
    } catch (error) {
      threw = true;
      bodyError = error;
    }
    await drain(state);
    if (threw) throw bodyError;
    if (state.failure !== undefined) throw state.failure;
    finish(state, fn, outcomes);
  });
}
