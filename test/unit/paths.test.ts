import { describe, expect, it } from 'vitest';

import { ancestorsOf, isSameOrDescendant, rebase, toRelPath } from '../../src/core';

describe('toRelPath', () => {
  it.each([
    ['./src/app.ts', 'src/app.ts'],
    ['/src/app.ts', 'src/app.ts'],
    ['src/dir/', 'src/dir'],
    ['app.ts', 'app.ts'],
  ])('normalizes %s to %s', (input, expected) => {
    expect(toRelPath(input)).toBe(expected);
  });
});

describe('toRelPath backslashes', () => {
  it('keeps backslashes, which are legal in POSIX file names', () => {
    expect(toRelPath('a\\b.txt')).toBe('a\\b.txt');
  });
});

describe('ancestorsOf', () => {
  it('lists parent folders nearest first', () => {
    expect(ancestorsOf('a/b/c.ts')).toEqual(['a/b', 'a']);
    expect(ancestorsOf('top.ts')).toEqual([]);
  });
});

describe('isSameOrDescendant', () => {
  it('matches the path itself and its descendants', () => {
    expect(isSameOrDescendant('src', 'src')).toBe(true);
    expect(isSameOrDescendant('src/a/b.ts', 'src')).toBe(true);
  });

  it('does not match siblings that share a prefix', () => {
    expect(isSameOrDescendant('src2/a.ts', 'src')).toBe(false);
    expect(isSameOrDescendant('srcfile.ts', 'src')).toBe(false);
  });
});

describe('rebase', () => {
  it('moves a path and its descendants to the new root', () => {
    expect(rebase('old/a.ts', 'old', 'new')).toBe('new/a.ts');
    expect(rebase('old', 'old', 'new')).toBe('new');
  });

  it('returns undefined for unrelated paths', () => {
    expect(rebase('older/a.ts', 'old', 'new')).toBeUndefined();
  });
});
