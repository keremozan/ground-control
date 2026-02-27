/** MCP server name → icon name (resolvable via resolveIcon from icon-map.ts) */
export const MCP_SERVER_ICON_MAP: Record<string, string> = {
  'gmail':            'Mail',
  'gmail-school':     'Mail',
  'google-calendar':  'Calendar',
  'tana-local':       'Tana',
  'supertag':         'Tana',
  'gdrive-school':    'HardDrive',
  'gdrive-personal':  'HardDrive',
  'whatsapp':         'MessageCircle',
  'playwright':       'Globe',
  'web-traversal':    'Globe',
};

/** Built-in Claude tool name → { displayName, iconName } */
const BUILTIN_TOOL_MAP: Record<string, { displayName: string; iconName: string }> = {
  'Read':         { displayName: 'Reading file',      iconName: 'Eye' },
  'Write':        { displayName: 'Writing file',      iconName: 'PenLine' },
  'Edit':         { displayName: 'Editing file',      iconName: 'PenLine' },
  'Bash':         { displayName: 'Running command',   iconName: 'Monitor' },
  'Glob':         { displayName: 'Finding files',     iconName: 'Search' },
  'Grep':         { displayName: 'Searching code',    iconName: 'Search' },
  'WebFetch':     { displayName: 'Fetching web page', iconName: 'Globe' },
  'WebSearch':    { displayName: 'Searching web',     iconName: 'Globe' },
  'Task':         { displayName: 'Running subtask',   iconName: 'Play' },
  'TodoRead':     { displayName: 'Reading tasks',     iconName: 'ListChecks' },
  'TodoWrite':    { displayName: 'Writing tasks',     iconName: 'ListChecks' },
};

export type ToolInfo = {
  server?: string;
  action: string;
  displayName: string;
  iconName: string;
};

/** Parse any tool name → { displayName, iconName }. Works for both MCP tools and built-in tools. */
export function parseToolName(tool: string): ToolInfo {
  // MCP tool: mcp__server__action
  const match = tool.match(/^mcp__([^_]+(?:-[^_]+)*)__(.+)$/);
  if (match) {
    const [, server, action] = match;
    const displayName = action.replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase());
    const iconName = MCP_SERVER_ICON_MAP[server] || 'Wrench';
    return { server, action, displayName, iconName };
  }

  // Built-in tool
  const builtin = BUILTIN_TOOL_MAP[tool];
  if (builtin) return { action: tool, ...builtin };

  // Unknown tool — show as-is
  return { action: tool, displayName: tool, iconName: 'Wrench' };
}

/** @deprecated Use parseToolName instead */
export function parseMcpToolName(tool: string): ToolInfo | null {
  return parseToolName(tool);
}
