/**
 * Composition root (ADR 0001). This file only wires adapters to the core and
 * registers commands; all tracking rules live in `src/core`.
 */
import * as vscode from 'vscode';

import {
  createPathFilter,
  Tracker,
  type PathFilter,
  type RelPath,
  type TrackingState,
} from './core';
import { readSettings, SECTION } from './adapters/configuration';
import { FileWatcher } from './adapters/fileWatcher';
import { GitIgnore } from './adapters/gitIgnore';
import { StateStore } from './adapters/stateStore';
import { relPathOf } from './adapters/uris';
import { UnopenedFilesView, OPEN_COMMAND } from './adapters/unopenedFilesView';
import { VisitTracker } from './adapters/visitTracker';
import { createScanner } from './adapters/workspaceScanner';

/**
 * Exposed for integration tests only. Not a supported public API; it may
 * change in any release.
 */
export interface TestApi {
  readonly state: () => TrackingState;
  readonly idle: () => Promise<void>;
  /** Stops tracking without the confirmation dialog. */
  readonly stop: () => Promise<void>;
  /** Headless test windows may never be OS-focused; this lets visits count anyway. */
  readonly setIgnoreWindowFocus: (ignore: boolean) => void;
}

let store: StateStore | undefined;

export async function activate(context: vscode.ExtensionContext): Promise<TestApi | undefined> {
  const log = vscode.window.createOutputChannel('File First Look', { log: true });
  context.subscriptions.push(log);

  const folder = singleLocalFolder();
  await setContext('fileFirstLook.supported', folder !== undefined);

  const view = new UnopenedFilesView(folder);
  context.subscriptions.push(view);
  if (folder === undefined) {
    log.info('Inactive: File First Look supports exactly one local workspace folder.');
    return undefined;
  }

  // --- Settings -----------------------------------------------------------------
  let settings = readSettings(folder);
  let filter: PathFilter = createPathFilter(settings.exclude);
  const getFilter = (): PathFilter => filter;

  // Detected once; `respectGitIgnore` decides whether it is used.
  const detectedGit = await GitIgnore.detect(folder.uri.fsPath);
  const getGit = (): GitIgnore | undefined => (settings.respectGitIgnore ? detectedGit : undefined);
  log.info(
    detectedGit
      ? 'Git repository detected: .gitignore rules apply (fileFirstLook.respectGitIgnore).'
      : 'No git repository: using the exclusion list only.',
  );

  // --- Core ---------------------------------------------------------------------
  store = new StateStore(context.workspaceState);
  const loaded = store.load();
  if (loaded.problem !== undefined) {
    log.warn(`Discarded stored state: ${loaded.problem}`);
  }

  const scan = createScanner(folder, getFilter, getGit);
  const tracker = new Tracker(loaded.state, {
    scan: async () => {
      const started = Date.now();
      const paths = await scan();
      log.info(`Scanned ${paths.length} eligible files in ${Date.now() - started} ms.`);
      return paths;
    },
    save: (state) => {
      store?.save(state);
    },
    now: () => Date.now(),
  });
  context.subscriptions.push(store);

  const reportError = (error: unknown): void => {
    log.error(error instanceof Error ? error : String(error));
  };
  const dispatch = (event: Parameters<Tracker['dispatch']>[0]): void => {
    tracker.dispatch(event).catch(reportError);
  };

  // --- Adapters -----------------------------------------------------------------
  // The watcher only runs while tracking, so an idle extension costs nothing.
  let watcher: FileWatcher | undefined;
  const syncWatcher = (state: TrackingState): void => {
    if (state.tracking && watcher === undefined) {
      watcher = new FileWatcher(folder, getFilter, scan, getGit, dispatch, reportError);
    } else if (!state.tracking && watcher !== undefined) {
      watcher.dispose();
      watcher = undefined;
    }
  };
  context.subscriptions.push({ dispose: () => watcher?.dispose() });

  const render = (state: TrackingState): void => {
    view.update(state);
    syncWatcher(state);
    void setContext('fileFirstLook.tracking', state.tracking);
  };
  context.subscriptions.push(tracker.onDidChange(render));
  render(tracker.state);

  let ignoreWindowFocus = false;
  const visits = new VisitTracker(
    folder,
    getFilter,
    () => settings.minimumViewTime,
    (path) => {
      dispatch({ type: 'visited', path });
    },
    () => ignoreWindowFocus || vscode.window.state.focused,
  );
  context.subscriptions.push(visits);

  // Renames done inside VS Code also surface as watcher delete + create. Moving
  // membership *before* the operation turns those events into no-ops, so an
  // opened file keeps its status when renamed. External moves remain delete + create.
  context.subscriptions.push(
    vscode.workspace.onWillRenameFiles((event) => {
      for (const { oldUri, newUri } of event.files) {
        const from = relPathOf(folder, oldUri);
        const to = relPathOf(folder, newUri);
        if (from !== undefined && to !== undefined) {
          dispatch({ type: 'renamed', from, to });
        }
      }
    }),
  );

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (!event.affectsConfiguration(SECTION, folder.uri)) {
        return;
      }
      const previous = settings;
      settings = readSettings(folder);
      const excludeChanged = JSON.stringify(previous.exclude) !== JSON.stringify(settings.exclude);
      if (excludeChanged || previous.respectGitIgnore !== settings.respectGitIgnore) {
        filter = createPathFilter(settings.exclude);
        tracker.rescope().catch(reportError);
      }
      visits.evaluate();
    }),
  );

  registerCommands(context, folder, tracker, reportError);

  // Catch files added while VS Code was closed.
  if (tracker.state.tracking) {
    tracker.reconcile().catch(reportError);
  }

  return {
    state: () => tracker.state,
    idle: () => tracker.idle(),
    stop: () => tracker.stop(),
    setIgnoreWindowFocus: (ignore) => {
      ignoreWindowFocus = ignore;
      visits.evaluate();
    },
  };
}

