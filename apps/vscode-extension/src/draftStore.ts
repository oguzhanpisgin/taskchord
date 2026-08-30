import type { RemoteIssue, RepositoryRef } from "@taskchord/contracts";
import * as vscode from "vscode";

const DRAFTS_KEY = "taskchord.contractDrafts.v1";

export interface DraftMetadata {
  id: string;
  uri: string;
  mode: "create" | "edit";
  repository: RepositoryRef;
  issueNumber?: number;
  baseTitle?: string;
  baseBody?: string;
}

export class DraftStore {
  readonly #context: vscode.ExtensionContext;

  constructor(context: vscode.ExtensionContext) {
    this.#context = context;
  }

  all(): DraftMetadata[] {
    return this.#context.workspaceState.get<DraftMetadata[]>(DRAFTS_KEY, []);
  }

  find(uri: vscode.Uri): DraftMetadata | undefined {
    return this.all().find((draft) => draft.uri === uri.toString());
  }

  async create(
    id: string,
    repository: RepositoryRef,
    content: string,
    issue?: RemoteIssue,
  ): Promise<DraftMetadata> {
    const storage = this.#context.storageUri;
    if (storage === undefined) {
      throw new Error("Open a workspace before creating a TaskChord draft.");
    }
    const directory = vscode.Uri.joinPath(storage, "drafts");
    await vscode.workspace.fs.createDirectory(directory);
    const uri = vscode.Uri.joinPath(directory, `${id}.md`);
    await vscode.workspace.fs.writeFile(uri, Buffer.from(content, "utf8"));
    const metadata: DraftMetadata = {
      id,
      uri: uri.toString(),
      mode: issue === undefined ? "create" : "edit",
      repository,
      ...(issue === undefined
        ? {}
        : { issueNumber: issue.number, baseTitle: issue.title, baseBody: issue.body }),
    };
    const drafts = this.all().filter((draft) => draft.id !== id);
    drafts.push(metadata);
    await this.#context.workspaceState.update(DRAFTS_KEY, drafts);
    return metadata;
  }

  async remove(draft: DraftMetadata): Promise<void> {
    await this.#context.workspaceState.update(
      DRAFTS_KEY,
      this.all().filter((candidate) => candidate.id !== draft.id),
    );
    await vscode.workspace.fs.delete(vscode.Uri.parse(draft.uri), { useTrash: false });
  }

  async open(draft: DraftMetadata): Promise<vscode.TextDocument> {
    const document = await vscode.workspace.openTextDocument(vscode.Uri.parse(draft.uri));
    await vscode.window.showTextDocument(document, { preview: false });
    return document;
  }
}
