import { serverLog } from "./server-log";

export function captureError(context: string, error: unknown): void {
  const msg = error instanceof Error ? error.message : String(error);
  serverLog({ level: "error", context, message: msg });
}
