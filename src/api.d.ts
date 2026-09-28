import type * as vscode from "vscode";

export interface EditorColumnCell {
  /** Zero-based source line containing this cell. */
  readonly line: number;
  readonly value: string;
  readonly editable?: boolean;
  /** Optional HTML input pattern for editable values. */
  readonly pattern?: string;
}

export interface EditorColumnRange {
  /** Inclusive zero-based source line. */
  readonly start: number;
  /** Exclusive zero-based source line. */
  readonly end: number;
}

export interface EditorColumnCellBatch {
  readonly cells: readonly EditorColumnCell[];
}

export interface EditorColumnChange {
  readonly document?: vscode.Uri;
  readonly range?: EditorColumnRange;
}

export interface EditorColumnEdit {
  /** Zero-based source line being edited. */
  readonly line: number;
  readonly value: string;
}

export interface EditorColumnProvider {
  readonly id: string;
  readonly label?: string;
  readonly width?: number;
  readonly order?: number;
  readonly selector?: vscode.DocumentSelector;
  /** Fetch all document lines once when practical; later scrolls use cached cells. */
  readonly prefetch?: "document";
  readonly onDidChangeCells?: vscode.Event<EditorColumnChange>;
  provideCells(document: vscode.TextDocument, range: EditorColumnRange, token: vscode.CancellationToken):
    EditorColumnCellBatch | Promise<EditorColumnCellBatch>;
  applyEdit?(document: vscode.TextDocument, edit: EditorColumnEdit, token: vscode.CancellationToken): void | Promise<void>;
}

export interface EditorColumnsApi {
  readonly apiVersion: 2;
  isWorkbenchBridgeInstalled(): Promise<boolean>;
  registerColumnProvider(provider: EditorColumnProvider): vscode.Disposable;
}
