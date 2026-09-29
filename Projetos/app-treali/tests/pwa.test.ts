import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('manifest declara ícones e service worker não armazena rotas autenticadas', async () => {
  const manifest = JSON.parse(await readFile(new URL('../public/manifest.webmanifest', import.meta.url), 'utf8')) as {
    icons: Array<{ src: string; sizes: string }>;
  };
  const worker = await readFile(new URL('../public/service-worker.js', import.meta.url), 'utf8');

  assert.deepEqual(manifest.icons.map((icon) => icon.sizes), ['192x192', '512x512']);
  assert.ok(manifest.icons.every((icon) => icon.src.endsWith('.svg')));
  assert.match(worker, /url\.pathname\.startsWith\('\/api\/'\)\) return/);
  assert.match(worker, /const SHELL = \['\/', '\/index\.html', '\/manifest\.webmanifest'\]/);
  assert.equal(worker.includes('catalogs.generated'), false);
});
