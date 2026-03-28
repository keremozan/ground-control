import fs from "fs";
import { join } from "path";

// ── Types ────────────────────────────────────────

export interface SensorEvent {
  id: string;
  type: string;
  timestamp: string;
  receivedAt: string;
  data: Record<string, unknown>;
}

export interface SleepData {
  bedtime: string;
  wakeup: string;
  totalMin: number;
  deepMin: number;
  remMin: number;
  coreMin: number;
  awakenings: number;
  heartRateAvg: number;
}

// ── Storage ──────────────────────────────────────

export const SENSOR_LOG_PATH = join(process.cwd(), "data", "sensor-log.json");

function readLog(): SensorEvent[] {
  try {
    const raw = fs.readFileSync(SENSOR_LOG_PATH, "utf-8");
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

// ── Public API ───────────────────────────────────

/** Get all events of a type, optionally filtered by since date. */
export function getSensorEvents(type: string, since?: Date): SensorEvent[] {
  const events = readLog().filter((e) => e.type === type);
  if (!since) return events;
  const cutoff = since.getTime();
  return events.filter((e) => new Date(e.timestamp).getTime() >= cutoff);
}

/** Get the most recent event of a type. */
export function getLatestSensor(type: string): SensorEvent | null {
  const events = getSensorEvents(type);
  if (events.length === 0) return null;
  return events.reduce((latest, e) =>
    new Date(e.timestamp) > new Date(latest.timestamp) ? e : latest
  );
}

/** Get last night's sleep data. Convenience for Kybernetes/Coach. */
export function getLastSleep(): SleepData | null {
  const event = getLatestSensor("sleep");
  if (!event) return null;
  return event.data as unknown as SleepData;
}
