import { TANA_MCP_URL, TANA_MCP_TOKEN } from '../config';

const MCP_URL = TANA_MCP_URL;
const MCP_TOKEN = TANA_MCP_TOKEN;

export async function mcpCall(method: string, params: Record<string, unknown>) {
  const res = await fetch(MCP_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/event-stream',
      'Authorization': `Bearer ${MCP_TOKEN}`,
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method,
      params,
      id: Date.now(),
    }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  if (data.result?.isError) {
    const msg = data.result?.content?.[0]?.text || 'MCP tool error';
    throw new Error(msg);
  }
  const text = data.result?.content?.[0]?.text;
  if (!text) return null;
  try { return JSON.parse(text); } catch { return text; }
}
