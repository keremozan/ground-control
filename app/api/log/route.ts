import fs from "fs";
import { appendFile } from "fs/promises";
import { join } from "path";
import { HOME } from "@/lib/config";

const LOG_PATH = join(HOME, ".claude/logs/tiny-log.jsonl");

// GET — return last 50 entries from tiny-log (for LogsWidget server-event injection)
export async function GET() {
  try {
    const raw = fs.readFileSync(LOG_PATH, "utf-8");
    const lines = raw.split("\n").filter(Boolean);
    const entries = lines
      .slice(-50)
      .map((l) => { try { return JSON.parse(l); } catch { return null; } })
      .filter(Boolean);
    return Response.json({ entries });
  } catch {
    return Response.json({ entries: [] });
  }
}

export async function POST(req: Request) {
  try {
    const entry = await req.json();
    const line = JSON.stringify({ ...entry, source: "dashboard" }) + "\n";

    try {
      await appendFile(LOG_PATH, line, "utf-8");
    } catch {
      // Log dir may not exist — that's fine, client buffer still works
    }

    return Response.json({ ok: true });
  } catch {
    return Response.json({ ok: true }); // Don't fail on log errors
  }
}
