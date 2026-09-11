import type * as vscode from "vscode";

export interface EditorColumnCell {
  readonly value: string;
  readonly editable?: boolean;
}

export interface EditorColumnProvider {
  readonly id: string;
  readonly label?: string;
  readonly width?: number;
  readonly selector?: vscode.DocumentSelector;
  provideCell(document: vscode.TextDocument, line: number): EditorColumnCell | undefined | Promise<EditorColumnCell | undefined>;
  onDidChangeCell?(document: vscode.TextDocument, line: number, value: string): void | Promise<void>;
}

export interface EditorColumnsApi {
  readonly apiVersion: 1;
  isWorkbenchBridgeInstalled(): Promise<boolean>;
  registerColumnProvider(provider: EditorColumnProvider): vscode.Disposable;
}
