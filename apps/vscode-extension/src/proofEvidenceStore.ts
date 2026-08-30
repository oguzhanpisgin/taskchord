import type { HumanDecisionRecord, VerificationRunRecord } from "@taskchord/proof";
import type * as vscode from "vscode";

const PROOF_EVIDENCE_KEY = "taskchord.proofEvidence.v1";

export interface StoredProofEvidence {
  build?: VerificationRunRecord;
  tests?: VerificationRunRecord;
  humanDecision?: HumanDecisionRecord;
}

function evidenceKey(subject: {
  workspaceFolderUri: string;
  repository: string;
  branch: string;
}): string {
  return JSON.stringify([subject.workspaceFolderUri, subject.repository, subject.branch]);
}

export class ProofEvidenceStore {
  constructor(private readonly context: vscode.ExtensionContext) {}

  get(subject: {
    workspaceFolderUri: string;
    repository: string;
    branch: string;
  }): StoredProofEvidence {
    const all = this.context.workspaceState.get<Record<string, StoredProofEvidence>>(
      PROOF_EVIDENCE_KEY,
      {},
    );
    return all[evidenceKey(subject)] ?? {};
  }

  async setRun(
    subject: { workspaceFolderUri: string; repository: string; branch: string },
    run: VerificationRunRecord,
  ): Promise<void> {
    const all = {
      ...this.context.workspaceState.get<Record<string, StoredProofEvidence>>(
        PROOF_EVIDENCE_KEY,
        {},
      ),
    };
    const key = evidenceKey(subject);
    const current = all[key] ?? {};
    all[key] = run.kind === "build" ? { ...current, build: run } : { ...current, tests: run };
    await this.context.workspaceState.update(PROOF_EVIDENCE_KEY, all);
  }

  async setHumanDecision(
    subject: { workspaceFolderUri: string; repository: string; branch: string },
    decision: HumanDecisionRecord | undefined,
  ): Promise<void> {
    const all = {
      ...this.context.workspaceState.get<Record<string, StoredProofEvidence>>(
        PROOF_EVIDENCE_KEY,
        {},
      ),
    };
    const key = evidenceKey(subject);
    const current = all[key] ?? {};
    if (decision === undefined) {
      const { humanDecision: _removed, ...remaining } = current;
      all[key] = remaining;
    } else {
      all[key] = { ...current, humanDecision: decision };
    }
    await this.context.workspaceState.update(PROOF_EVIDENCE_KEY, all);
  }
}
