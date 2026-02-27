export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
import fs from 'fs';
import path from 'path';
import {
  HOME, CHARACTERS_DIR, SKILLS_DIR, SHARED_DIR,
  TANA_MCP_URL, TANA_MCP_TOKEN, TANA_WORKSPACE_ID,
  JOB_RESULTS_PATH,
  PIPELINE_SOURCES, PIPELINE_OUTPUTS,
  MCP_TASKS_CONFIG,
  TRACK_COLOR_PATTERNS, EMAIL_COLOR_PATTERNS, EMAIL_LABEL_COLORS,
} from '@/lib/config';
import { MCP_SERVER_ICON_MAP } from '@/lib/mcp-icons';

export async function GET() {
  // List characters
  const characters: { name: string; tier: string }[] = [];
  for (const tier of ['core', 'meta', 'stationed']) {
    try {
      const files = fs.readdirSync(`${CHARACTERS_DIR}/${tier}`);
      for (const f of files) {
        if (!f.endsWith('.json') || f === 'TEMPLATE.json') continue;
        characters.push({ name: f.replace('.json', ''), tier });
      }
    } catch {}
  }

  // List skills
  const skills: string[] = [];
  try {
    const dirs = fs.readdirSync(SKILLS_DIR);
    for (const d of dirs) {
      try {
        if (fs.statSync(path.join(SKILLS_DIR, d, 'SKILL.md')).isFile()) {
          skills.push(d);
        }
      } catch {}
    }
  } catch {}

  // List knowledge files
  const knowledge: string[] = [];
  try {
    const files = fs.readdirSync(SHARED_DIR);
    for (const f of files) {
      if (f.endsWith('.md')) knowledge.push(f.replace('.md', ''));
    }
  } catch {}

  // Check Tana connection (same approach as status API)
  let tanaConnected = false;
  try {
    const r = await fetch(TANA_MCP_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream',
        'Authorization': `Bearer ${TANA_MCP_TOKEN}`,
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method: 'tools/list', params: {} }),
      signal: AbortSignal.timeout(5000),
    });
    const data = await r.json();
    tanaConnected = !data.error;
  } catch {}

  // Check Gmail credentials exist
  const gmailPersonal = fs.existsSync(`${HOME}/.gmail-mcp/credentials.json`);
  const gmailSchool = fs.existsSync(`${HOME}/.gmail-mcp-school/credentials.json`);

  // Check Calendar tokens exist
  const calendar = fs.existsSync(`${HOME}/.config/google-calendar-mcp/tokens.json`);

  // Read MCP servers from config
  let mcpServers: { name: string; iconName: string }[] = [];
  try {
    const raw = JSON.parse(fs.readFileSync(MCP_TASKS_CONFIG, 'utf-8'));
    mcpServers = Object.keys(raw.mcpServers || {}).map(name => ({
      name,
      iconName: MCP_SERVER_ICON_MAP[name] || 'Wrench',
    }));
  } catch {}

  return Response.json({
    paths: [
      { label: 'Characters', value: CHARACTERS_DIR },
      { label: 'Skills', value: SKILLS_DIR },
      { label: 'Knowledge', value: SHARED_DIR },
      { label: 'Job Results', value: JOB_RESULTS_PATH },
    ],
    tana: {
      url: TANA_MCP_URL,
      workspace: TANA_WORKSPACE_ID,
      connected: tanaConnected,
    },
    gmail: { personal: gmailPersonal, school: gmailSchool },
    calendar,
    characters,
    skills,
    knowledge,
    sources: PIPELINE_SOURCES,
    outputs: PIPELINE_OUTPUTS,
    mcpServers,
    trackColorPatterns: TRACK_COLOR_PATTERNS,
    emailColorPatterns: EMAIL_COLOR_PATTERNS,
    emailLabelColors: EMAIL_LABEL_COLORS,
  });
}
