// Runs between the two restart sessions, while VS Code is closed.
import { mkdir, writeFile } from 'node:fs/promises';

const dir = new URL('../../fixtures/restart-workspace/scratch/', import.meta.url);
await mkdir(dir, { recursive: true });
await writeFile(new URL('offline.ts', dir), '// written while VS Code was closed\n');
console.log('Wrote scratch/offline.ts while VS Code was closed.');
