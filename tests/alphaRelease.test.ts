import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { build, resolveConfig } from 'vite';
import { test } from 'vitest';
import { buildingArt, upgradedRoadArt } from '../src/map/BuildingArt.ts';
import { constructionNames } from '../src/map/ConstructionMap.ts';

const read = (path: string) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

test('the Alpha uses a local favicon and root asset paths in development and production', { timeout: 20_000 }, async () => {
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

test('the complete construction catalog points to distinct local SVG artwork', () => {
  assert.deepEqual(Object.keys(buildingArt).sort(), Object.keys(constructionNames).sort());
  const artwork = [...Object.values(buildingArt), ...Object.values(upgradedRoadArt).map(({ url }) => url)];
  assert.equal(new Set(artwork).size, artwork.length);
  for (const url of artwork) {
    const inlinePrefix = 'data:image/svg+xml,';
    const inline = url.startsWith(inlinePrefix);
    if (!inline) assert.match(url, /^\/src\/assets\/buildings\/[a-z-]+\.svg$/);
    const svg = inline ? decodeURIComponent(url.slice(inlinePrefix.length)) : read(url.slice(1));
    assert.match(svg, /^<svg\b[^>]*viewBox=["']0 0 \d+ \d+["']/);
    assert.match(svg, /<\/svg>\s*$/);
  }
});
