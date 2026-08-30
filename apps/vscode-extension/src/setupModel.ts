import type { CheckStatus, DoctorReport } from "@taskchord/contracts";
import { environmentDisplayName } from "@taskchord/doctor";
import type { OptionalRunnerReport } from "@taskchord/runners";

export interface SetupItemModel {
  id: string;
  label: string;
  description: string;
  status: CheckStatus;
  targetId: string;
  targetLabel: string;
  tooltip: string;
}

function runnerStatus(availability: string): CheckStatus {
  return availability === "ready" || availability === "supported" ? "ready" : "unverified";
}

function toRunnerItems(report: OptionalRunnerReport | undefined): SetupItemModel[] {
  if (report === undefined) return [];
  const { symphony, codexAppServer } = report;
  const symphonyDescription = [
    symphony.availability.toUpperCase(),
    symphony.availability === "ready"
      ? symphony.freshness.toUpperCase()
      : "NATIVE HANDOFF AVAILABLE",
  ].join(" · ");
  const count = (name: "running" | "blocked" | "retrying"): string =>
    symphony.counts[name] === undefined ? "unknown" : String(symphony.counts[name]);
  const associations = symphony.associations;
  const codexDescription = [
    codexAppServer.availability.toUpperCase(),
    codexAppServer.availability === "supported" ? "NOT CONNECTED" : "NATIVE HANDOFF AVAILABLE",
  ].join(" · ");
  return [
    {
      id: "runner-symphony",
      label: "Symphony state (preview, read-only)",
      description: symphonyDescription,
      status: runnerStatus(symphony.availability),
      targetId: "optional-runner",
      targetLabel: "Optional runner",
      tooltip: [
        `Availability: ${symphony.availability}`,
        `Endpoint: ${symphony.endpoint}`,
        `Freshness: ${symphony.freshness}`,
        `Observed: ${symphony.observedAt}`,
        ...(symphony.generatedAt === undefined ? [] : [`Generated: ${symphony.generatedAt}`]),
        ...(symphony.latencyMs === undefined ? [] : [`Latency: ${symphony.latencyMs} ms`]),
        `Instance-wide running: ${count("running")}`,
        `Instance-wide blocked: ${count("blocked")}`,
        `Instance-wide retrying: ${count("retrying")}`,
        `Repository association — current: ${associations.current}, other: ${associations.other}, unknown: ${associations.unknown}`,
        ...(associations.truncated ? ["Repository association list was truncated."] : []),
        ...(symphony.reason === undefined ? [] : [`Message: ${symphony.reason}`]),
        "Fallback: Native Codex handoff remains available.",
      ].join("\n"),
    },
    {
      id: "runner-codex-app-server",
      label: "Codex App Server (not connected)",
      description: codexDescription,
      status: runnerStatus(codexAppServer.availability),
      targetId: "optional-runner",
      targetLabel: "Optional runner",
      tooltip: [
        `Availability: ${codexAppServer.availability}`,
        ...(codexAppServer.codexVersion === undefined
          ? []
          : [`Codex version: ${codexAppServer.codexVersion}`]),
        ...(codexAppServer.reason === undefined ? [] : [`Message: ${codexAppServer.reason}`]),
        "TaskChord does not start or connect to Codex App Server in this slice.",
        "Fallback: Native Codex handoff remains available.",
      ].join("\n"),
    },
  ];
}

export function toSetupItems(
  report: DoctorReport | undefined,
  runners?: OptionalRunnerReport,
): SetupItemModel[] {
  if (report === undefined) return toRunnerItems(runners);

  const executionEnvironment = environmentDisplayName(report.environment.kind);
  const targetLabels = new Map(report.targets.map((target) => [target.id, target.label]));

  const doctorItems = report.checks.map((check) => {
    const evidence = Object.entries(check.evidence).map(([key, value]) => `${key}: ${value}`);

    const targetLabel = targetLabels.get(check.targetId) ?? check.targetId;

    return {
      id: check.id,
      label: check.label,
      description: check.status.toUpperCase(),
      status: check.status,
      targetId: check.targetId,
      targetLabel,
      tooltip: [
        `Status: ${check.status}`,
        `Target: ${targetLabel}`,
        `Source: ${check.source}`,
        `Message: ${check.message}`,
        `Doctor environment: ${executionEnvironment}`,
        ...evidence,
        ...(check.nextAction === undefined ? [] : [`Next action: ${check.nextAction}`]),
      ].join("\n"),
    };
  });
  return [...doctorItems, ...toRunnerItems(runners)];
}