export async function deactivate(): Promise<void> {
  // Make sure the last debounced write lands before the extension host exits.
  await store?.flush();
}

function registerCommands(
  context: vscode.ExtensionContext,
  folder: vscode.WorkspaceFolder,
  tracker: Tracker,
  reportError: (error: unknown) => void,
): void {
  const withProgress = (title: string, task: () => Promise<void>): Thenable<void> =>
    vscode.window.withProgress(
      { location: { viewId: 'fileFirstLook.unopenedFiles' }, title },
      task,
    );

  const register = (id: string, handler: (...args: never[]) => unknown): void => {
    context.subscriptions.push(vscode.commands.registerCommand(id, handler));
  };

  register('fileFirstLook.startTracking', async () => {
    if (
      tracker.state.tracking &&
      !(await confirm('Restart tracking? The current list will be cleared.', 'Restart'))
    ) {
      return;
    }
    await withProgress('Taking baseline…', () => tracker.start()).then(undefined, reportError);
  });

  register('fileFirstLook.stopTracking', async () => {
    if (await confirm('Stop tracking and clear the Unopened Files list?', 'Stop Tracking')) {
      await tracker.stop();
    }
  });

  register('fileFirstLook.refresh', async () => {
    await withProgress('Refreshing…', () => tracker.reconcile()).then(undefined, reportError);
  });

  register(OPEN_COMMAND, async (rel: RelPath) => {
    // `vscode.open` picks the right editor for any file type (text, image, notebook).
    await vscode.commands.executeCommand('vscode.open', vscode.Uri.joinPath(folder.uri, rel));
  });

  register('fileFirstLook.markOpened', async (rel: RelPath) => {
    await tracker.dispatch({ type: 'markedOpened', paths: [rel] });
  });

  register('fileFirstLook.markAllOpened', async () => {
    const paths = [...tracker.state.pending];
    if (paths.length === 0) {
      return;
    }
    const noun = paths.length === 1 ? 'file' : 'files';
    if (
      await confirm(`Mark ${paths.length} ${noun} as opened without looking at them?`, 'Mark All')
    ) {
      await tracker.dispatch({ type: 'markedOpened', paths });
    }
  });
}

/** First release: exactly one local folder. Multi-root is planned post-pilot. */
function singleLocalFolder(): vscode.WorkspaceFolder | undefined {
  const folders = vscode.workspace.workspaceFolders;
  const only = folders?.length === 1 ? folders[0] : undefined;
  return only?.uri.scheme === 'file' ? only : undefined;
}

async function confirm(message: string, action: string): Promise<boolean> {
  return (await vscode.window.showWarningMessage(message, { modal: true }, action)) === action;
}

function setContext(key: string, value: boolean): Thenable<unknown> {
  return vscode.commands.executeCommand('setContext', key, value);
}
