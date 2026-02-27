import path from 'path';

const HOME = process.env.HOME || '';

const config = {
  userName: "Your Name",

  tana: {
    workspaceId: "YOUR_WORKSPACE_ID",
    mcpUrl: "http://127.0.0.1:8262/mcp",
    mcpToken: "YOUR_MCP_TOKEN",
  },

  gmail: {
    accounts: ["personal"] as string[],
    credentialPaths: {
      personal: path.join(HOME, '.gmail-mcp', 'credentials.json'),
    } as Record<string, string>,
  },

  calendar: {
    tokensPath: path.join(HOME, '.config', 'google-calendar-mcp', 'tokens.json'),
  },

  scheduler: {
    skipTrackPattern: "",
    taskCharacters: ["scholar", "clerk", "architect"] as string[],
    jobs: [
      // ── Postman: scan all sources, classify, route ──
      {
        id: 'postman-morning',
        charName: 'postman',
        displayName: 'Postman',
        seedPrompt: 'Run a full scan-process-deliver cycle. Mode: full.',
        description: 'Scan all sources, classify, route to characters, deliver drafts',
        cron: '08:00 daily',
        label: 'Morning scan',
        mode: 'full',
        enabled: true,
      },
      {
        id: 'postman-afternoon',
        charName: 'postman',
        displayName: 'Postman',
        seedPrompt: 'Run a full scan-process-deliver cycle. Mode: light.',
        description: 'Quick scan of primary sources only',
        cron: '13:00 daily',
        label: 'Afternoon scan',
        mode: 'light',
        enabled: true,
      },
      {
        id: 'postman-evening',
        charName: 'postman',
        displayName: 'Postman',
        seedPrompt: 'Run a full scan-process-deliver cycle. Mode: full.',
        description: 'End-of-day scan of all sources',
        cron: '18:00 daily',
        label: 'Evening scan',
        mode: 'full',
        enabled: true,
      },
      // ── Evening tasks: spawn characters with pending work ──
      {
        id: 'evening-tasks',
        charName: 'system',
        displayName: 'Crew',
        seedPrompt: '',
        description: 'Spawn characters with pending tasks',
        cron: '19:00 daily',
        label: 'Evening tasks',
        type: 'process-tasks' as const,
        enabled: true,
      },
      // ── Self-evolving: watcher + maintenance ──
      {
        id: 'architect-watcher',
        charName: 'architect',
        displayName: 'Architect',
        seedPrompt: 'Run architect-watcher skill. Read tiny-log.jsonl for errors since last review. Check for failed routes, missing rules, inactive characters, memory overflow. Auto-fix what you can — edit skills, update memory, fix routing. If a pattern repeats 2+ times, fix the root cause. If beyond scope, create a Tana task assigned to architect. After changes: append to CHANGELOG.md and update docs/REFERENCE.md. Truncate processed log entries.',
        description: 'Review system logs, fix errors, write memory lessons',
        cron: '22:00 daily',
        label: 'Nightly watcher',
        enabled: true,
      },
      {
        id: 'architect-maintenance',
        charName: 'architect',
        displayName: 'Architect',
        seedPrompt: 'Run architect-system skill. Check memory files for size and staleness, verify skill references, check knowledge links, review routing consistency. Run tsc --noEmit for type safety. Fix issues or escalate to Tana task.',
        description: 'System maintenance — memory hygiene, skill verification, routing consistency',
        cron: 'Tue,Fri 14:00',
        label: 'System maintenance',
        enabled: true,
      },
      // ── Reviews ──
      {
        id: 'coach-weekly',
        charName: 'coach',
        displayName: 'Coach',
        seedPrompt: "I'd like to do a weekly review.",
        description: 'Personal weekly review — wellbeing, priorities, work/life balance',
        cron: 'Friday 16:00',
        label: 'Weekly review',
        enabled: true,
      },
      {
        id: 'oracle-weekly',
        charName: 'oracle',
        displayName: 'Oracle',
        seedPrompt: 'I need strategic advice on something important.',
        description: 'Strategic review — cross-domain patterns, risks, recommendations',
        cron: 'Sunday 20:00',
        label: 'Weekly advisory',
        enabled: true,
      },
      // ── Self-learning ──
      {
        id: 'weekly-contact-patterns',
        charName: 'postman',
        displayName: 'Postman',
        seedPrompt: 'Search Gmail for conversations from the past 7 days. For each frequent contact, update the Style field in ~/.claude/shared/contacts.md with: language, tone, response speed. Add new contacts if missing. Keep file under 100 lines.',
        description: 'Auto-learn communication patterns from email history',
        cron: 'Sunday 21:00',
        label: 'Contact patterns',
        enabled: true,
      },
      {
        id: 'weekly-calendar-intel',
        charName: 'coach',
        displayName: 'Coach',
        seedPrompt: 'Read Google Calendar events for the past 2 weeks. Identify meeting density per day, free blocks, recurring patterns. Update ~/.claude/shared/work-patterns.md Schedule Preferences section. Keep factual, max 10 lines.',
        description: 'Learn schedule preferences from calendar data',
        cron: 'Sunday 20:00',
        label: 'Calendar intel',
        enabled: true,
      },
    ] as {
      id: string;
      charName: string;
      displayName: string;
      seedPrompt: string;
      description: string;
      cron: string;
      label: string;
      mode?: string;
      type?: 'single' | 'process-tasks';
      enabled: boolean;
    }[],
  },

  sources: [
    { label: "Gmail", icon: "Mail", color: "#4f46e5", description: "Gmail inbox" },
    { label: "Tana", icon: "Tana", color: "#f59e0b", description: "Tana inbox nodes" },
  ] as { label: string; icon: string; color: string; description?: string }[],

  outputs: [
    { label: "Gmail Draft", icon: "Mail", color: "#4f46e5" },
    { label: "Tana", icon: "Tana", color: "#f59e0b" },
    { label: "Calendar", icon: "CalendarDays", color: "#0891b2" },
  ] as { label: string; icon: string; color: string }[],

  // Track name → character color mapping (regex patterns, case-insensitive)
  // Used by TasksWidget to color-code tasks by workstream
  trackColorPatterns: {
    scholar:   "research|writing|thesis",
    architect: "system|automation|dashboard|code",
    clerk:     "admin|office|visa|travel",
  } as Record<string, string>,

  // Email classification patterns (regex, case-insensitive)
  // Matches against sender + subject to color-code inbox items
  emailColorPatterns: {
    "#7c3aed": "thesis|research|paper|journal|conference|workshop",
    "#b45309": "meeting|faculty|admin|office|dean",
  } as Record<string, string>,

  // Gmail label → color/bg overrides (label names must be lowercase)
  emailLabelColors: {} as Record<string, { color: string; bg: string }>,
};

export default config;
export type UserConfig = typeof config;
