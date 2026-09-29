import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const sourcePath = process.env.TREALI_CATALOG_SOURCE;
const outputPath = resolve(scriptDirectory, '../api/data/catalogs.generated.ts');

if (!sourcePath) {
  throw new Error('Defina TREALI_CATALOG_SOURCE com o caminho de um JSON autorizado antes de importar.');
}

const source = JSON.parse(await readFile(resolve(sourcePath), 'utf8'));
if (!Array.isArray(source.clients)) throw new Error('O JSON precisa conter clients como uma lista.');

const catalogs = {};
for (const rawClient of source.clients) {
  if (!rawClient?.name || !rawClient?.cityId || !rawClient?.citySlug) {
    throw new Error('Cada cliente exige name, cityId e citySlug.');
  }
  const cityClients = catalogs[rawClient.cityId] ?? [];
  cityClients.push({
    id: rawClient.id || createHash('sha256').update(`${rawClient.cityId}:${rawClient.name}:${rawClient.address ?? ''}`).digest('hex').slice(0, 24),
    name: rawClient.name,
    tradeName: rawClient.tradeName || undefined,
    cityId: rawClient.cityId,
    citySlug: rawClient.citySlug,
    address: rawClient.address || undefined,
    phone: rawClient.phone || undefined,
  });
  catalogs[rawClient.cityId] = cityClients;
}

const revision = source.revision || new Date().toISOString().slice(0, 10);
const content = `import type { CatalogClient } from '../_lib/types.js';\n\nexport const catalogRevision = ${JSON.stringify(revision)};\nexport const catalogs: Record<string, CatalogClient[]> = ${JSON.stringify(catalogs, null, 2)};\n`;
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, content, 'utf8');
console.log(`Catálogo importado: ${Object.values(catalogs).reduce((total, clients) => total + clients.length, 0)} clientes em ${Object.keys(catalogs).length} cidades.`);
