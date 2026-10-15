import * as vscode from 'vscode';
import { BaselineMode } from './gitReader';
export interface Config { enabled: boolean; baseline: BaselineMode; debounceMs: number; showCellSummary: boolean }
export function config(uri?: vscode.Uri): Config {
  const values = vscode.workspace.getConfiguration('notebookGitGutter', uri);
  const delay = values.get<number>('debounceMs', 200);
  return { enabled: values.get<boolean>('enabled', true), baseline: values.get<string>('baseline', 'HEAD') === 'index' ? 'index' : 'HEAD',
    debounceMs: Number.isFinite(delay) ? Math.min(2000, Math.max(0, delay)) : 200,
    showCellSummary: values.get<boolean>('showCellSummary', true) };
}
