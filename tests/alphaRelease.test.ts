import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { build, resolveConfig } from 'vite';
import { test } from 'vitest';

const read = (path: string) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

test('the Alpha uses a local favicon and root asset paths in development and production', async () => {
  const dev = await resolveConfig({}, 'serve');
  assert.equal(dev.base, '/');
  const preview = await resolveConfig({}, 'serve', 'production', 'production', true);
  assert.equal(preview.base, '/');
  assert.match(read('src/assets/favicon.svg'), /<svg\b[^>]*viewBox="0 0 32 32"/);
  assert.match(read('index.html'), /href="\/src\/assets\/favicon\.svg"/);
  const output = await build({ logLevel: 'silent', build: { write: false } });
  assert.ok('output' in output);
  const page = output.output.find(asset => asset.fileName === 'index.html');
  assert.ok(page?.type === 'asset' && typeof page.source === 'string');
  assert.match(page.source, /<title>Peasant to King \| Alpha 0\.1<\/title>/);
  assert.match(page.source, /class="game-version">Alpha 0\.1<\/small>/);
  for (const extension of ['svg', 'css', 'js']) {
    const asset = output.output.find(entry => entry.fileName.endsWith('.' + extension));
    assert.ok(asset);
    assert.ok(page.source.includes('="/' + asset.fileName + '"'));
  }
});
