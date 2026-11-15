import { describe, expect, it } from 'vitest';

import { createPathFilter } from '../../src/core';

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
    expect(filter.combinedExcludeGlob).toBe('{**/node_modules/**,**/.cache/**,**/*.log}');
    expect(createPathFilter(['**/dist/**']).combinedExcludeGlob).toBe('**/dist/**');
  });

  it('includes everything when there are no exclusions', () => {
    const open = createPathFilter([]);
    expect(open.isIncluded('node_modules/a.js')).toBe(true);
    expect(open.combinedExcludeGlob).toBeUndefined();
  });
});
