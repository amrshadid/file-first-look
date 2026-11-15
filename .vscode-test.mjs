// Integration tests run inside a separately downloaded VS Code build with an
// isolated user-data and extensions directory, so they never touch your
// installed editor, settings or other open projects.
//
// All configurations share that user-data directory. The two restart sessions
// rely on it: session 2 reads the workspace state session 1 left behind.
import { defineConfig } from '@vscode/test-cli';

const common = {
  launchArgs: ['--disable-extensions'],
  mocha: { ui: 'tdd', timeout: 20000 },
};

export default defineConfig([
  {
    ...common,
    label: 'main',
    files: 'out/test/integration/suite/**/*.test.js',
    workspaceFolder: './test/fixtures/workspace',
  },
  {
    ...common,
    label: 'restart-1',
    files: 'out/test/integration/restart/1-before-restart.test.js',
    workspaceFolder: './test/fixtures/restart-workspace',
  },
  {
    ...common,
    label: 'restart-2',
    files: 'out/test/integration/restart/2-after-restart.test.js',
    workspaceFolder: './test/fixtures/restart-workspace',
  },
]);
