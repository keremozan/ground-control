// Barrel re-export — external code uses `import { ... } from "@/lib/tana"`

export { mcpCall } from './client';

export { excludeTask, getExcludedIds } from './cache';
export type { ExclusionEntry, ExclusionMap } from './cache';

export {
  getTanaTasks,
  getTanaPhases,
  getTanaProjects,
  getClassNodes,
  toggleClassItem,
  checkRemainingPrepItems,
} from './queries';
export type {
  TanaTask,
  TanaPhase,
  TanaProject,
  ChecklistItem,
  ClassPrepNode,
} from './queries';

export {
  createWorkstream,
  createTaskInWorkstream,
  createPost,
  createTask,
  setTaskPriority,
  setTaskInProgress,
  markTaskDone,
  openNode,
  trashTask,
  archiveTask,
  readTanaNode,
  sendToTanaToday,
} from './mutations';

export {
  characterForTrack,
  resolveCharacter,
  clearRoutingCache,
} from './routing';
