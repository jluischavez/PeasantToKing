import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { build, resolveConfig } from 'vite';
import { test } from 'vitest';

const read = (path: string) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

test('the Alpha uses a local favicon and correct paths in development and the Pages build', async () => {
  const dev = await resolveConfig({}, 'serve');
  assert.equal(dev.base, '/');
  const preview = await resolveConfig({}, 'serve', 'production', 'production', true);
  assert.equal(preview.base, '/PeasantToKing/');
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
    assert.ok(page.source.includes('="/PeasantToKing/' + asset.fileName + '"'));
  }
});

test('Pages accepts main pushes and manual dispatches from main, with tests before deployment', () => {
  const workflow = read('.github/workflows/pages.yml');
  assert.match(workflow, /^on:\r?\n  push:\r?\n    branches: \[main\]\r?\n  workflow_dispatch:\r?\n\r?\n/m);
  assert.match(workflow, /^  build:\r?\n    if: github\.ref == 'refs\/heads\/main'$/m);
  assert.match(workflow, /^  deploy:\r?\n    needs: build$/m);
  assert.match(workflow, /npm ci\s+- run: npm test\s+- run: npm run build/);
  assert.match(workflow, /actions\/upload-pages-artifact@v\d+\s+with:\s+path: dist/);
});
