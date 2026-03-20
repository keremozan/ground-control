import { NextResponse } from "next/server";

export function apiOk<T>(data?: T, status = 200) {
  return NextResponse.json(
    { ok: true, ...(data !== undefined && { data }) },
    { status }
  );
}

export function apiError(status: number, message: string) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

export function apiStream(stream: ReadableStream) {
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

export function requireFields<T extends Record<string, unknown>>(
  body: T,
  fields: (keyof T)[]
): string | null {
  for (const f of fields) {
    const v = body[f];
    if (v === undefined || v === null || (typeof v === "string" && !v.trim())) {
      return `${String(f)} is required`;
    }
  }
  return null;
}

export const SAFE_NAME = /^[a-z0-9-]+$/;

export function validateName(name: string): string | null {
  if (!name || !SAFE_NAME.test(name)) return "Invalid name";
  return null;
}
