import type { DoctorReport } from "@taskchord/contracts";
import { runDoctor } from "@taskchord/doctor";

export const CLI_VERSION = "0.0.1";

export interface CliExecution {
  exitCode: 0 | 1 | 2;
  stdout: string;
  stderr: string;
  report?: DoctorReport;
}

export type DoctorRunner = () => DoctorReport;

const HELP = `TaskChord ${CLI_VERSION}

Usage:
  taskchord doctor [--json]
  taskchord --help
  taskchord --version

Commands:
  doctor      Run the read-only environment check.

Options:
  --json      Print the DoctorReport as JSON.
  --help      Show help.
  --version   Show the CLI version.
`;

function formatDoctorText(report: DoctorReport): string {
  const status = report.summary.status.toUpperCase();
  const kind = report.environment.kind === "macos" ? "macOS" : report.environment.kind;

  return `TaskChord Doctor

Environment:  ${kind}
Platform:     ${report.environment.platform}
Architecture: ${report.environment.architecture}
Release:      ${report.environment.release}
Status:       ${status}
`;
}

function exitCodeFor(report: DoctorReport): 0 | 1 {
  return report.summary.status === "ready" ? 0 : 1;
}

export function executeCli(
  args: readonly string[],
  doctor: DoctorRunner = runDoctor,
): CliExecution {
  if (args.length === 0 || args[0] === "--help") {
    return { exitCode: 0, stdout: HELP, stderr: "" };
  }

  if (args[0] === "--version") {
    return { exitCode: 0, stdout: `${CLI_VERSION}\n`, stderr: "" };
  }

  if (args[0] !== "doctor") {
    return {
      exitCode: 2,
      stdout: "",
      stderr: `Unknown command: ${args[0]}\nRun taskchord --help for usage.\n`,
    };
  }

  const options = args.slice(1);
  if (options.includes("--help")) {
    return { exitCode: 0, stdout: HELP, stderr: "" };
  }

  const invalidOption = options.find((option) => option !== "--json");
  if (invalidOption !== undefined) {
    return {
      exitCode: 2,
      stdout: "",
      stderr: `Unknown option for doctor: ${invalidOption}\nRun taskchord doctor --help for usage.\n`,
    };
  }

  const report = doctor();
  return {
    exitCode: exitCodeFor(report),
    stdout: options.includes("--json")
      ? `${JSON.stringify(report, null, 2)}\n`
      : formatDoctorText(report),
    stderr: "",
    report,
  };
}
