import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import { exec } from "child_process";
import { promisify } from "util";
import path from "path";
import { spawnOnce } from "@/lib/spawn";

const execAsync = promisify(exec);

const CHANGELOG = path.join(process.cwd(), "CHANGELOG.md");
const PRIVATE_CHANGELOG = path.join(process.cwd(), "CHANGELOG.private.md");

export async function POST(req: Request) {
  const { messages, character } = await req.json() as {
    messages: { role: string; content: string }[];
    character?: string;
  };

  if (!messages?.length) {
    return NextResponse.json({ error: "messages required" }, { status: 400 });
  }

  // Read current changelog for context
  const changelog = await fs.readFile(CHANGELOG, "utf-8");
  const versionMatch = changelog.match(/^## v[\d.]+[^\n]*/m);
  if (!versionMatch) {
    return NextResponse.json({ error: "No version heading in CHANGELOG.md" }, { status: 500 });
  }
  const versionLine = versionMatch[0];

  // Build conversation summary for the LLM
  const convoText = messages
    .slice(-20) // last 20 messages for context
    .map(m => `${m.role}: ${m.content.slice(0, 1500)}`)
    .join("\n\n");

  const prompt = `You are a changelog writer for Ground Control, a Next.js agent dashboard.

Given this conversation between a user and ${character || "an assistant"}, generate changelog entries.

Current version line: ${versionLine}
Recent changelog format examples:
### Chat
- [fix] Auto-scroll no longer drags you back to input while reading
- [new] Flag button in chat header toolbar

Rules:
- Use format: ### Section\\n- [type] description
- Types: [new], [fix], [refactor], [change]
- Section names: Chat, Dashboard, Pipeline, System, API (pick the best fit)
- Keep entries concise, one line each
- If the conversation contains sensitive/internal details (API keys, personal data, internal architecture decisions), put those in privateEntry and keep publicEntry generic
- If nothing is sensitive, privateEntry should be null

Return ONLY valid JSON (no markdown fences):
{"publicEntry": "### Section\\n- [type] description", "privateEntry": "### Section\\n- [type] detail" | null}

Conversation:
${convoText}`;

  let publicEntry: string;
  let privateEntry: string | null = null;

  try {
    const raw = await spawnOnce({ prompt, model: "haiku" });
    const cleaned = raw.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
    const parsed = JSON.parse(cleaned);
    publicEntry = parsed.publicEntry;
    privateEntry = parsed.privateEntry || null;
  } catch (e) {
    return NextResponse.json({ error: `Failed to generate entry: ${e}` }, { status: 500 });
  }

  if (!publicEntry?.trim()) {
    return NextResponse.json({ error: "Generated empty entry" }, { status: 500 });
  }

  // Write public changelog
  const updated = changelog.replace(
    versionLine + "\n",
    versionLine + "\n\n" + publicEntry.trim() + "\n"
  );
  await fs.writeFile(CHANGELOG, updated, "utf-8");

  // Write private changelog if needed
  const filesToAdd = ["CHANGELOG.md"];
  if (privateEntry?.trim()) {
    try {
      const privContent = await fs.readFile(PRIVATE_CHANGELOG, "utf-8");
      const privVersionMatch = privContent.match(/^## v[\d.]+[^\n]*/m);
      if (privVersionMatch) {
        const privUpdated = privContent.replace(
          privVersionMatch[0] + "\n",
          privVersionMatch[0] + "\n\n" + privateEntry.trim() + "\n"
        );
        await fs.writeFile(PRIVATE_CHANGELOG, privUpdated, "utf-8");
        filesToAdd.push("CHANGELOG.private.md");
      }
    } catch {
      // private changelog doesn't exist, skip
    }
  }

  // Commit
  try {
    await execAsync(
      `cd ${process.cwd()} && git add ${filesToAdd.join(" ")} && git commit -m "docs: update changelog"`,
    );
  } catch (e: unknown) {
    const err = e as { stderr?: string; message?: string };
    return NextResponse.json(
      { error: `git commit failed: ${err.stderr || err.message}` },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    version: versionLine,
    publicEntry,
    privateEntry: privateEntry ? "(private entry added)" : null,
  });
}
