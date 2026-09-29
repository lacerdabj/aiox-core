import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createManualClient,
  loadManualClients,
  manualClientsKey,
  saveManualClients,
  validateNewClient,
  type KeyValueStorage,
} from '../src/client-store.js';

function memoryStorage(): KeyValueStorage {
  const data = new Map<string, string>();
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => { data.set(key, value); },
  };
}

test('rejeita campos obrigatórios vazios ou só com espaços', () => {
  const errors = validateNewClient({ name: '   ', category: '', address: '  ' });
  assert.deepEqual(errors.map((error) => error.field), ['name', 'category', 'address']);
  assert.ok(errors.every((error) => error.message.length > 0));
});

test('aceita formulário válido com telefone opcional ausente', () => {
  assert.deepEqual(validateNewClient({ name: 'Bar do Zé', category: 'Bar', address: 'Rua A, 10' }), []);
});

test('cria cliente manual com id único, origem e slug', () => {
  const client = createManualClient(
    { name: '  Bar do Zé ', category: 'Bar', address: 'Rua A, 10', phone: ' ' },
    'muriae-mg',
  );
  assert.match(client.id, /^[0-9a-f-]{36}$/);
  assert.equal(client.name, 'Bar do Zé');
  assert.equal(client.phone, null);
  assert.equal(client.origin, 'manual');
  assert.equal(client.distributorSlug, 'muriae-mg');
});

test('usa a chave particionada por slug', () => {
  assert.equal(manualClientsKey('muriae-mg'), 'treali:local-clients.muriae-mg');
});

test('persiste e recarrega a lista do mesmo distribuidor', () => {
  const storage = memoryStorage();
  const client = createManualClient({ name: 'Bar do Zé', category: 'Bar', address: 'Rua A, 10' }, 'muriae-mg');
  saveManualClients(storage, 'muriae-mg', [client]);
  assert.deepEqual(loadManualClients(storage, 'muriae-mg'), [client]);
});

test('isola clientes entre distribuidores no mesmo aparelho', () => {
  const storage = memoryStorage();
  saveManualClients(storage, 'muriae-mg', [
    createManualClient({ name: 'Bar do Zé', category: 'Bar', address: 'Rua A, 10' }, 'muriae-mg'),
  ]);
  saveManualClients(storage, 'barbacena-mg', [
    createManualClient({ name: 'Padaria Pão Bom', category: 'Padaria', address: 'Rua B, 20' }, 'barbacena-mg'),
  ]);
  assert.deepEqual(loadManualClients(storage, 'muriae-mg').map((client) => client.name), ['Bar do Zé']);
  assert.deepEqual(loadManualClients(storage, 'barbacena-mg').map((client) => client.name), ['Padaria Pão Bom']);
});

test('ignora JSON corrompido ou fora do formato sem lançar', () => {
  const storage = memoryStorage();
  storage.setItem(manualClientsKey('muriae-mg'), '{corrompido');
  assert.deepEqual(loadManualClients(storage, 'muriae-mg'), []);
  storage.setItem(manualClientsKey('muriae-mg'), '{"nao":"array"}');
  assert.deepEqual(loadManualClients(storage, 'muriae-mg'), []);
});

test('descarta registro de outro slug na mesma chave', () => {
  const storage = memoryStorage();
  const foreign = { ...createManualClient({ name: 'Intruso', category: 'Bar', address: 'Rua X' }, 'barbacena-mg') };
  storage.setItem(manualClientsKey('muriae-mg'), JSON.stringify([foreign]));
  assert.deepEqual(loadManualClients(storage, 'muriae-mg'), []);
});

test('falha de persistência propaga para a UI tratar sem falso sucesso', () => {
  const failing: KeyValueStorage = {
    getItem: () => null,
    setItem: () => { throw new Error('quota excedida'); },
  };
  assert.throws(() => saveManualClients(failing, 'muriae-mg', []), /quota excedida/);
});
