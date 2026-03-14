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
    project: 'RPx5UwFt1XeT',
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
    'QQkKqejpmGyv': 'proctor',
    'SrqWi1I529WC': 'clerk',
    'cK-0HFGW1odT': 'coach',
    'oaQx18xu9GD4': 'curator',
    '6mku-XrMqemu': 'architect',
    '5nF1Veyyrh7H': 'oracle',
    'oPQV0ekG2UyK': 'steward',
    'tpuD7FytFy9d': 'archivist',
    'iHDHg7Gmduwt': 'watcher',
    'Eh1b9d43uuvE': 'engineer',
    'AtLnbHyZf4R5': 'scribe',
    'gD7gjtPAEbTo': 'kybernetes',
    'I0NQsNUXbAwe': 'prober',
    '5Ud2YISIG5mC': 'auditor',
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
  // Teaching
  classTags: {
    class: '9PaZ1ZDaJssP',
  },
  classFields: {
    course: '7F0FVER5hNKv',
  },
  projectFields: {
    status: 'wjzROi94qPvy',
    workstream: '4N-MdeDT4aRR',
  },
  projectStatusOptions: {
    '4opOEQe0mmPs': 'active',
    'JomqzvW7Y2KM': 'next',
    'n8uweUQL_z3o': 'completed',
    '2PmNvc-JfQRJ': 'frozen',
  } as Record<string, string>,
  projectStatusByName: {
    active: '4opOEQe0mmPs',
    next: 'JomqzvW7Y2KM',
    completed: 'n8uweUQL_z3o',
    frozen: '2PmNvc-JfQRJ',
  } as Record<string, string>,
} as const;

// Reverse lookups
export const ASSIGNED_BY_NAME: Record<string, string> = Object.fromEntries(
  Object.entries(TANA.assignedOptions).map(([id, name]) => [name, id])
);
export const PRIORITY_BY_NAME: Record<string, string> = Object.fromEntries(
  Object.entries(TANA.priorityOptions).map(([id, name]) => [name, id])
);
