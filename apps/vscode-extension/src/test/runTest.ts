import { spawn } from "node:child_process";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { downloadAndUnzipVSCode, runTests } from "@vscode/test-electron";

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const extensionDevelopmentPath = path.resolve(currentDirectory, "../..");
const repositoryRoot = path.resolve(extensionDevelopmentPath, "../..");
const extensionTestsPath = path.resolve(extensionDevelopmentPath, "dist/test/suite/index.cjs");

async function runUntrustedTests(testDataRoot: string): Promise<void> {
  const workspacePath = path.join(testDataRoot, "untrusted-workspace");
  await mkdir(workspacePath, { recursive: true });
  const executable = await downloadAndUnzipVSCode("1.134.0");
  const args = [
    workspacePath,
    "--disable-extensions",
    "--user-data-dir",
    path.join(testDataRoot, "untrusted-user-data"),
    "--extensions-dir",
    path.join(testDataRoot, "untrusted-extensions"),
    "--no-sandbox",
    "--disable-gpu-sandbox",
    "--disable-updates",
    "--skip-welcome",
    "--skip-release-notes",
    "--no-cached-data",
    `--extensionTestsPath=${extensionTestsPath}`,
    `--extensionDevelopmentPath=${extensionDevelopmentPath}`,
  ];
  await new Promise<void>((resolve, reject) => {
    const child = spawn(executable, args, {
      env: { ...process.env, TASKCHORD_SMOKE_MODE: "untrusted" },
      stdio: "inherit",
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`Untrusted extension smoke failed (code=${code}, signal=${signal}).`));
    });
  });
}

const testDataRoot = await mkdtemp(path.join(tmpdir(), "taskchord-extension-smoke-"));

try {
  await runTests({
    version: "1.134.0",
    extensionDevelopmentPath,
    extensionTestsPath,
    extensionTestsEnv: { TASKCHORD_SMOKE_MODE: "trusted" },
    launchArgs: [
      repositoryRoot,
      "--disable-extensions",
      "--disable-workspace-trust",
      "--user-data-dir",
      path.join(testDataRoot, "trusted"),
    ],
  });
  await runUntrustedTests(testDataRoot);
} catch (error) {
  console.error("TaskChord extension integration tests failed.", error);
  process.exitCode = 1;
} finally {
  await rm(testDataRoot, { recursive: true, force: true });
}
