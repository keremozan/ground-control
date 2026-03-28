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

// ── Valid sensor types ───────────────────────────

const SENSOR_TYPES = ["workout", "sleep", "location", "screentime"] as const;

const REQUIRED_FIELDS: Record<string, string[]> = {
  workout: ["activity", "durationMin", "calories"],
  sleep: ["bedtime", "wakeup", "totalMin", "deepMin", "remMin", "coreMin", "awakenings", "heartRateAvg"],
  location: ["place", "event"],
  screentime: ["totalMin", "pickups"],
};

// ── Ingestion helpers ────────────────────────────

/** Validate an incoming sensor event body. Returns error string or null. */
export function validateSensorEvent(
  body: Record<string, unknown>,
  validLocations: string[]
): string | null {
  const { type, timestamp, data } = body;
  if (!type) return "type is required";
  if (!timestamp) return "timestamp is required";
  if (!data || typeof data !== "object") return "data is required";

  if (!SENSOR_TYPES.includes(type as typeof SENSOR_TYPES[number])) {
    return `unknown sensor type: ${type}`;
  }

  const t = type as string;
  const d = data as Record<string, unknown>;
  const required = REQUIRED_FIELDS[t];
  const missing = required.filter((f) => d[f] == null);
  if (missing.length > 0) {
    return `${t} requires ${required.join(", ")}`;
  }

  if (t === "location" && !validLocations.includes(d.place as string)) {
    return `unknown location: ${d.place}`;
  }

  return null;
}

/** Remove entries older than 90 days. */
export function pruneOldEntries(entries: SensorEvent[], now = new Date()): SensorEvent[] {
  const cutoff = now.getTime() - 90 * 24 * 60 * 60 * 1000;
  return entries.filter((e) => new Date(e.timestamp).getTime() >= cutoff);
}

/** Check if a same-type event within 60 seconds already exists (dedup). */
export function isDuplicate(
  entries: SensorEvent[],
  type: string,
  timestamp: string
): boolean {
  const ts = new Date(timestamp).getTime();
  return entries.some(
    (e) => e.type === type && Math.abs(new Date(e.timestamp).getTime() - ts) < 60_000
  );
}
