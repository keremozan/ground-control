import { describe, it, expect } from "vitest";
import { requireFields, validateName } from "@/lib/api-helpers";

describe("requireFields", () => {
  it("returns null when all required fields are present", () => {
    const body = { name: "hello", value: "world" };
    expect(requireFields(body, ["name", "value"])).toBeNull();
  });

  it("returns an error message when a field is missing (undefined)", () => {
    const body = { name: "hello" } as { name: string; value?: string };
    expect(requireFields(body, ["name", "value"])).toBe("value is required");
  });

  it("returns an error message when a field is null", () => {
    const body = { name: "hello", value: null } as unknown as { name: string; value: string };
    expect(requireFields(body, ["name", "value"])).toBe("value is required");
  });

  it("returns an error message when a string field is empty", () => {
    const body = { name: "hello", value: "" };
    expect(requireFields(body, ["name", "value"])).toBe("value is required");
  });

  it("returns an error message when a string field is only whitespace", () => {
    const body = { name: "hello", value: "   " };
    expect(requireFields(body, ["name", "value"])).toBe("value is required");
  });

  it("returns null for an empty fields array", () => {
    const body = { name: "hello" };
    expect(requireFields(body, [])).toBeNull();
  });

  it("reports the first missing field when multiple are absent", () => {
    const body = {} as { name?: string; value?: string };
    expect(requireFields(body, ["name", "value"])).toBe("name is required");
  });

  it("accepts non-string truthy values (numbers, booleans)", () => {
    const body = { count: 0, flag: false };
    // 0 and false are not undefined/null and not strings — should be accepted
    expect(requireFields(body, ["count", "flag"])).toBeNull();
  });
});

describe("validateName", () => {
  it("accepts lowercase letters", () => {
    expect(validateName("hello")).toBeNull();
  });

  it("accepts lowercase letters with hyphens and numbers", () => {
    expect(validateName("my-widget-2")).toBeNull();
  });

  it("accepts a single character", () => {
    expect(validateName("a")).toBeNull();
  });

  it("rejects an empty string", () => {
    expect(validateName("")).toBe("Invalid name");
  });

  it("rejects names with spaces", () => {
    expect(validateName("hello world")).toBe("Invalid name");
  });

  it("rejects names with uppercase letters", () => {
    expect(validateName("MyWidget")).toBe("Invalid name");
  });

  it("rejects names with path traversal characters", () => {
    expect(validateName("../etc/passwd")).toBe("Invalid name");
    expect(validateName("foo/bar")).toBe("Invalid name");
  });

  it("rejects names with special characters", () => {
    expect(validateName("hello@world")).toBe("Invalid name");
    expect(validateName("name_with_underscore")).toBe("Invalid name");
  });
});
