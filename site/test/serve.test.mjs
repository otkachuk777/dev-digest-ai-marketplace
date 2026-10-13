import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { serve } from '../dev/serve.mjs';

test('dev server serves files, blocks traversal, survives bad escapes', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'serve-'));
  const evil = `${dir}-evil`;
  mkdirSync(evil);
  writeFileSync(join(dir, 'hello.txt'), 'hi');
  writeFileSync(join(evil, 'secret.txt'), 'SECRET');
  const server = await serve({ dir, port: 0 });
  const base = `http://127.0.0.1:${server.address().port}/dev-digest-ai-marketplace/`;
  try {
    const ok = await fetch(`${base}hello.txt`);
    assert.equal(ok.status, 200);
    assert.equal(await ok.text(), 'hi');

    const trav = await fetch(`${base}..%2F${basename(dir)}-evil/secret.txt`);
    assert.ok(trav.status === 403 || trav.status === 404, `status ${trav.status}`);
    assert.doesNotMatch(await trav.text(), /SECRET/);

    const bad = await fetch(`${base}%E0%A4%A`);
    assert.equal(bad.status, 400);

    const out = await fetch(`http://127.0.0.1:${server.address().port}/elsewhere`, { redirect: 'manual' });
    assert.equal(out.status, 302);
    assert.equal(out.headers.get('location'), '/dev-digest-ai-marketplace/');

    assert.equal((await fetch(`${base}hello.txt`)).status, 200, 'server still alive');
  } finally {
    server.close();
    rmSync(dir, { recursive: true, force: true });
    rmSync(evil, { recursive: true, force: true });
  }
});
