import type { DoctorTarget } from "@taskchord/contracts";
import type { ProbeRequest, ProcessProbe } from "./probe.js";
import { summarizeOutput } from "./redaction.js";

export interface WslExecutionTarget {
  target: DoctorTarget;
  probe: ProcessProbe;
  workspaceRoot: string | undefined;
}

const WSL_LINUX_PATH = "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin";

function isUserDistribution(distribution: string): boolean {
  return !/^docker-desktop(?:-data)?$/iu.test(distribution);
}

export function parseWslDistributions(output: string): string[] {
  return [
    ...new Set(
      output
        .replaceAll("\0", "")
        .split(/\r?\n/u)
        .map((line) => line.trim())
        .filter((line) => line.length > 0),
    ),
  ];
}

export function toWslPath(path: string): string | undefined {
  const drivePath = /^([A-Za-z]):\\(.*)$/u.exec(path);
  if (drivePath !== null) {
    const drive = drivePath[1]?.toLowerCase();
    const rest = drivePath[2]?.replaceAll("\\", "/");
    return drive === undefined || rest === undefined ? undefined : `/mnt/${drive}/${rest}`;
  }

  const uncPath = /^\\\\(?:wsl\$|wsl\.localhost)\\[^\\]+\\(.*)$/iu.exec(path);
  if (uncPath !== null) {
    return `/${(uncPath[1] ?? "").replaceAll("\\", "/")}`;
  }
  return path.startsWith("/") ? path : undefined;
}

export function createWslProcessProbe(hostProbe: ProcessProbe, distribution: string): ProcessProbe {
  return {
    run(request: ProbeRequest) {
      if (request.command === "wsl") {
        return Promise.resolve({
          outcome: "denied",
          exitCode: null,
          stdout: "",
          stderr: "",
          durationMs: 0,
        });
      }
      const args = ["-d", distribution];
      if (request.cwd !== undefined) {
        const wslCwd = toWslPath(request.cwd);
        if (wslCwd === undefined) {
          return Promise.resolve({
            outcome: "denied",
            exitCode: null,
            stdout: "",
            stderr: "",
            durationMs: 0,
          });
        }
        args.push("--cd", wslCwd);
      }
      args.push("--", "env", `PATH=${WSL_LINUX_PATH}`, request.command, ...request.args);
      return hostProbe.run({
        command: "wsl",
        args,
        timeoutMs: request.timeoutMs,
        ...(request.signal === undefined ? {} : { signal: request.signal }),
      });
    },
  };
}

export async function discoverWslTargets(
  hostProbe: ProcessProbe,
  workspaceRoot: string | undefined,
): Promise<WslExecutionTarget[]> {
  const list = await hostProbe.run({ command: "wsl", args: ["-l", "-q"], timeoutMs: 5_000 });
  if (list.outcome !== "completed" || list.exitCode !== 0) {
    return [];
  }

  const targets: WslExecutionTarget[] = [];
  for (const distribution of parseWslDistributions(list.stdout).filter(isUserDistribution)) {
    const [release, architecture] = await Promise.all([
      hostProbe.run({
        command: "wsl",
        args: ["-d", distribution, "--", "/usr/bin/uname", "-r"],
        timeoutMs: 3_000,
      }),
      hostProbe.run({
        command: "wsl",
        args: ["-d", distribution, "--", "/usr/bin/uname", "-m"],
        timeoutMs: 3_000,
      }),
    ]);
    const releaseValue =
      release.outcome === "completed" && release.exitCode === 0
        ? summarizeOutput(release.stdout)
        : "unknown";
    const architectureValue =
      architecture.outcome === "completed" && architecture.exitCode === 0
        ? summarizeOutput(architecture.stdout)
        : "unknown";
    const safeId = distribution.toLowerCase().replace(/[^a-z0-9._-]+/gu, "-");
    targets.push({
      target: {
        id: `wsl:${safeId}`,
        kind: "wsl",
        label: `WSL (${distribution})`,
        facts: {
          kind: "wsl",
          platform: "linux",
          architecture: architectureValue,
          release: releaseValue,
        },
      },
      probe: createWslProcessProbe(hostProbe, distribution),
      workspaceRoot: workspaceRoot === undefined ? undefined : toWslPath(workspaceRoot),
    });
  }
  return targets;
}
