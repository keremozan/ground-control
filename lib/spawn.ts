import { spawn } from 'child_process';
import { HOME, CLAUDE_BIN, MCP_TASKS_CONFIG as MCP_CONFIG } from './config';
import { registerProcess } from './process-registry';
import { styleGate } from './style-gate';
import { getCharacters } from './characters';

export type SSEEvent =
  | { event: 'status'; data: { state: string; label: string; character?: string } }
  | { event: 'text'; data: { text: string } }
  | { event: 'tool_call'; data: { tool: string; input: string } }
  | { event: 'tool_result'; data: { id: string; preview: string } }
  | { event: 'gate'; data: { text: string } }
  | { event: 'done'; data: { code: number | null } };

function handleMessage(msg: Record<string, unknown>, enqueue: (e: SSEEvent) => void) {
  switch (msg.type) {
    case 'assistant': {
      const content = (msg.message as { content?: unknown[] })?.content;
      if (!Array.isArray(content)) break;
      for (const block of content) {
        const b = block as Record<string, unknown>;
        if (b.type === 'text') {
          enqueue({ event: 'text', data: { text: b.text as string } });
        } else if (b.type === 'tool_use') {
          enqueue({ event: 'tool_call', data: { tool: b.name as string, input: JSON.stringify(b.input).slice(0, 300) } });
        }
      }
      break;
    }
    case 'user': {
      const content = (msg.message as { content?: unknown[] })?.content;
      if (!Array.isArray(content)) break;
      for (const block of content) {
        const b = block as Record<string, unknown>;
        if (b.type === 'tool_result') {
          const preview = typeof b.content === 'string'
            ? (b.content as string).slice(0, 200)
            : JSON.stringify(b.content).slice(0, 200);
          enqueue({ event: 'tool_result', data: { id: b.tool_use_id as string, preview } });
        }
      }
      break;
    }
  }
}

