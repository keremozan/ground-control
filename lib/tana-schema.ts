/**
 * Tana Workspace Schema — Tag, field, and option IDs
 *
 * These map to supertags and fields in the Tana workspace.
 * Update this file when the Tana schema changes (new tags, fields, options).
 * Connection config (URL, token, workspace ID) lives in config.ts.
 */

export const TANA = {
  tags: {
    task: 'tuoCgN5Y6sn9',
    post: '9v5SaKFBsNWR',
    log: 'z_H8Mci5LUzW',
    workstream: 'txLXRNzCMqD_',
    phaseLegacy: 'Nx5_4yu6_TeR',
  },
  fields: {
    status: 'wRd8g4jr7Nqr',
    priority: 'C5ObhnBmyHvm',
    assigned: 'kOYlKvF3ddrT',
    track: 'ssCxaiZRXz9F',
    dueDate: '8EVxOhX0Tnc4',
    wsTrack: '-woZK_e-ulVG',
    wsStatus: 'XRSTZyKUnPmW',
  },
  statusOptions: {
    'TQt9EnvCFbPW': 'backlog',
    'P2iDP-YxupL1': 'in-progress',
    'Gl2L_0HN4oR-': 'done',
  } as Record<string, string>,
  statusByName: {
    backlog: 'TQt9EnvCFbPW',
    'in-progress': 'P2iDP-YxupL1',
    done: 'Gl2L_0HN4oR-',
  } as Record<string, string>,
  priorityOptions: {
    'dybSAOXOLRVn': 'high',
    'AZJRnhlWG_OJ': 'medium',
    'vb2-NBem7wRe': 'low',
  } as Record<string, string>,
  assignedOptions: {
    'NqMuiXnJ8NEg': 'postman',
    '7Xoa3mdCTK1t': 'scholar',
    'SrqWi1I529WC': 'clerk',
    'cK-0HFGW1odT': 'coach',
    '6mku-XrMqemu': 'architect',
    '5nF1Veyyrh7H': 'oracle',
  } as Record<string, string>,
  wsStatusOptions: {
    'DlvHvGV-uj2w': 'pending',
    '_WTVDkF_TAvO': 'active',
    'PHtCHo--2FJg': 'completed',
  } as Record<string, string>,
  wsStatusByName: {
    pending: 'DlvHvGV-uj2w',
    active: '_WTVDkF_TAvO',
    completed: 'PHtCHo--2FJg',
  } as Record<string, string>,
  postFields: {
    source: 'qUIVeSA3TM4Z',
    receiver: 'sRzSwI4y4BB0',
    type: 'tQQjyay-E2xa',
    status: 'iZW91_artYwZ',
    priority: 'OWYvzF6i6rS1',
    context: 'eW99-oKgUuNC',
  },
} as const;

// Reverse lookups
export const ASSIGNED_BY_NAME: Record<string, string> = Object.fromEntries(
  Object.entries(TANA.assignedOptions).map(([id, name]) => [name, id])
);
export const PRIORITY_BY_NAME: Record<string, string> = Object.fromEntries(
  Object.entries(TANA.priorityOptions).map(([id, name]) => [name, id])
);
