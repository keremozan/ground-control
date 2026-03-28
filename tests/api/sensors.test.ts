import { describe, it, expect } from "vitest";
import {
  validateSensorEvent,
  pruneOldEntries,
  isDuplicate,
  type SensorEvent,
} from "@/lib/sensors";

describe("validateSensorEvent", () => {
  it("accepts a valid workout event", () => {
    const body = { type: "workout", timestamp: "2026-03-28T10:00:00Z", data: { activity: "running", durationMin: 30, calories: 200 } };
    expect(validateSensorEvent(body, ["home", "work"])).toBeNull();
  });

  it("accepts a valid sleep event", () => {
    const body = { type: "sleep", timestamp: "2026-03-28T07:00:00Z", data: { bedtime: "23:00", wakeup: "07:00", totalMin: 480, deepMin: 120, remMin: 90, coreMin: 270, awakenings: 2, heartRateAvg: 55 } };
    expect(validateSensorEvent(body, ["home", "work"])).toBeNull();
  });

  it("accepts a valid location event with known place", () => {
    const body = { type: "location", timestamp: "2026-03-28T08:50:00Z", data: { place: "home", event: "arrive" } };
    expect(validateSensorEvent(body, ["home", "work"])).toBeNull();
  });

  it("accepts a valid screentime event", () => {
    const body = { type: "screentime", timestamp: "2026-03-28T21:00:00Z", data: { totalMin: 180, pickups: 45 } };
    expect(validateSensorEvent(body, ["home", "work"])).toBeNull();
  });

  it("rejects missing type", () => {
    const body = { timestamp: "2026-03-28T10:00:00Z", data: {} };
    expect(validateSensorEvent(body, [])).toBe("type is required");
  });

  it("rejects unknown type", () => {
    const body = { type: "heartrate", timestamp: "2026-03-28T10:00:00Z", data: {} };
    expect(validateSensorEvent(body, [])).toBe("unknown sensor type: heartrate");
  });

  it("rejects missing timestamp", () => {
    const body = { type: "workout", data: { activity: "running", durationMin: 30, calories: 200 } };
    expect(validateSensorEvent(body, [])).toBe("timestamp is required");
  });

  it("rejects missing data", () => {
    const body = { type: "workout", timestamp: "2026-03-28T10:00:00Z" };
    expect(validateSensorEvent(body, [])).toBe("data is required");
  });

  it("rejects location event with unknown place", () => {
    const body = { type: "location", timestamp: "2026-03-28T08:50:00Z", data: { place: "gym", event: "arrive" } };
    expect(validateSensorEvent(body, ["home", "work"])).toBe("unknown location: gym");
  });

  it("rejects workout missing required fields", () => {
    const body = { type: "workout", timestamp: "2026-03-28T10:00:00Z", data: { activity: "running" } };
    expect(validateSensorEvent(body, [])).toBe("workout requires activity, durationMin, calories");
  });

  it("rejects sleep missing required fields", () => {
    const body = { type: "sleep", timestamp: "2026-03-28T07:00:00Z", data: { totalMin: 480 } };
    expect(validateSensorEvent(body, [])).toBe("sleep requires bedtime, wakeup, totalMin, deepMin, remMin, coreMin, awakenings, heartRateAvg");
  });
});

describe("pruneOldEntries", () => {
  it("removes entries older than 90 days", () => {
    const now = new Date("2026-03-28T12:00:00Z");
    const entries: SensorEvent[] = [
      { id: "old", type: "workout", timestamp: "2025-12-01T10:00:00Z", receivedAt: "2025-12-01T10:00:01Z", data: {} },
      { id: "recent", type: "workout", timestamp: "2026-03-20T10:00:00Z", receivedAt: "2026-03-20T10:00:01Z", data: {} },
    ];
    const result = pruneOldEntries(entries, now);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("recent");
  });

  it("keeps all entries within 90 days", () => {
    const now = new Date("2026-03-28T12:00:00Z");
    const entries: SensorEvent[] = [
      { id: "a", type: "workout", timestamp: "2026-03-01T10:00:00Z", receivedAt: "2026-03-01T10:00:01Z", data: {} },
      { id: "b", type: "sleep", timestamp: "2026-03-27T07:00:00Z", receivedAt: "2026-03-27T07:00:01Z", data: {} },
    ];
    const result = pruneOldEntries(entries, now);
    expect(result).toHaveLength(2);
  });
});

describe("isDuplicate", () => {
  it("returns true when same type and timestamp exist within 60s", () => {
    const existing: SensorEvent[] = [
      { id: "a", type: "workout", timestamp: "2026-03-28T10:00:00Z", receivedAt: "2026-03-28T10:00:01Z", data: {} },
    ];
    expect(isDuplicate(existing, "workout", "2026-03-28T10:00:30Z")).toBe(true);
  });

  it("returns false when no matching type within 60s", () => {
    const existing: SensorEvent[] = [
      { id: "a", type: "sleep", timestamp: "2026-03-28T10:00:00Z", receivedAt: "2026-03-28T10:00:01Z", data: {} },
    ];
    expect(isDuplicate(existing, "workout", "2026-03-28T10:00:30Z")).toBe(false);
  });

  it("returns false when same type but more than 60s apart", () => {
    const existing: SensorEvent[] = [
      { id: "a", type: "workout", timestamp: "2026-03-28T10:00:00Z", receivedAt: "2026-03-28T10:00:01Z", data: {} },
    ];
    expect(isDuplicate(existing, "workout", "2026-03-28T10:05:00Z")).toBe(false);
  });
});
