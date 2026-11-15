import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import * as vscode from 'vscode';

import type { TestApi } from '../../src/extension';

export const EXTENSION_ID = 'file-first-look.file-first-look';

export async function getApi(): Promise<TestApi> {
  const extension = vscode.extensions.getExtension<TestApi | undefined>(EXTENSION_ID);
  if (extension === undefined) {
    throw new Error(`Extension ${EXTENSION_ID} not found`);
  }
  const api = await extension.activate();
  if (api === undefined) {
    throw new Error('Extension did not activate with a workspace folder');
  }
  return api;
}

export function folderUri(): vscode.Uri {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (folder === undefined) {
    throw new Error('No workspace folder');
  }
  return folder.uri;
}

export function uriOf(rel: string): vscode.Uri {
  return vscode.Uri.joinPath(folderUri(), rel);
}

/**
 * Writes with Node's `fs`, not the VS Code API, to behave like an external
 * agent CLI (whose writes `workspace.onDidCreateFiles` never sees).
 */
export async function writeExternally(rel: string, content = '// generated\n'): Promise<void> {
  const target = path.join(folderUri().fsPath, rel);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, content);
}

/**
 * Windows briefly locks files and folders that VS Code is watching or has open,
 * so deletes retry on EBUSY/EPERM instead of failing the test.
 */
const RM_OPTIONS = { recursive: true, force: true, maxRetries: 10, retryDelay: 200 } as const;

export async function removeExternally(rel: string): Promise<void> {
  await fs.rm(path.join(folderUri().fsPath, rel), RM_OPTIONS);
}

/**
 * Empties a folder but keeps the folder itself. Removing a watched folder on
 * Windows can fail with EBUSY even after retries; its contents can be removed.
 */
export async function emptyFolder(rel: string): Promise<void> {
  const dir = path.join(folderUri().fsPath, rel);
  const entries = await fs.readdir(dir).catch(() => [] as string[]);
  await Promise.all(entries.map((entry) => fs.rm(path.join(dir, entry), RM_OPTIONS)));
}

export async function openInEditor(rel: string): Promise<void> {
  const document = await vscode.workspace.openTextDocument(uriOf(rel));
  await vscode.window.showTextDocument(document, { preview: false });
}

/** Polls until `predicate` holds, failing with `message` after `timeoutMs`. */
export async function waitFor(
  predicate: () => boolean,
  message: string,
  timeoutMs = 8000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() > deadline) {
      throw new Error(`Timed out: ${message}`);
    }
    await delay(50);
  }
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
