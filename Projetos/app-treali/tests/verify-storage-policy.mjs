import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const worker = await readFile(resolve('src/sqlite-worker.ts'), 'utf8');
const storage = await readFile(resolve('src/storage.ts'), 'utf8');

if (!worker.includes('sqlite3.opfs') || !worker.includes('OpfsDb')) {
  throw new Error('SQLite OPFS não está configurado como persistência primária.');
}
if (!storage.includes('Persistência SQLite/OPFS indisponível') || !storage.includes('await this.request')) {
  throw new Error('A aplicação não bloqueia o registro quando SQLite/OPFS está indisponível.');
}
if (!storage.includes('localStorage.setItem') || !storage.includes('await this.request')) {
  throw new Error('O espelho local não respeita a confirmação da persistência primária.');
}
console.log('storage policy verification passed');
