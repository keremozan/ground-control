/**
 * Ground Control — Central Configuration
 *
 * Reads user-specific values from ground-control.config.ts (git-ignored).
 * Copy ground-control.config.example.ts to get started.
 */

import path from 'path';
import userConfig from '../ground-control.config';

// ── Identity ────────────────────────────────────
export const USER_NAME = userConfig.userName;

// ── Paths ────────────────────────────────────────

export const HOME = process.env.HOME || '';

/** Where claude CLI lives */
export const CLAUDE_BIN = path.join(HOME, '.local', 'bin', 'claude');

/** MCP server config for spawned characters */
export const MCP_TASKS_CONFIG = path.join(process.cwd(), 'mcp-tasks.json');

/** Character, skill, and knowledge directories */
export const CHARACTERS_DIR = path.join(HOME, '.claude', 'characters');
export const SKILLS_DIR = path.join(HOME, '.claude', 'skills');
export const SHARED_DIR = path.join(HOME, '.claude', 'shared');

// ── Tana MCP ─────────────────────────────────────

export const TANA_MCP_URL = userConfig.tana.mcpUrl;
export const TANA_MCP_TOKEN = userConfig.tana.mcpToken;
export const TANA_WORKSPACE_ID = userConfig.tana.workspaceId;
export const TANA_INBOX_ID = `${TANA_WORKSPACE_ID}_CAPTURE_INBOX`;

// ── Gmail ────────────────────────────────────────

export type GmailAccount = string;
export const GMAIL_ACCOUNTS = userConfig.gmail.accounts;
export const GMAIL_CREDENTIAL_PATHS = userConfig.gmail.credentialPaths;
export const OAUTH_KEYS_PATH = path.join(HOME, '.gmail-mcp', 'gcp-oauth.keys.json');

// ── Google Calendar ──────────────────────────────

export const CAL_TOKENS_PATH = userConfig.calendar.tokensPath;

// ── Scheduler ────────────────────────────────────

export const JOB_RESULTS_PATH = path.join(process.cwd(), 'data', 'job-results.json');
export const MAX_JOB_RESULTS = 100;

/** Characters that process tasks in automated cycles */
export const TASK_CHARACTERS = userConfig.scheduler.taskCharacters;

/** Track patterns to skip in automated cycles */
export const SKIP_TRACK_PATTERN: RegExp | null = userConfig.scheduler.skipTrackPattern
  ? new RegExp(userConfig.scheduler.skipTrackPattern, 'i')
  : null;

// ── Pipeline (for dashboard) ─────────────────────

export const PIPELINE_SOURCES = userConfig.sources;
export const PIPELINE_OUTPUTS = userConfig.outputs;

// ── UI Patterns (configurable per user) ──────────

/** Track name → character color mapping (regex patterns) */
export const TRACK_COLOR_PATTERNS: Record<string, string> = userConfig.trackColorPatterns || {};

/** Email classification patterns → hex color */
export const EMAIL_COLOR_PATTERNS: Record<string, string> = userConfig.emailColorPatterns || {};

/** Gmail label → color overrides */
export const EMAIL_LABEL_COLORS: Record<string, { color: string; bg: string }> = userConfig.emailLabelColors || {};

/** Calendar event title → character color mapping (regex patterns) */
export const CALENDAR_COLOR_PATTERNS: Record<string, string> = (userConfig as Record<string, unknown>).calendarColorPatterns as Record<string, string> || {};
