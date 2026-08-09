import assert from 'node:assert/strict';
import test from 'node:test';

import {
  normalizeOptionalHttpsUrl,
  normalizeOptionalText,
  validateReminderLeadDays,
} from '../../src/domain/subscription-profile.ts';

test('optional Subscription profile fields normalize empty values', () => {
  assert.equal(normalizeOptionalText('   ', 'Note', 20), null);
  assert.equal(normalizeOptionalText('  useful  ', 'Note', 20), 'useful');
  assert.equal(normalizeOptionalHttpsUrl('https://EXAMPLE.com/cancel'), 'https://example.com/cancel');
});

test('Cancellation URL is HTTPS-only and reminder overrides are bounded', () => {
  assert.throws(() => normalizeOptionalHttpsUrl('http://example.com/cancel'), /HTTPS/);
  assert.equal(validateReminderLeadDays(null), null);
  assert.equal(validateReminderLeadDays(0), 0);
  assert.equal(validateReminderLeadDays(365), 365);
  assert.throws(() => validateReminderLeadDays(366), /0 through 365/);
});
