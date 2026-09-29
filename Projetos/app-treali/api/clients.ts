import { clientsForCity, currentCatalogRevision } from './_lib/catalog.js';
import { readSession } from './_lib/auth.js';

export default function clients(request: Request): Response {
    const session = readSession(request);
    if (!session) return Response.json({ error: 'Sessão não autenticada.' }, { status: 401 });

    return Response.json({
      revision: currentCatalogRevision(),
      clients: clientsForCity(session.cityId).map((client) => ({
        id: client.id,
        name: client.name,
        cityId: client.cityId,
        category: client.tradeName ?? 'Cliente Treali',
        address: client.address ?? null,
        phone: client.phone ?? null,
      })),
    }, {
      headers: { 'Cache-Control': 'private, no-store' },
    });
}
