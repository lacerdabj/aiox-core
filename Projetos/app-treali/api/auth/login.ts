import { authenticate, createSession, sessionCookie } from '../_lib/auth.js';

export default async function login(request: Request): Promise<Response> {
    if (request.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });

    try {
      const body = await request.json() as { email?: unknown; login?: unknown; password?: unknown };
      const email = typeof body.email === 'string' ? body.email : body.login;
      if (typeof email !== 'string' || typeof body.password !== 'string') {
        return Response.json({ error: 'Informe e-mail e senha.' }, { status: 400 });
      }

      const account = authenticate(email, body.password);
      if (!account) return Response.json({ error: 'Credenciais inválidas.' }, { status: 401 });

      const token = createSession(account);
      return Response.json({ session: {
        distributorId: account.id,
        cityId: account.cityId,
        slug: account.citySlug,
        label: account.label,
      } }, {
        headers: { 'Set-Cookie': sessionCookie(token) },
      });
    } catch {
      return Response.json({ error: 'Não foi possível iniciar a sessão.' }, { status: 500 });
    }
}
