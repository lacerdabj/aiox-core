import { catalogRevision, catalogs } from '../data/catalogs.generated.js';
import type { CatalogClient } from './types.js';

export function clientsForCity(cityId: string): CatalogClient[] {
  return (catalogs[cityId] ?? []).map((client) => ({ ...client }));
}

export function currentCatalogRevision(): string {
  return catalogRevision;
}