/** Non-streaming spawn: runs Claude CLI and collects all text output */
export function spawnAndCollect(opts: {
  prompt: string;
  model: string;
  maxTurns: number;
  label: string;
  characterId?: string;
  allowedTools?: string[];
  extendedThinking?: boolean;
}): Promise<{ response: string; durationMs: number }> {
  const { prompt, model, maxTurns } = opts;

  return new Promise((resolve, reject) => {
    const start = Date.now();
    const env = { ...process.env };
    delete env.CLAUDECODE;
    if (opts.extendedThinking) {
      env.CLAUDE_EXTEND_THINKING = '1';
    }

    const args = [
      '-p', prompt,
      '--output-format', 'stream-json',
      '--verbose',
      '--model', model,
      '--max-turns', String(maxTurns),
      '--dangerously-skip-permissions',
      '--mcp-config', MCP_CONFIG,
    ];

    if (opts.allowedTools?.length) {
      args.push('--allowedTools', ...opts.allowedTools);
    }

    const proc = spawn(CLAUDE_BIN, args, {
      cwd: HOME,
      env: env as NodeJS.ProcessEnv,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    registerProcess(proc, { charName: opts.characterId || 'unknown', label: opts.label });

    let buffer = '';
    const textParts: string[] = [];

    const processLine = (line: string) => {
      if (!line.trim()) return;
      try {
        const msg = JSON.parse(line);
        if (msg.type === 'assistant') {
          const content = msg.message?.content;
          if (Array.isArray(content)) {
            for (const block of content) {
              if (block.type === 'text') textParts.push(block.text);
            }
          }
        }
      } catch {}
    };

    proc.stdout?.on('data', (chunk: Buffer) => {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) processLine(line);
    });

    proc.on('close', async (code) => {
      if (buffer.trim()) processLine(buffer);
      const raw = textParts.join('\n');
      const charId = opts.characterId;
      const needsGate = charId ? getCharacters()[charId]?.styleGate === true : false;
      const response = needsGate ? await styleGate(raw) : raw;
      resolve({
        response,
        durationMs: Date.now() - start,
      });
    });

    proc.on('error', (err) => reject(err));

    // 10 minute timeout
    setTimeout(() => {
      proc.kill();
      resolve({
        response: textParts.join('\n') || '[Job timed out after 10 minutes]',
        durationMs: Date.now() - start,
      });
    }, 600_000);
  });
}

/** Single-turn spawn: no MCP, one generation pass. Fast for critique/review tasks. */
export function spawnOnce(opts: {
  prompt: string;
  model: string;
}): Promise<string> {
  const { prompt, model } = opts;

  return new Promise((resolve, reject) => {
    const env = { ...process.env };
    delete env.CLAUDECODE;

    const args = [
      '-p', prompt,
      '--output-format', 'stream-json',
      '--verbose',
      '--model', model,
      '--max-turns', '1',
      '--dangerously-skip-permissions',
    ];

    const proc = spawn(CLAUDE_BIN, args, {
      cwd: HOME,
      env: env as NodeJS.ProcessEnv,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    registerProcess(proc, { charName: 'system', label: 'one-shot' });

    let buffer = '';
    const textParts: string[] = [];

    const processLine = (line: string) => {
      if (!line.trim()) return;
      try {
        const msg = JSON.parse(line);
        if (msg.type === 'assistant') {
          const content = msg.message?.content;
          if (Array.isArray(content)) {
            for (const block of content) {
              if (block.type === 'text') textParts.push(block.text);
            }
          }
        }
      } catch {}
    };

    proc.stdout?.on('data', (chunk: Buffer) => {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) processLine(line);
    });

    proc.on('close', () => {
      if (buffer.trim()) processLine(buffer);
      resolve(textParts.join('\n'));
    });

    proc.on('error', (err) => reject(err));

    // 3 minute timeout
    setTimeout(() => {
      proc.kill();
      resolve(textParts.join('\n') || '[Review timed out]');
    }, 180_000);
  });
}

export function spawnSSEStream(opts: {
  prompt: string;
  model: string;
  maxTurns: number;
  label: string;
  characterId?: string;
  signal?: AbortSignal;
  images?: Array<{ mediaType: string; data: string }>;
  allowedTools?: string[];
  extendedThinking?: boolean;
}): ReadableStream<Uint8Array> {
  const { prompt, model, maxTurns, label, characterId, signal, images } = opts;
  const hasImages = !!images && images.length > 0;
  const encoder = new TextEncoder();

  let proc: ReturnType<typeof spawn> | null = null;

  return new ReadableStream<Uint8Array>({
    start(controller) {
      const enqueue = (e: SSEEvent) => {
        const line = `event: ${e.event}\ndata: ${JSON.stringify(e.data)}\n\n`;
        try { controller.enqueue(encoder.encode(line)); } catch {}
      };

      enqueue({ event: 'status', data: { state: 'starting', label, character: characterId } });

      const env = { ...process.env };
      delete env.CLAUDECODE;
      if (opts.extendedThinking) {
        env.CLAUDE_EXTEND_THINKING = '1';
      }

      const args = hasImages ? [
        '-p',
        '--input-format', 'stream-json',
        '--output-format', 'stream-json',
        '--verbose',
        '--model', model,
        '--max-turns', String(maxTurns),
        '--dangerously-skip-permissions',
        '--mcp-config', MCP_CONFIG,
      ] : [
        '-p', prompt,
        '--output-format', 'stream-json',
        '--verbose',
        '--model', model,
        '--max-turns', String(maxTurns),
        '--dangerously-skip-permissions',
        '--mcp-config', MCP_CONFIG,
      ];

      if (opts.allowedTools?.length) {
        args.push('--allowedTools', ...opts.allowedTools);
      }

      proc = spawn(CLAUDE_BIN, args, { cwd: HOME, env: env as NodeJS.ProcessEnv, stdio: [hasImages ? 'pipe' : 'ignore', 'pipe', 'pipe'] });
      registerProcess(proc, { charName: characterId || 'chat', label });

      // When images present, write multimodal message to stdin and close
      if (hasImages && proc.stdin) {
        const content: Array<Record<string, unknown>> = images!.map(img => ({
          type: 'image',
          source: { type: 'base64', media_type: img.mediaType, data: img.data },
        }));
        content.push({ type: 'text', text: prompt });
        const stdinMsg = JSON.stringify({ type: 'user', message: { role: 'user', content } }) + '\n';
        proc.stdin.write(stdinMsg);
        proc.stdin.end();
      }

      let buffer = '';
      const collectedTextParts: string[] = [];

      // Wrap enqueue to also collect text for post-stream style gate
      const enqueueTracked = (e: SSEEvent) => {
        if (e.event === 'text') collectedTextParts.push(e.data.text);
        enqueue(e);
      };

      // Kill subprocess when client disconnects
      if (signal) {
        signal.addEventListener('abort', () => {
          proc?.kill();
          try { controller.close(); } catch {}
        }, { once: true });
      }

      proc.stdout?.on('data', (chunk: Buffer) => {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          if (!line.trim()) continue;
          try { handleMessage(JSON.parse(line), enqueueTracked); } catch {}
        }
      });

      proc.on('close', async (code) => {
        if (buffer.trim()) {
          try { handleMessage(JSON.parse(buffer), enqueueTracked); } catch {}
        }

        // Style gate: apply post-processing for characters with styleGate: true (>= 200 words)
        const needsGate = characterId ? getCharacters()[characterId]?.styleGate === true : false;
        if (needsGate) {
          const fullText = collectedTextParts.join('');
          const wordCount = fullText.trim().split(/\s+/).filter(Boolean).length;
          if (wordCount >= 200) {
            try {
              const gated = await styleGate(fullText);
              if (gated) enqueue({ event: 'gate', data: { text: gated } });
            } catch {}
          }
        }

        enqueue({ event: 'done', data: { code } });
        try { controller.close(); } catch {}
      });
    },
    cancel() {
      proc?.kill();
    },
  });
}
