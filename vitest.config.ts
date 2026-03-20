import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./tests/setup.ts"],
    environmentOptions: {
      jsdom: {
        url: "http://localhost",
      },
    },
  },
  resolve: {
    alias: { "@": path.resolve(__dirname) },
  },
});
