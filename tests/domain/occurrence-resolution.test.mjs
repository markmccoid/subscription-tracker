import assert from 'node:assert/strict';
import test from 'node:test';

import { createChargeException, createPayment } from '../../src/domain/occurrence-resolution.ts';
import { entityId } from '../../src/domain/primitives.ts';

const occurrenceId = entityId('30000000-0000-4000-8000-000000000001');

test('Payment and Charge Exception inputs are normalized and validated', () => {
  const payment = createPayment({
    id: entityId('30000000-0000-4000-8000-000000000002'),
    billingOccurrenceId: occurrenceId,
    amountCents: 1499,
    paymentDate: '2026-08-08',
    note: '  confirmed  ',
    now: '2026-08-09T15:00:00.000Z',
  });
  assert.equal(payment.note, 'confirmed');
  assert.equal(payment.amount, 1499);
  assert.equal(payment.paymentDate, '2026-08-08');

  const exception = createChargeException({
    id: entityId('30000000-0000-4000-8000-000000000003'),
    billingOccurrenceId: occurrenceId,
    reason: '   ',
    now: '2026-08-09T15:00:00.000Z',
  });
  assert.equal(exception.reason, null);
  assert.throws(() => createPayment({
    id: entityId('30000000-0000-4000-8000-000000000004'),
    billingOccurrenceId: occurrenceId,
    amountCents: 0,
    paymentDate: '2026-08-09',
    now: '2026-08-09T15:00:00.000Z',
  }), /positive/);
});
