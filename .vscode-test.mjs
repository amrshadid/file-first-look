// Integration tests run inside a separately downloaded VS Code build with an
// isolated user-data and extensions directory, so they never touch your
// installed editor, settings or other open projects.
import { defineConfig } from '@vscode/test-cli';

export default defineConfig({
  files: 'out/test/integration/suite/**/*.test.js',
  workspaceFolder: './test/fixtures/workspace',
  launchArgs: ['--disable-extensions'],
  mocha: { ui: 'tdd', timeout: 20000 },
});
