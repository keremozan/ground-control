import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useLocalStorage } from "@/hooks/use-local-storage";

describe("useLocalStorage", () => {
  beforeEach(() => localStorage.clear());

  it("returns initial value when nothing stored", () => {
    const { result } = renderHook(() => useLocalStorage("key", "default"));
    expect(result.current[0]).toBe("default");
  });

  it("persists value to localStorage", () => {
    const { result } = renderHook(() => useLocalStorage("key", "default"));
    act(() => result.current[1]("updated"));
    expect(result.current[0]).toBe("updated");
    expect(JSON.parse(localStorage.getItem("key")!)).toBe("updated");
  });

  it("reads existing value from localStorage", () => {
    localStorage.setItem("key", JSON.stringify("existing"));
    const { result } = renderHook(() => useLocalStorage("key", "default"));
    expect(result.current[0]).toBe("existing");
  });

  it("handles objects", () => {
    const { result } = renderHook(() => useLocalStorage("key", { a: 1 }));
    act(() => result.current[1]({ a: 2 }));
    expect(result.current[0]).toEqual({ a: 2 });
  });

  it("handles functional updates", () => {
    const { result } = renderHook(() => useLocalStorage("count", 0));
    act(() => result.current[1]((prev) => prev + 1));
    expect(result.current[0]).toBe(1);
  });

  it("handles arrays", () => {
    const { result } = renderHook(() => useLocalStorage<string[]>("key", []));
    act(() => result.current[1](["a", "b"]));
    expect(result.current[0]).toEqual(["a", "b"]);
  });

  it("falls back to initial on corrupt JSON", () => {
    localStorage.setItem("key", "not-json{{{");
    const { result } = renderHook(() => useLocalStorage("key", "fallback"));
    expect(result.current[0]).toBe("fallback");
  });
});
