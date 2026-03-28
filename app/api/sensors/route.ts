export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import crypto from "crypto";
import { apiOk, apiError } from "@/lib/api-helpers";
import { SENSOR_LOCATIONS } from "@/lib/config";
import {
  validateSensorEvent,
  pruneOldEntries,
  isDuplicate,
  readLog,
  writeLog,
  type SensorEvent,
} from "@/lib/sensors";

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return apiError(400, "invalid JSON");
  }

  const validationError = validateSensorEvent(body, SENSOR_LOCATIONS);
  if (validationError) return apiError(400, validationError);

  let entries = readLog();

  if (isDuplicate(entries, body.type as string, body.timestamp as string)) {
    return apiOk({ deduplicated: true });
  }

  const event: SensorEvent = {
    id: crypto.randomUUID().slice(0, 8),
    type: body.type as string,
    timestamp: body.timestamp as string,
    receivedAt: new Date().toISOString(),
    data: body.data as Record<string, unknown>,
  };

  entries.push(event);
  entries = pruneOldEntries(entries);
  writeLog(entries);

  return apiOk({ id: event.id });
}
