/**
 * Restart check, session 1 of 2. Leaves one unopened and one opened file behind,
 * then VS Code exits. `write-offline-file.mjs` adds a file while it is closed,
 * and session 2 verifies everything survived.
 */
import * as assert from 'node:assert/strict';

import * as vscode from 'vscode';

import { emptyFolder, getApi, openInEditor, waitFor, writeExternally } from '../helpers';

suite('Restart (session 1: before closing VS Code)', () => {
  test('leaves tracked state behind', async () => {
    const api = await getApi();
    api.setIgnoreWindowFocus(true);
    await api.stop();
    await emptyFolder('scratch');
    await vscode.commands.executeCommand('fileFirstLook.startTracking');
    await api.idle();

    await writeExternally('scratch/unopened.ts');
    await writeExternally('scratch/opened.ts');
    await waitFor(
      () =>
        api.state().pending.has('scratch/unopened.ts') &&
        api.state().pending.has('scratch/opened.ts'),
      'files listed',
    );
    await openInEditor('scratch/opened.ts');
    await waitFor(() => api.state().opened.has('scratch/opened.ts'), 'file opened');
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');

    assert.deepEqual([...api.state().pending], ['scratch/unopened.ts']);
  });
});
