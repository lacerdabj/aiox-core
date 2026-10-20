import test from 'node:test'
import assert from 'node:assert/strict'
import { loginWithPin, checkCurrentSession } from '../src/auth.ts'
import { getDistributorSession } from '../src/db.ts'

test('login depende da identidade verificada pelo servidor, sem PIN mestre local', async () => {
  const original = globalThis.fetch
  try {
    globalThis.fetch = async () => new Response(JSON.stringify({ error: 'invalid' }), { status: 401 })
    const denied = await loginWithPin('32999998888', '1234')
    assert.equal(denied.success, false)
    assert.equal(await getDistributorSession(), null)
    globalThis.fetch = async (input) => new Response(JSON.stringify(String(input) === '/api/session' ? { role: 'distributor', distributor: { id: 'dist_a', phone: '32999998888', name: 'A' } } : { role: 'distributor', distributorId: 'dist_a' }), { status: 200 })
    const shortPin = await loginWithPin('32999998888', '123')
    assert.equal(shortPin.success, false)
    const granted = await loginWithPin('32999998888', '567812345678')
    assert.equal(granted.session?.distributorId, 'dist_a')
    assert.equal((await checkCurrentSession())?.name, 'A')
  } finally { globalThis.fetch = original }
})
