export const runtime = "nodejs";

import { readFile, writeFile, appendFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import { join, dirname } from "path";
import { HOME } from "@/lib/config";

const FILE_PATH = join(HOME, ".claude/logs/flagged-conversations.jsonl");

async function ensureDir() {
  const dir = dirname(FILE_PATH);
  if (!existsSync(dir)) await mkdir(dir, { recursive: true });
}

async function readEntries(): Promise<Record<string, unknown>[]> {
  try {
    const raw = await readFile(FILE_PATH, "utf-8");
    return raw
      .split("\n")
      .filter(Boolean)
      .map((l) => { try { return JSON.parse(l); } catch { return null; } })
      .filter(Boolean) as Record<string, unknown>[];
  } catch {
    return [];
  }
}

// GET — list pending flagged conversations
export async function GET() {
  const entries = await readEntries();
  return Response.json({ entries });
}

// POST — save a flagged conversation
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2);
    const entry = { id, ts: new Date().toISOString(), ...body };
    await ensureDir();
    await appendFile(FILE_PATH, JSON.stringify(entry) + "\n", "utf-8");
    return Response.json({ ok: true, id });
  } catch (e) {
    return Response.json({ ok: false, error: String(e) }, { status: 500 });
  }
}

// DELETE — remove a flagged conversation by id (called by Architect after fix)
export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return Response.json({ ok: false, error: "id required" }, { status: 400 });
    const entries = await readEntries();
    const remaining = entries.filter((e) => e.id !== id);
    await ensureDir();
    await writeFile(
      FILE_PATH,
      remaining.map((e) => JSON.stringify(e)).join("\n") + (remaining.length ? "\n" : ""),
      "utf-8"
    );
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
