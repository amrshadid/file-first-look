/** Restart check, session 2 of 2. See 1-before-restart.test.ts. */
import * as assert from 'node:assert/strict';

import { emptyFolder, getApi } from '../helpers';

suite('Restart (session 2: after reopening VS Code)', () => {
  test('restores the list and finds files added while closed', async () => {
    const api = await getApi();
    await api.idle(); // Activation queues a reconcile scan.

    const state = api.state();
    assert.equal(state.tracking, true, 'still tracking after restart');
    assert.equal(state.pending.has('scratch/unopened.ts'), true, 'unopened file still listed');
    assert.equal(state.opened.has('scratch/opened.ts'), true, 'opened file remembered');
    assert.equal(state.pending.has('scratch/opened.ts'), false, 'opened file stays off the list');
    assert.equal(
      state.pending.has('scratch/offline.ts'),
      true,
      'file added while closed is listed',
    );
    assert.equal(state.baseline.has('src/existing.ts'), true, 'baseline restored');

    await api.stop();
    await emptyFolder('scratch');
  });
});
