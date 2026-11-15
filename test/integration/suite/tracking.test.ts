/**
 * End-to-end checks in a real VS Code instance. Each suite maps to an
 * acceptance check in the proposal (Start, Open, Persist, Exclusions/Deletes/Renames).
 */
import * as assert from 'node:assert/strict';

import * as vscode from 'vscode';

import type { TestApi } from '../../../src/extension';
import {
  delay,
  emptyFolder,
  getApi,
  openInEditor,
  removeExternally,
  uriOf,
  waitFor,
  writeExternally,
} from '../helpers';

/** Long enough for a watcher event and the delete-confirmation debounce to settle. */
const SETTLE_MS = 1000;

suite('File First Look', () => {
  let api: TestApi;

  const pending = (): string[] => [...api.state().pending].sort();
  const isPending = (rel: string): boolean => api.state().pending.has(rel);
  const isOpened = (rel: string): boolean => api.state().opened.has(rel);

  suiteSetup(async () => {
    api = await getApi();
    api.setIgnoreWindowFocus(true);
  });

  setup(async () => {
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    await api.stop();
    await emptyFolder('scratch');
    await delay(SETTLE_MS);
    await vscode.commands.executeCommand('fileFirstLook.startTracking');
    await api.idle();
  });

  suiteTeardown(async () => {
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    await api.stop();
    await emptyFolder('scratch');
  });

  suite('starting', () => {
    test('begins with an empty list in an existing project', () => {
      assert.equal(api.state().tracking, true);
      assert.deepEqual(pending(), []);
      assert.ok(api.state().baseline.has('src/existing.ts'));
    });

    test('lists each externally created file once, including nested folders', async () => {
      await writeExternally('scratch/top.ts');
      await writeExternally('scratch/deep/er/nested.ts');
      await waitFor(
        () => isPending('scratch/top.ts') && isPending('scratch/deep/er/nested.ts'),
        'new files listed',
      );
      assert.deepEqual(pending(), ['scratch/deep/er/nested.ts', 'scratch/top.ts']);
    });
  });

  suite('opening', () => {
    test('clears a file the first time it becomes the active editor', async () => {
      await writeExternally('scratch/open-me.ts');
      await waitFor(() => isPending('scratch/open-me.ts'), 'file listed');

      await openInEditor('scratch/open-me.ts');
      await waitFor(() => isOpened('scratch/open-me.ts'), 'file marked opened');
      assert.equal(isPending('scratch/open-me.ts'), false);
    });

    test('does not list a file that was opened before its watcher event arrived', async () => {
      await writeExternally('scratch/fast.ts');
      await openInEditor('scratch/fast.ts');
      await delay(SETTLE_MS);
      assert.equal(isPending('scratch/fast.ts'), false);
      assert.equal(isOpened('scratch/fast.ts'), true);
    });

    test('keeps an opened file off the list after it is edited', async () => {
      await writeExternally('scratch/edited.ts');
      await openInEditor('scratch/edited.ts');
      await waitFor(() => isOpened('scratch/edited.ts'), 'file marked opened');

      await writeExternally('scratch/edited.ts', '// changed by an agent\n');
      await delay(SETTLE_MS);
      assert.equal(isPending('scratch/edited.ts'), false);
    });

    test('keeps an unopened file on the list after it is edited', async () => {
      await writeExternally('scratch/untouched.ts');
      await waitFor(() => isPending('scratch/untouched.ts'), 'file listed');
      await writeExternally('scratch/untouched.ts', '// changed\n');
      await delay(SETTLE_MS);
      assert.equal(isPending('scratch/untouched.ts'), true);
    });

    test('does not count a diff view as opening the file', async () => {
      await writeExternally('scratch/diffed.ts', 'a\n');
      await waitFor(() => isPending('scratch/diffed.ts'), 'file listed');

      await vscode.commands.executeCommand(
        'vscode.diff',
        uriOf('src/existing.ts'),
        uriOf('scratch/diffed.ts'),
        'diff',
      );
      await delay(SETTLE_MS);
      assert.equal(isPending('scratch/diffed.ts'), true);
    });

    test('requires the file to stay in view for the minimum view time', async () => {
      // The fixture sets 0 so other tests run fast. Restore that exact value
      // afterwards: updating to `undefined` would delete it from the file.
      const config = vscode.workspace.getConfiguration('fileFirstLook');
      const previous = config.inspect<number>('minimumViewTime')?.workspaceValue;
      await config.update('minimumViewTime', 1500, vscode.ConfigurationTarget.Workspace);
      try {
        await writeExternally('scratch/glance.ts');
        await writeExternally('scratch/stay.ts');
        await waitFor(
          () => isPending('scratch/glance.ts') && isPending('scratch/stay.ts'),
          'listed',
        );

        await openInEditor('scratch/glance.ts');
        await delay(300);
        await openInEditor('scratch/stay.ts');
        await delay(2000);

        assert.equal(isPending('scratch/glance.ts'), true, 'a brief glance does not count');
        assert.equal(isOpened('scratch/stay.ts'), true, 'staying in view counts');
      } finally {
        await config.update('minimumViewTime', previous, vscode.ConfigurationTarget.Workspace);
      }
    });

    test('Mark as Opened clears a file without opening it', async () => {
      await writeExternally('scratch/manual.ts');
      await waitFor(() => isPending('scratch/manual.ts'), 'file listed');
      await vscode.commands.executeCommand('fileFirstLook.markOpened', 'scratch/manual.ts');
      assert.equal(isOpened('scratch/manual.ts'), true);
    });
  });

  suite('exclusions, deletes and renames', () => {
    test('never lists files in excluded folders', async () => {
      await writeExternally('scratch/node_modules/pkg/index.js');
      await writeExternally('scratch/visible.ts');
      await waitFor(() => isPending('scratch/visible.ts'), 'visible file listed');
      await delay(SETTLE_MS);
      assert.deepEqual(pending(), ['scratch/visible.ts']);
    });

    test('never lists files ignored by git', async () => {
      // The fixture's .gitignore contains `ignored-by-git/`.
      await writeExternally('scratch/ignored-by-git/secret.ts');
      await writeExternally('scratch/shown.ts');
      await waitFor(() => isPending('scratch/shown.ts'), 'visible file listed');
      await delay(SETTLE_MS);
      assert.deepEqual(pending(), ['scratch/shown.ts']);
    });

    test('removes deleted files from the list', async () => {
      await writeExternally('scratch/doomed.ts');
      await waitFor(() => isPending('scratch/doomed.ts'), 'file listed');
      await removeExternally('scratch/doomed.ts');
      await waitFor(() => !isPending('scratch/doomed.ts'), 'deleted file removed');
    });

    test('does not re-list a file you opened when it is deleted and comes back', async () => {
      // What a branch switch away and back, or git stash/pop, looks like on disk.
      await writeExternally('scratch/roundtrip.ts');
      await openInEditor('scratch/roundtrip.ts');
      await waitFor(() => isOpened('scratch/roundtrip.ts'), 'file marked opened');
      await vscode.commands.executeCommand('workbench.action.closeAllEditors');

      await removeExternally('scratch/roundtrip.ts');
      await delay(SETTLE_MS);
      await writeExternally('scratch/roundtrip.ts', '// restored\n');
      await delay(SETTLE_MS);
      assert.equal(isPending('scratch/roundtrip.ts'), false);
    });

    test('un-ignoring files via .gitignore does not flood the list', async () => {
      await writeExternally('scratch/.gitignore', 'hidden/\n');
      await writeExternally('scratch/hidden/old.ts');
      await waitFor(() => isPending('scratch/.gitignore'), 'rules file listed');
      await delay(SETTLE_MS);
      assert.equal(isPending('scratch/hidden/old.ts'), false, 'ignored while the rule exists');

      await removeExternally('scratch/.gitignore');
      await waitFor(() => api.state().baseline.has('scratch/hidden/old.ts'), 'rescope ran');
      assert.equal(isPending('scratch/hidden/old.ts'), false, 'joins the baseline, not the list');
    });

    test('keeps opened status when a file is renamed inside VS Code', async () => {
      await writeExternally('scratch/before.ts');
      await openInEditor('scratch/before.ts');
      await waitFor(() => isOpened('scratch/before.ts'), 'file marked opened');
      await vscode.commands.executeCommand('workbench.action.closeAllEditors');

      const edit = new vscode.WorkspaceEdit();
      edit.renameFile(uriOf('scratch/before.ts'), uriOf('scratch/after.ts'));
      assert.ok(await vscode.workspace.applyEdit(edit));
      await delay(SETTLE_MS);

      assert.equal(isOpened('scratch/after.ts'), true);
      assert.equal(isPending('scratch/after.ts'), false);
    });
  });

  suite('reconciling', () => {
    // "Added while VS Code was closed" is covered by the core unit tests
    // (reduce → reconciled) and by the manual release checklist, because a real
    // restart can't be simulated reliably here.
    test('Refresh keeps the list consistent with what is on disk', async () => {
      await writeExternally('scratch/kept.ts');
      await writeExternally('scratch/also-kept.ts');
      await waitFor(
        () => isPending('scratch/kept.ts') && isPending('scratch/also-kept.ts'),
        'files listed',
      );
      const baselineSize = api.state().baseline.size;

      await vscode.commands.executeCommand('fileFirstLook.refresh');
      await api.idle();

      assert.deepEqual(pending(), ['scratch/also-kept.ts', 'scratch/kept.ts']);
      assert.equal(api.state().baseline.size, baselineSize);
    });
  });
});
