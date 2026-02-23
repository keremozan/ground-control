'use client';

import { useState, useCallback, useRef } from 'react';

export type SSEMessage =
  | { event: 'status'; data: { state: string; label: string; character?: string } }
  | { event: 'text'; data: { text: string } }
  | { event: 'tool_call'; data: { tool: string; input: string } }
  | { event: 'tool_result'; data: { id: string; preview: string } }
  | { event: 'done'; data: { code: number | null } };

export function useSSE() {
  const [messages, setMessages] = useState<SSEMessage[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const readerRef = useRef<ReadableStreamDefaultReader | null>(null);

  const dispatch = useCallback(async (url: string, body: unknown) => {
    if (isRunning) return;
    setIsRunning(true);
    setMessages([]);

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.body) throw new Error('No response body');
      const reader = res.body.getReader();
      readerRef.current = reader;
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // Parse SSE events from buffer
        const parts = buffer.split('\n\n');
        buffer = parts.pop() || '';

        for (const part of parts) {
          const eventMatch = part.match(/^event: (\w+)/m);
          const dataMatch = part.match(/^data: (.+)/m);
          if (!eventMatch || !dataMatch) continue;
          try {
            const msg = { event: eventMatch[1], data: JSON.parse(dataMatch[1]) } as SSEMessage;
            setMessages(prev => [...prev, msg]);
            if (msg.event === 'done') setIsRunning(false);
          } catch {}
        }
      }
    } catch {
      setIsRunning(false);
    }
  }, [isRunning]);

  const cancel = useCallback(() => {
    readerRef.current?.cancel();
    setIsRunning(false);
  }, []);

  return { messages, isRunning, dispatch, cancel };
}
