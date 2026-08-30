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
    },
  },
  test: {
    include: ["packages/**/*.test.ts", "apps/doctor-cli/**/*.test.ts"],
    coverage: {
      enabled: false,
    },
  },
});
