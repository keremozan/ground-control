import { describe, it, expect, afterEach } from "vitest";
import fs from "fs";
import {
  getSensorEvents,
  getLatestSensor,
  getLastSleep,
  type SensorEvent,
  SENSOR_LOG_PATH,
} from "@/lib/sensors";

function writeSensorLog(entries: SensorEvent[]) {
  fs.writeFileSync(SENSOR_LOG_PATH, JSON.stringify(entries));
}

function removeSensorLog() {
  try { fs.unlinkSync(SENSOR_LOG_PATH); } catch { /* noop */ }
}

describe("getSensorEvents", () => {
  afterEach(() => removeSensorLog());

  it("returns empty array when file does not exist", () => {
    removeSensorLog();
    expect(getSensorEvents("workout")).toEqual([]);
  });

  it("returns only events matching the given type", () => {
    const events: SensorEvent[] = [
      { id: "a", type: "workout", timestamp: "2026-03-28T10:00:00Z", receivedAt: "2026-03-28T10:00:01Z", data: { activity: "running", durationMin: 30, calories: 200 } },
      { id: "b", type: "sleep", timestamp: "2026-03-28T07:00:00Z", receivedAt: "2026-03-28T07:00:01Z", data: { bedtime: "23:00", wakeup: "07:00", totalMin: 480, deepMin: 120, remMin: 90, coreMin: 270, awakenings: 2, heartRateAvg: 55 } },
      { id: "c", type: "workout", timestamp: "2026-03-27T10:00:00Z", receivedAt: "2026-03-27T10:00:01Z", data: { activity: "cycling", durationMin: 60, calories: 400 } },
    ];
    writeSensorLog(events);
    const result = getSensorEvents("workout");
    expect(result).toHaveLength(2);
    expect(result.every(e => e.type === "workout")).toBe(true);
  });

  it("filters by since date when provided", () => {
    const events: SensorEvent[] = [
      { id: "a", type: "workout", timestamp: "2026-03-28T10:00:00Z", receivedAt: "2026-03-28T10:00:01Z", data: { activity: "running", durationMin: 30, calories: 200 } },
      { id: "b", type: "workout", timestamp: "2026-03-20T10:00:00Z", receivedAt: "2026-03-20T10:00:01Z", data: { activity: "cycling", durationMin: 60, calories: 400 } },
    ];
    writeSensorLog(events);
    const result = getSensorEvents("workout", new Date("2026-03-25T00:00:00Z"));
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("a");
  });
});

describe("getLatestSensor", () => {
  afterEach(() => removeSensorLog());

  it("returns null when no events of that type exist", () => {
    removeSensorLog();
    expect(getLatestSensor("workout")).toBeNull();
  });

  it("returns the most recent event by timestamp", () => {
    const events: SensorEvent[] = [
      { id: "a", type: "workout", timestamp: "2026-03-27T10:00:00Z", receivedAt: "2026-03-27T10:00:01Z", data: { activity: "running", durationMin: 30, calories: 200 } },
      { id: "b", type: "workout", timestamp: "2026-03-28T10:00:00Z", receivedAt: "2026-03-28T10:00:01Z", data: { activity: "cycling", durationMin: 60, calories: 400 } },
    ];
    writeSensorLog(events);
    const result = getLatestSensor("workout");
    expect(result?.id).toBe("b");
  });
});

describe("getLastSleep", () => {
  afterEach(() => removeSensorLog());

  it("returns null when no sleep events exist", () => {
    removeSensorLog();
    expect(getLastSleep()).toBeNull();
  });

  it("returns the most recent sleep data", () => {
    const events: SensorEvent[] = [
      { id: "a", type: "sleep", timestamp: "2026-03-27T07:00:00Z", receivedAt: "2026-03-27T07:00:01Z", data: { bedtime: "23:00", wakeup: "07:00", totalMin: 480, deepMin: 120, remMin: 90, coreMin: 270, awakenings: 2, heartRateAvg: 55 } },
      { id: "b", type: "sleep", timestamp: "2026-03-28T07:15:00Z", receivedAt: "2026-03-28T07:15:01Z", data: { bedtime: "23:30", wakeup: "07:15", totalMin: 465, deepMin: 100, remMin: 85, coreMin: 280, awakenings: 3, heartRateAvg: 52 } },
    ];
    writeSensorLog(events);
    const result = getLastSleep();
    expect(result).not.toBeNull();
    expect(result!.totalMin).toBe(465);
    expect(result!.deepMin).toBe(100);
  });
});
