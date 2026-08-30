import path from "node:path";
import { fileURLToPath } from "node:url";
import { runTests } from "@vscode/test-electron";

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const extensionDevelopmentPath = path.resolve(currentDirectory, "../..");
const extensionTestsPath = path.resolve(extensionDevelopmentPath, "dist/test/suite/index.cjs");

try {
  await runTests({
    version: "1.134.0",
    extensionDevelopmentPath,
    extensionTestsPath,
    launchArgs: ["--disable-extensions"],
  });
} catch (error) {
  console.error("TaskChord extension integration tests failed.", error);
  process.exitCode = 1;
}
