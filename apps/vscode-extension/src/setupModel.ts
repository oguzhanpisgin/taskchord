import type { CheckStatus, DoctorReport } from "@taskchord/contracts";
import { environmentDisplayName } from "@taskchord/doctor";

export interface SetupItemModel {
  id: string;
  label: string;
  description: string;
  status: CheckStatus;
  tooltip: string;
}

export function toSetupItems(report: DoctorReport | undefined): SetupItemModel[] {
  if (report === undefined) {
    return [];
  }

  const executionEnvironment = environmentDisplayName(report.environment.kind);

  return report.checks.map((check) => {
    const evidence = Object.entries(check.evidence).map(([key, value]) => `${key}: ${value}`);

    return {
      id: check.id,
      label: check.label,
      description: check.status.toUpperCase(),
      status: check.status,
      tooltip: [
        `Status: ${check.status}`,
        `Message: ${check.message}`,
        `Doctor environment: ${executionEnvironment}`,
        ...evidence,
      ].join("\n"),
    };
  });
}
