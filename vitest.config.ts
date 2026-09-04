import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@taskchord/contracts": fileURLToPath(
        new URL("./packages/contracts/src/index.ts", import.meta.url),
      ),
      "@taskchord/doctor": fileURLToPath(
        new URL("./packages/doctor/src/index.ts", import.meta.url),
      ),
      "@taskchord/github": fileURLToPath(
        new URL("./packages/github/src/index.ts", import.meta.url),
      ),
      "@taskchord/proof": fileURLToPath(new URL("./packages/proof/src/index.ts", import.meta.url)),
      "@taskchord/runners": fileURLToPath(
        new URL("./packages/runners/src/index.ts", import.meta.url),
      ),
      "@taskchord/work": fileURLToPath(new URL("./packages/work/src/index.ts", import.meta.url)),
    },
  },
  test: {
    include: [
      "packages/**/*.test.ts",
      "apps/doctor-cli/**/*.test.ts",
      "apps/vscode-extension/src/**/*.test.ts",
      "tests/**/*.test.ts",
    ],
    exclude: ["**/node_modules/**", "**/dist/**", "apps/vscode-extension/src/test/**"],
    coverage: {
      enabled: false,
    },
  },
});
