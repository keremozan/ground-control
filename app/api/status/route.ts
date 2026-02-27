export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
import fs from 'fs';
import path from 'path';
import type { JobResult } from '@/lib/scheduler';
import { getGmailToken, getCalendarToken } from '@/lib/google-auth';
import { TANA_MCP_URL, TANA_MCP_TOKEN, JOB_RESULTS_PATH, HOME } from '@/lib/config';

const RESULTS_FILE = JOB_RESULTS_PATH;
const MCP_URL = TANA_MCP_URL;
const MCP_TOKEN = TANA_MCP_TOKEN;

async function checkTana(): Promise<boolean> {
  try {
    const res = await fetch(MCP_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream',
        'Authorization': `Bearer ${MCP_TOKEN}`,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'tools/list',
        params: {},
        id: Date.now(),
      }),
      signal: AbortSignal.timeout(5000),
    });
    const data = await res.json();
    return !data.error;
  } catch {
    return false;
  }
}

async function checkGmail(account: string): Promise<boolean> {
  try {
    const token = await getGmailToken(account);
    const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(5000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function checkPlaywright(): Promise<boolean> {
  try {
    const pwDir = path.join(HOME, 'Library', 'Caches', 'ms-playwright');
    const entries = fs.readdirSync(pwDir);
    return entries.some(e => e.startsWith('chromium-'));
  } catch {
    return false;
  }
}

async function checkCalendar(): Promise<boolean> {
  try {
    const token = await getCalendarToken();
    const res = await fetch('https://www.googleapis.com/calendar/v3/users/me/calendarList?maxResults=1', {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(5000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

function getLastCycle(): string | null {
  try {
    const results: JobResult[] = JSON.parse(fs.readFileSync(RESULTS_FILE, 'utf-8'));
    // Find most recent postman result (any postman job)
    const postman = results.find(r => r.charName === 'postman');
    if (postman) return postman.timestamp;
    // Fallback: any result
    if (results.length > 0) return results[0].timestamp;
    return null;
  } catch {
    return null;
  }
}

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export async function GET() {
  const [tanaResult, gmailPersonalResult, gmailSchoolResult, calendarResult, playwrightResult, lastCycleIso] =
    await Promise.allSettled([
      checkTana(),
      checkGmail('personal'),
      checkGmail('school'),
      checkCalendar(),
      checkPlaywright(),
      Promise.resolve(getLastCycle()),
    ]);

  const val = <T,>(r: PromiseSettledResult<T>, fallback: T): T =>
    r.status === 'fulfilled' ? r.value : fallback;

  return Response.json({
    tana: val(tanaResult, false),
    gmail: {
      personal: val(gmailPersonalResult, false),
      school: val(gmailSchoolResult, false),
    },
    calendar: val(calendarResult, false),
    playwright: val(playwrightResult, false),
    lastCycle: (() => {
      const iso = val(lastCycleIso, null);
      return iso ? formatRelative(iso) : null;
    })(),
  });
}
