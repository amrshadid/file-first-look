import { describe, expect, it } from 'vitest';

import { ALWAYS_EXCLUDED, createPathFilter } from '../../src/core';

const VCS = ALWAYS_EXCLUDED.join(',');

describe('createPathFilter', () => {
  const filter = createPathFilter(['**/node_modules/**', '**/.cache/**', '**/*.log', ' ']);

  it('excludes files inside excluded folders at any depth', () => {
    expect(filter.isIncluded('node_modules/pkg/index.js')).toBe(false);
    expect(filter.isIncluded('packages/a/node_modules/pkg/index.js')).toBe(false);
  });

  it('matches dot folders', () => {
    expect(filter.isIncluded('.cache/x.json')).toBe(false);
  });

  it('excludes by extension', () => {
    expect(filter.isIncluded('logs/run.log')).toBe(false);
  });

  it('includes ordinary source files', () => {
    expect(filter.isIncluded('src/app.ts')).toBe(true);
    expect(filter.isIncluded('.github/workflows/ci.yml')).toBe(true);
  });

  it('combines globs for findFiles and ignores blank entries', () => {
    expect(filter.combinedExcludeGlob).toBe(`{${VCS},**/node_modules/**,**/.cache/**,**/*.log}`);
  });

  it('leaves globs with their own braces out of the combined glob but still applies them', () => {
    const braces = createPathFilter(['**/*.{log,tmp}', '**/dist/**']);
    expect(braces.combinedExcludeGlob).toBe(`{${VCS},**/dist/**}`);
    expect(braces.isIncluded('a/run.tmp')).toBe(false);
  });

  it('always excludes version-control folders, even with a custom list', () => {
    const custom = createPathFilter(['**/*.snap']);
    expect(custom.isIncluded('.git/FETCH_HEAD')).toBe(false);
    expect(custom.isIncluded('sub/.git/refs/heads/main')).toBe(false);
    expect(custom.isIncluded('.hg/store/x')).toBe(false);
    expect(custom.isIncluded('node_modules/a.js')).toBe(true);
  });

  it('does not duplicate globs the user also lists', () => {
    expect(createPathFilter(['**/.git/**']).combinedExcludeGlob).toBe(`{${VCS}}`);
  });
});
