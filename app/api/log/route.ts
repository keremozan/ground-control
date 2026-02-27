import { appendFile } from "fs/promises";
import { join } from "path";
import { HOME } from "@/lib/config";

const LOG_PATH = join(HOME, ".claude/logs/tiny-log.jsonl");

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
