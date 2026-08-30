import * as vscode from "vscode";

export class PreviewDocumentProvider implements vscode.TextDocumentContentProvider {
  readonly #onDidChange = new vscode.EventEmitter<vscode.Uri>();
  readonly onDidChange = this.#onDidChange.event;
  readonly #content = new Map<string, string>();

  set(id: string, content: string): vscode.Uri {
    const uri = vscode.Uri.parse(`taskchord-preview:${id}.md`);
    this.#content.set(uri.toString(), content);
    this.#onDidChange.fire(uri);
    return uri;
  }

  provideTextDocumentContent(uri: vscode.Uri): string {
    return this.#content.get(uri.toString()) ?? "Preview is no longer available.";
  }
}
