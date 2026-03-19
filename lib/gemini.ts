const GEMINI_API = 'https://generativelanguage.googleapis.com/v1beta/models';

export type GeminiModel = 'gemini-2.5-flash-lite' | 'gemini-2.5-flash' | 'gemini-2.5-pro';

export async function geminiCall(opts: {
  model: GeminiModel;
  prompt: string;
  apiKey: string;
  jsonMode?: boolean;
}): Promise<string> {
  const { model, prompt, apiKey, jsonMode } = opts;
  const url = `${GEMINI_API}/${model}:generateContent?key=${apiKey}`;

  const body: Record<string, unknown> = {
    contents: [{ parts: [{ text: prompt }] }],
  };
  if (jsonMode) {
    body.generationConfig = { responseMimeType: 'application/json' };
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini API ${res.status}: ${err}`);
  }

  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Gemini returned empty response');
  return text;
}

export async function geminiJSON<T>(opts: {
  model: GeminiModel;
  prompt: string;
  apiKey: string;
}): Promise<T> {
  const text = await geminiCall({ ...opts, jsonMode: true });
  return JSON.parse(text) as T;
}
