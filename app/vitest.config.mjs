import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Match Next's JSX handling: the automatic runtime, so components need no React import.
  esbuild: { jsx: "automatic" },
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.js"],
    include: ["**/*.test.{js,jsx}"],
    exclude: ["node_modules/**", ".next/**", "out/**"],
    restoreMocks: true,
  },
});
