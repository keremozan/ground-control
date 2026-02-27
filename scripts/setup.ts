#!/usr/bin/env npx tsx
/**
 * Ground Control — Interactive Setup
 *
 * Walks a new user through configuration:
 * 1. User identity
 * 2. Tana MCP connection
 * 3. Optional MCP servers (Gmail, Calendar)
 * 4. Config file generation
 * 5. Character installation
 */

import * as readline from 'readline';
import * as fs from 'fs';
import * as path from 'path';

const HOME = process.env.HOME || '';
const PROJECT_DIR = path.resolve(__dirname, '..');
const CHAR_BASE = path.join(HOME, '.claude', 'characters');
const EXAMPLES_DIR = path.join(PROJECT_DIR, 'examples', 'characters');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

function ask(question: string): Promise<string> {
  return new Promise(resolve => rl.question(question, resolve));
}

function heading(text: string) {
  console.log(`\n\x1b[1m${text}\x1b[0m`);
}

function info(text: string) {
  console.log(`  \x1b[90m${text}\x1b[0m`);
}

function success(text: string) {
  console.log(`  \x1b[32m✓\x1b[0m ${text}`);
}

function warn(text: string) {
  console.log(`  \x1b[33m!\x1b[0m ${text}`);
}

async function main() {
  console.log('\n\x1b[1mGround Control — Setup\x1b[0m');
  console.log('─'.repeat(40));

  // 1. User identity
  heading('1. Identity');
  const userName = (await ask('  Your name: ')).trim() || 'User';

  // 2. Tana MCP
  heading('2. Tana MCP (required)');
  info('Ground Control requires Tana as the PKM layer.');
  info('Setup guide: https://tana.inc/articles/get-started-with-tana-s-local-mcp');
  info('You need a tana-local MCP server running.');
  const tanaUrl = (await ask('  Tana MCP URL [http://127.0.0.1:8262/mcp]: ')).trim() || 'http://127.0.0.1:8262/mcp';
  const tanaToken = (await ask('  Tana MCP token: ')).trim();
  const tanaWorkspace = (await ask('  Tana workspace ID: ')).trim();

  if (!tanaToken || !tanaWorkspace) {
    warn('Tana token or workspace ID missing. You can edit ground-control.config.ts later.');
  }

  // 3. Optional MCP servers
  heading('3. Optional MCP servers');
  info('These are optional. Answer y/n for each.');
  info('Gmail MCP:    https://github.com/anthropics/anthropic-quickstarts/tree/main/gmail-mcp-server');
  info('Calendar MCP: https://github.com/anthropics/anthropic-quickstarts/tree/main/google-calendar-mcp-server');

  const hasGmail = (await ask('  Gmail MCP? [y/N]: ')).trim().toLowerCase() === 'y';
  let gmailAccounts: string[] = [];
  const gmailPaths: Record<string, string> = {};
  if (hasGmail) {
    const accts = (await ask('  Gmail account names (comma-separated, e.g. personal,school): ')).trim();
    gmailAccounts = accts.split(',').map(s => s.trim()).filter(Boolean);
    for (const acct of gmailAccounts) {
      const defaultPath = acct === 'personal'
        ? path.join(HOME, '.gmail-mcp', 'credentials.json')
        : path.join(HOME, `.gmail-mcp-${acct}`, 'credentials.json');
      const p = (await ask(`  Credentials path for "${acct}" [${defaultPath}]: `)).trim() || defaultPath;
      gmailPaths[acct] = p;
    }
  }

  const hasCalendar = (await ask('  Google Calendar MCP? [y/N]: ')).trim().toLowerCase() === 'y';

  // 4. Generate config file
  heading('4. Generating config');

  const gmailSection = hasGmail ? `
  gmail: {
    accounts: ${JSON.stringify(gmailAccounts)} as string[],
    credentialPaths: {
${gmailAccounts.map(a => `      ${JSON.stringify(a)}: path.join(HOME, ${JSON.stringify(path.relative(HOME, gmailPaths[a]).split(path.sep).slice(0, -1).map(s => `'${s}'`).join(', '))}${gmailPaths[a].endsWith('credentials.json') ? ", 'credentials.json'" : ''}),`).join('\n')}
    } as Record<string, string>,
  },` : `
  gmail: {
    accounts: [] as string[],
    credentialPaths: {} as Record<string, string>,
  },`;

  const calendarSection = hasCalendar
    ? `\n  calendar: {\n    tokensPath: path.join(HOME, '.config', 'google-calendar-mcp', 'tokens.json'),\n  },`
    : `\n  calendar: {\n    tokensPath: '',\n  },`;

  // Build sources from configured services
  const sources: { label: string; icon: string; color: string; description?: string }[] = [
    { label: 'Tana', icon: 'Tana', color: '#f59e0b', description: 'Tana inbox nodes' },
  ];
  if (hasGmail) {
    for (const acct of gmailAccounts) {
      sources.push({ label: `Gmail (${acct.charAt(0).toUpperCase()})`, icon: 'Mail', color: '#4f46e5', description: `${acct} Gmail` });
    }
  }

  const outputs: { label: string; icon: string; color: string }[] = [
    { label: 'Tana', icon: 'Tana', color: '#f59e0b' },
  ];
  if (hasGmail) {
    outputs.push({ label: 'Gmail Draft', icon: 'Mail', color: '#4f46e5' });
  }
  if (hasCalendar) {
    outputs.push({ label: 'Calendar', icon: 'CalendarDays', color: '#0891b2' });
  }

  const configContent = `import path from 'path';

const HOME = process.env.HOME || '';

const config = {
  userName: ${JSON.stringify(userName)},

  tana: {
    workspaceId: ${JSON.stringify(tanaWorkspace)},
    mcpUrl: ${JSON.stringify(tanaUrl)},
    mcpToken: ${JSON.stringify(tanaToken)},
  },
${gmailSection}
${calendarSection}

  scheduler: {
    skipTrackPattern: "",
    taskCharacters: [] as string[],
    jobs: [
      {
        id: 'postman-morning',
        charName: 'postman',
        displayName: 'Postman',
        seedPrompt: 'Run a full scan-process-deliver cycle.',
        description: 'Scan all sources, classify, route to characters, deliver drafts',
        cron: '08:00 daily',
        label: 'Morning scan',
        enabled: true,
      },
      {
        id: 'postman-evening',
        charName: 'postman',
        displayName: 'Postman',
        seedPrompt: 'Run a full scan-process-deliver cycle.',
        description: 'Evening scan of all sources',
        cron: '18:00 daily',
        label: 'Evening scan',
        enabled: true,
      },
      {
        id: 'architect-watcher',
        charName: 'architect',
        displayName: 'Architect',
        seedPrompt: 'Review system logs for errors. Fix what you can, report what needs attention.',
        description: 'Review system logs, fix errors, write memory lessons',
        cron: '22:00 daily',
        label: 'Nightly watcher',
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

  sources: ${JSON.stringify(sources, null, 4).replace(/\n/g, '\n  ')} as { label: string; icon: string; color: string; description?: string }[],

  outputs: ${JSON.stringify(outputs, null, 4).replace(/\n/g, '\n  ')} as { label: string; icon: string; color: string }[],
};

export default config;
export type UserConfig = typeof config;
`;

  const configPath = path.join(PROJECT_DIR, 'ground-control.config.ts');
  if (fs.existsSync(configPath)) {
    const overwrite = (await ask('  ground-control.config.ts already exists. Overwrite? [y/N]: ')).trim().toLowerCase() === 'y';
    if (!overwrite) {
      warn('Skipping config file generation.');
    } else {
      fs.writeFileSync(configPath, configContent);
      success('ground-control.config.ts written');
    }
  } else {
    fs.writeFileSync(configPath, configContent);
    success('ground-control.config.ts written');
  }

  // 5. Generate mcp-tasks.json
  const mcpPath = path.join(PROJECT_DIR, 'mcp-tasks.json');
  if (!fs.existsSync(mcpPath)) {
    const mcpConfig: Record<string, unknown> = {
      mcpServers: {
        'tana-local': {
          type: 'http',
          url: tanaUrl,
          headers: { Authorization: `Bearer ${tanaToken}` },
        },
      },
    };
    fs.writeFileSync(mcpPath, JSON.stringify(mcpConfig, null, 2) + '\n');
    success('mcp-tasks.json written');
  } else {
    info('mcp-tasks.json already exists, skipping.');
  }

  // 6. Install characters
  heading('5. Character installation');

  // Create directories
  for (const tier of ['core', 'meta', 'stationed']) {
    const dir = path.join(CHAR_BASE, tier);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      success(`Created ${dir}`);
    }
  }

  // Copy core characters (required)
  for (const core of ['postman', 'architect']) {
    const src = path.join(EXAMPLES_DIR, `${core}.json`);
    const tierDir = core === 'architect' ? 'meta' : 'core';
    const dest = path.join(CHAR_BASE, tierDir, `${core}.json`);
    if (!fs.existsSync(dest)) {
      fs.copyFileSync(src, dest);
      success(`Installed ${core} (required) → ${tierDir}/`);
    } else {
      info(`${core}.json already exists, skipping.`);
    }
  }

  // List optional examples
  const examples = ['postman', 'scholar', 'clerk', 'coach', 'architect', 'oracle'];
  console.log('\n  Available example characters:');
  for (const ex of examples) {
    const exPath = path.join(EXAMPLES_DIR, `${ex}.json`);
    if (fs.existsSync(exPath)) {
      const data = JSON.parse(fs.readFileSync(exPath, 'utf-8'));
      console.log(`    ${ex.padEnd(12)} ${data.domain || ''} — ${data.actions?.map((a: { label: string }) => a.label).join(', ') || 'no actions'}`);
    }
  }

  const install = (await ask('\n  Install which? (comma-separated, or "all", or "none") [none]: ')).trim().toLowerCase();
  const toInstall = install === 'all' ? examples : install === 'none' || !install ? [] : install.split(',').map(s => s.trim());

  for (const name of toInstall) {
    if (!examples.includes(name)) {
      warn(`Unknown character: ${name}`);
      continue;
    }
    const src = path.join(EXAMPLES_DIR, `${name}.json`);
    const tierDir = name === 'oracle' ? 'meta' : 'core';
    const dest = path.join(CHAR_BASE, tierDir, `${name}.json`);
    if (!fs.existsSync(dest)) {
      fs.copyFileSync(src, dest);
      success(`Installed ${name} → ${tierDir}/`);
    } else {
      info(`${name}.json already exists, skipping.`);
    }
  }

  // Create empty shared knowledge files if they don't exist
  const sharedDir = path.join(HOME, '.claude', 'shared');
  if (!fs.existsSync(sharedDir)) {
    fs.mkdirSync(sharedDir, { recursive: true });
    success(`Created ${sharedDir}`);
  }
  const identityPath = path.join(sharedDir, 'identity.md');
  if (!fs.existsSync(identityPath)) {
    fs.writeFileSync(identityPath, `# Identity\n\nName: ${userName}\n`);
    success('Created identity.md');
  }

  // Done
  heading('Setup complete!');
  console.log(`
  Next steps:
    1. npm run dev          — start the dashboard
    2. Open localhost:3000   — view your system
    3. Edit characters in ~/.claude/characters/ to customize
    4. Edit ground-control.config.ts for scheduler jobs and pipeline config
`);

  rl.close();
}

main().catch(err => {
  console.error('Setup failed:', err);
  rl.close();
  process.exit(1);
});
