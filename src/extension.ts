import * as vscode from 'vscode';
import { Controller } from './controller';

export function activate(context: vscode.ExtensionContext) {
  const controller = new Controller(context);
  context.subscriptions.push(controller);
  return { snapshot: () => controller.snapshot() };
}
