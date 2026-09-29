import { expiredSessionCookie } from '../_lib/auth.js';

export default function logout(request: Request): Response {
    if (request.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });
    return new Response(null, { status: 204, headers: { 'Set-Cookie': expiredSessionCookie() } });
}
