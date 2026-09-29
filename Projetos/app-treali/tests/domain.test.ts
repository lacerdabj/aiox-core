import assert from 'node:assert/strict';
import test from 'node:test';
import { assertAttendanceAction, createAttendanceRecord, isClientVisibleToSession } from '../src/domain.js';

test('cria um registro de atendimento ligado ao distribuidor e cliente', () => {
  const record = createAttendanceRecord({
    action: 'Eu já atendo',
    distributorId: 'dist-muriae',
    clientId: 'cliente-123',
    latitude: -21.13,
    longitude: -42.37,
    accuracy: 12,
  });

  assert.equal(record.action, 'Eu já atendo');
  assert.equal(record.distributorId, 'dist-muriae');
  assert.equal(record.clientId, 'cliente-123');
  assert.match(record.id, /^[0-9a-f-]{36}$/);
});

test('rejeita uma ação de atendimento desconhecida', () => {
  assert.throws(() => assertAttendanceAction('cancelou'));
});

test('não torna cliente de outra cidade visível para a sessão', () => {
  assert.equal(isClientVisibleToSession(
    { cityId: 'muriae-mg' },
    { cityId: 'barbacena-mg' },
  ), false);
});
