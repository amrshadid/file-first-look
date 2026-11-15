import * as path from 'node:path';

import { describe, expect, it } from 'vitest';

import { canonicalPath, relPathOf } from '../../src/adapters/uris';

const posixFolder = { uri: { fsPath: '/work/repo' } } as Parameters<typeof relPathOf>[0];
const winFolder = { uri: { fsPath: 'C:\\work\\repo' } } as Parameters<typeof relPathOf>[0];
const file = (fsPath: string): { scheme: string; fsPath: string } => ({ scheme: 'file', fsPath });

describe('relPathOf', () => {
  it('maps files inside the folder to POSIX relative paths', () => {
    expect(relPathOf(posixFolder, file('/work/repo/src/a.ts'), path.posix)).toBe('src/a.ts');
    expect(relPathOf(winFolder, file('C:\\work\\repo\\src\\a.ts'), path.win32)).toBe('src/a.ts');
  });

  it('keeps files whose names start with two dots', () => {
    expect(relPathOf(posixFolder, file('/work/repo/..notes'), path.posix)).toBe('..notes');
  });

  it('rejects the folder itself, parents, siblings and other drives', () => {
    expect(relPathOf(posixFolder, file('/work/repo'), path.posix)).toBeUndefined();
    expect(relPathOf(posixFolder, file('/work/other/a.ts'), path.posix)).toBeUndefined();
    expect(relPathOf(posixFolder, file('/work'), path.posix)).toBeUndefined();
    expect(relPathOf(winFolder, file('D:\\x\\a.ts'), path.win32)).toBeUndefined();
  });

  it('ignores non-file schemes and missing URIs', () => {
    const git = { scheme: 'git', fsPath: '/work/repo/a.ts' };
    expect(relPathOf(posixFolder, git, path.posix)).toBeUndefined();
    expect(relPathOf(posixFolder, undefined, path.posix)).toBeUndefined();
  });
});

describe('canonicalPath', () => {
  const nfd = 'cafe\u0301.md';
  const nfc = 'caf\u00e9.md';

  it('normalizes to NFC on macOS so both spellings match', () => {
    expect(canonicalPath(nfd, 'darwin')).toBe(nfc);
  });

  it('leaves names untouched on other platforms', () => {
    expect(canonicalPath(nfd, 'linux')).toBe(nfd);
  });
});
