import type { CheckStatus, DoctorReport } from "@taskchord/contracts";
import { environmentDisplayName } from "@taskchord/doctor";

export interface SetupItemModel {
  id: string;
  label: string;
  description: string;
  status: CheckStatus;
  targetId: string;
  targetLabel: string;
  tooltip: string;
}

export function toSetupItems(report: DoctorReport | undefined): SetupItemModel[] {
  if (report === undefined) {
    return [];
  }

  const executionEnvironment = environmentDisplayName(report.environment.kind);
  const targetLabels = new Map(report.targets.map((target) => [target.id, target.label]));

  return report.checks.map((check) => {
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
}
