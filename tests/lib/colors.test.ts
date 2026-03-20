import { describe, it, expect } from "vitest";
import { buildColorMatcher } from "@/lib/colors";

describe("buildColorMatcher", () => {
  it("returns the matching color for a pattern", () => {
    const match = buildColorMatcher({ "#ff0000": "urgent" });
    expect(match("this is urgent")).toBe("#ff0000");
  });

  it("returns null when no pattern matches", () => {
    const match = buildColorMatcher({ "#ff0000": "urgent" });
    expect(match("normal message")).toBeNull();
  });

  it("matches case-insensitively", () => {
    const match = buildColorMatcher({ "#00ff00": "newsletter" });
    expect(match("NEWSLETTER Weekly Digest")).toBe("#00ff00");
    expect(match("Newsletter from somewhere")).toBe("#00ff00");
  });

  it("returns the first match when multiple patterns could apply", () => {
    const match = buildColorMatcher({
      "#ff0000": "urgent",
      "#0000ff": "important",
    });
    // "urgent important" matches both; first defined color wins
    expect(match("urgent important message")).toBe("#ff0000");
  });

  it("handles empty patterns object", () => {
    const match = buildColorMatcher({});
    expect(match("anything")).toBeNull();
  });

  it("handles complex regex patterns", () => {
    const match = buildColorMatcher({ "#aabbcc": "^(re|fwd):" });
    expect(match("Re: your message")).toBe("#aabbcc");
    expect(match("Fwd: forwarded")).toBe("#aabbcc");
    expect(match("plain subject")).toBeNull();
  });

  it("returns null for empty string input when pattern requires content", () => {
    const match = buildColorMatcher({ "#123456": "\\w+" });
    expect(match("")).toBeNull();
  });

  it("returns a match for empty string when pattern allows it", () => {
    const match = buildColorMatcher({ "#abcdef": ".*" });
    expect(match("")).toBe("#abcdef");
  });
});
