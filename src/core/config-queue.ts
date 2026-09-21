/**
 * Queue planning ceilings. Both values are required together when the block is
 * present; no default session or monetary limit is invented.
 */
export interface QueueConfig {
  readonly maxPlanningSessions: number;
  readonly maxPlanningCost: number;
}

/**
 * Validate an optional `queue` block. When present it is atomic: both ceilings
 * must be finite non-negative numbers. Absence stays valid so repositories that
 * never run a non-print next-item plan need no queue settings.
 */
export function validateQueueConfig(queue: unknown): QueueConfig {
  if (typeof queue !== 'object' || queue === null || Array.isArray(queue)) {
    throw new Error('queue configuration must be an object with the two planning ceilings');
  }
  const record = queue as Record<string, unknown>;
  if (record.maxPlanningSessions === undefined || record.maxPlanningCost === undefined) {
    throw new Error('queue.maxPlanningSessions and queue.maxPlanningCost are both required');
  }
  const sessions = record.maxPlanningSessions;
  const cost = record.maxPlanningCost;
  if (typeof sessions !== 'number' || !Number.isFinite(sessions) || sessions < 0) {
    throw new Error('queue.maxPlanningSessions must be a finite non-negative number');
  }
  if (typeof cost !== 'number' || !Number.isFinite(cost) || cost < 0) {
    throw new Error('queue.maxPlanningCost must be a finite non-negative number');
  }
  return { maxPlanningSessions: sessions, maxPlanningCost: cost };
}
