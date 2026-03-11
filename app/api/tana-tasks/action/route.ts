export const runtime = 'nodejs';
import {
  readTanaNode, setTaskInProgress, markTaskDone,
  trashTask, archiveTask, resolveCharacter, openNode, setTaskPriority, createTask, createTaskInWorkstream,
} from '@/lib/tana';
import { buildCharacterPrompt } from '@/lib/prompt';
import { spawnSSEStream } from '@/lib/spawn';

export async function POST(req: Request) {
  const body = await req.json();
  const { nodeId, action, taskName, track, trackId, assigned, userPrompt } = body as {
    nodeId: string;
    action: string;
    taskName?: string;
    track?: string;
    trackId?: string | null;
    assigned?: string | null;
    userPrompt?: string;
  };

  // --- Create task (no nodeId needed) ---
  if (action === 'create') {
    const { title, priority, trackId: wsId } = body as { title?: string; priority?: string; trackId?: string };
    if (!title?.trim()) return Response.json({ error: 'title required' }, { status: 400 });
    try {
      if (wsId) {
        await createTaskInWorkstream(wsId, { title: title.trim(), priority: priority || 'medium' });
      } else {
        await createTask({ title: title.trim(), priority: priority || 'medium' });
      }
      return Response.json({ ok: true, message: 'Task created' });
    } catch (e) {
      return Response.json({ error: String(e) }, { status: 500 });
    }
  }

  if (!nodeId || !action) {
    return Response.json({ error: 'nodeId and action required' }, { status: 400 });
  }

  // --- Simple mutations (no AI, return JSON) ---

  if (action === 'open') {
    try {
      await openNode(nodeId);
      return Response.json({ ok: true, message: 'Opened in Tana' });
    } catch (e) {
      return Response.json({ error: String(e) }, { status: 500 });
    }
  }

  if (action === 'done') {
    try {
      await markTaskDone(nodeId);
      return Response.json({ ok: true, message: 'Marked as done' });
    } catch (e) {
      return Response.json({ error: String(e) }, { status: 500 });
    }
  }

  if (action === 'delete') {
    try {
      await trashTask(nodeId);
      return Response.json({ ok: true, message: 'Deleted' });
    } catch (e) {
      return Response.json({ error: String(e) }, { status: 500 });
    }
  }

  if (action === 'archive') {
    try {
      await archiveTask(nodeId, taskName || 'Task', trackId || null);
      return Response.json({ ok: true, message: 'Archived to log' });
    } catch (e) {
      return Response.json({ error: String(e) }, { status: 500 });
    }
  }

  if (action === 'set-priority') {
    const { priority } = body as { priority?: string };
    if (!priority || !['high', 'medium', 'low'].includes(priority)) {
      return Response.json({ error: 'priority must be high, medium, or low' }, { status: 400 });
    }
    try {
      await setTaskPriority(nodeId, priority as 'high' | 'medium' | 'low');
      return Response.json({ ok: true, message: `Priority set to ${priority}` });
    } catch (e) {
      return Response.json({ error: String(e) }, { status: 500 });
    }
  }

  // --- Reschedule: spawn clerk with reschedule skill ---

  if (action === 'reschedule') {
    try {
      const today = new Date().toISOString().split('T')[0];
      const prompt = buildCharacterPrompt('clerk',
        `Reschedule this single overdue task to a FUTURE date. Today is ${today}. The new due date MUST be after today.\n\nUse the clerk-reschedule skill: check calendar availability for the next 7 days, then set a new due date using set_field_content on field 8EVxOhX0Tnc4.\n\nIMPORTANT: ONLY change the due date. Do NOT change the task status, priority, or any other field.\n\nTask: ${taskName || 'Unknown'}\nTana node ID: ${nodeId}\nTrack: ${track || 'Unknown'}`
      );
      const stream = spawnSSEStream({
        prompt,
        model: 'sonnet',
        maxTurns: 15,
        label: `Reschedule: ${taskName || 'Task'}`,
        characterId: 'clerk',
      });
      return new Response(stream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        },
      });
    } catch (e) {
      return Response.json({ error: String(e) }, { status: 500 });
    }
  }

  // --- Prepare: read task + set in-progress, no AI ---

  if (action === 'prepare') {
    try {
      const md = await readTanaNode(nodeId);
      const context = md || taskName || 'Unknown task';
      const char = resolveCharacter(assigned || null, track || '', taskName || '');
      await setTaskInProgress(nodeId, char);
      return Response.json({ ok: true, context, character: char });
    } catch (e) {
      return Response.json({ error: String(e) }, { status: 500 });
    }
  }

  // --- AI-powered: Start task ---

  if (action === 'start') {
    try {
      const md = await readTanaNode(nodeId);
      const context = md || taskName || 'Unknown task';

      // Use already-assigned character, or derive from track
      const char = resolveCharacter(assigned || null, track || '', taskName || '');

      // Set status to in-progress + assign character in Tana
      await setTaskInProgress(nodeId, char);

      const userInstruction = userPrompt ? `\n\nUser instruction: ${userPrompt}` : '';
      const prompt = buildCharacterPrompt(char,
        `Work on this Tana task. Do what the task asks — use your tools (MCP servers) to complete it. Report what you did.\n\nIMPORTANT RULES:\n- Never send emails directly — only create drafts.\n- When creating Gmail drafts as replies, you MUST set BOTH threadId AND inReplyTo — Gmail will not display the draft without inReplyTo.\n\n${context}${userInstruction}`
      );

      const stream = spawnSSEStream({
        prompt,
        model: char === 'oracle' ? 'opus' : 'sonnet',
        maxTurns: 20,
        label: taskName || 'Task',
        characterId: char,
      });

      return new Response(stream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        },
      });
    } catch (e) {
      return Response.json({ error: String(e) }, { status: 500 });
    }
  }

  return Response.json({ error: `Unknown action: ${action}` }, { status: 400 });
}
