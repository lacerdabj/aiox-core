import assert from 'node:assert/strict';
import test from 'node:test';
import loginRoute from '../api/auth/login.js';
import sessionRoute from '../api/session.js';
import clientsRoute from '../api/clients.js';
import { hashPassword } from '../api/_lib/crypto.js';

const originalEnvironment = { ...process.env };

function configureEnvironment(): void {
  process.env.TREALI_SESSION_SECRET = 'segredo-de-teste-comprido-e-unico';
  process.env.TREALI_ACCOUNTS_JSON = JSON.stringify([
    {
      id: 'dist-muriae',
      email: 'muriae@treali.test',
      passwordHash: hashPassword('senha-de-teste-segura'),
      label: 'Distribuidor Muriaé',
      cityId: 'muriae-mg',
      citySlug: 'muriae-mg',
    },
    {
      id: 'dist-barbacena',
      email: 'barbacena@treali.test',
      passwordHash: hashPassword('senha-de-teste-segura'),
      label: 'Distribuidor Barbacena',
      cityId: 'barbacena-mg',
      citySlug: 'barbacena-mg',
    },
  ]);
}

test.after(() => {
  process.env = originalEnvironment;
});

test('login cria sessão cuja carteira é limitada à cidade do distribuidor', async () => {
  configureEnvironment();
  const response = await loginRoute(new Request('https://treali.test/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ login: 'muriae@treali.test', password: 'senha-de-teste-segura' }),
  }));
  assert.equal(response.status, 200);

  const cookie = response.headers.get('set-cookie');
  assert.ok(cookie);
  const request = new Request('https://treali.test/api/clients', { headers: { cookie } });
  const sessionResponse = sessionRoute(request);
  const clientsResponse = clientsRoute(request);

  assert.equal(sessionResponse.status, 200);
  assert.equal(clientsResponse.status, 200);
  const payload = await clientsResponse.json() as { clients: Array<{ cityId: string }> };
  assert.ok(payload.clients.length > 0);
  assert.ok(payload.clients.every((client) => client.cityId === 'muriae-mg'));
  assert.equal(payload.clients.some((client) => client.cityId === 'barbacena-mg'), false);
});

test('login rejeita senha inválida sem criar sessão', async () => {
  configureEnvironment();
  const response = await loginRoute(new Request('https://treali.test/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'muriae@treali.test', password: 'invalida' }),
  }));
  assert.equal(response.status, 401);
  assert.equal(response.headers.get('set-cookie'), null);
});
