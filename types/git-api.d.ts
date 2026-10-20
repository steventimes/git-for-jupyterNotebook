/* Subset of microsoft/vscode 1.130.0 extensions/git/src/api/git.d.ts.
 * Copyright Microsoft Corporation. MIT, see VSCODE-LICENSE.txt.
 * Only the public members used here; unrelated proposed SCM types are omitted.
 */
import { Uri, Event, Disposable } from 'vscode';
export const enum Status {
  INDEX_RENAMED = 3,
  INTENT_TO_RENAME = 10,
}
export interface Change {
  readonly uri: Uri;
  readonly originalUri: Uri;
  readonly renameUri: Uri | undefined;
  readonly status: number;
}
export interface Repository {
  readonly rootUri: Uri;
  readonly state: {
    readonly HEAD: { readonly commit?: string } | undefined;
    readonly mergeChanges: Change[];
    readonly indexChanges: Change[];
    readonly workingTreeChanges: Change[];
    readonly onDidChange: Event<void>;
  };
}
export interface API {
  readonly state: 'uninitialized' | 'initialized';
  readonly onDidChangeState: Event<'uninitialized' | 'initialized'>;
  readonly git: { readonly path: string };
  readonly repositories: Repository[];
  readonly onDidOpenRepository: Event<Repository>;
  readonly onDidCloseRepository: Event<Repository>;
  getRepository(uri: Uri): Repository | null;
  openRepository(root: Uri): Promise<Repository | null>;
}
export interface GitExtension {
  readonly enabled: boolean;
  readonly onDidChangeEnablement: Event<boolean>;
  getAPI(version: 1): API;
}
export type GitSubscription = Disposable;
