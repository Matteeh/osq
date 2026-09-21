// Stable queue facade. Queue parsing, filesystem state projection, and planning
// selection/spend live in cohesive modules; every established queue import path
// and API name keeps resolving through this file.
export type { QueueItem } from './queue-parser.js';
export { getQueuePath, parseQueue, readQueue } from './queue-parser.js';
export type {
  QueueActiveFailure,
  QueueAssociation,
  QueueAssociationGroups,
  QueueItemState,
  QueueProjection,
  QueueRow,
  QueueStateSnapshot,
} from './queue-state.js';
export {
  findActiveQueueFailures,
  formatQueue,
  projectQueue,
  readQueueState,
  scanQueueAssociations,
} from './queue-state.js';
export type {
  LandedDependency,
  QueueBudgetEvaluation,
  QueuePlanPreparation,
  QueuePlanSelection,
  QueuePlanningUsage,
} from './queue-planning.js';
export {
  evaluateQueueBudget,
  prepareQueuePlan,
  readQueuePlanningUsage,
} from './queue-planning.js';
