import { readSession } from './_lib/auth.js';

export default function session(request: Request): Response {
    const session = readSession(request);
    if (!session) return Response.json({ error: 'Sessão não autenticada.' }, { status: 401 });
    return Response.json({ session: {
      distributorId: session.distributorId,
      cityId: session.cityId,
      slug: session.citySlug,
      label: session.label,
    } });
}
