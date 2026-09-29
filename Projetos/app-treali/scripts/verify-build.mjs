import { access, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const required = ['index.html', 'manifest.webmanifest', 'service-worker.js', 'icons/icon-192.svg', 'icons/icon-512.svg'];
for (const file of required) await access(resolve('dist', file));

const serviceWorker = await readFile(resolve('dist', 'service-worker.js'), 'utf8');
if (!serviceWorker.includes("url.pathname.startsWith('/api/')") || serviceWorker.includes('catalogs.generated')) {
  throw new Error('O service worker não pode pré-cachear dados autenticados.');
}
console.log('PWA build passed');
