import "@testing-library/jest-dom/vitest";

// Node.js 25 exposes a built-in globalThis.localStorage stub that lacks the
// full Storage API (no .clear, .key, etc.). Replace it with a proper in-memory
// implementation so tests that depend on localStorage work correctly.
const createLocalStorageMock = () => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = String(value);
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
    get length() {
      return Object.keys(store).length;
    },
    key: (index: number) => Object.keys(store)[index] ?? null,
  };
};

Object.defineProperty(globalThis, "localStorage", {
  value: createLocalStorageMock(),
  writable: true,
});
