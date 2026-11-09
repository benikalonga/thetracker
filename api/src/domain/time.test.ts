import assert from 'node:assert/strict';
import { test } from 'node:test';
import { addDays, eventTime } from './time';

test('addDays crosses months and years', () => {
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
});

test('eventTime clamps the future and refuses very old actions', () => {
  const future = new Date(Date.now() + 3_600_000);
  assert.ok(eventTime(future).getTime() <= Date.now());
  const hourAgo = new Date(Date.now() - 3_600_000);
  assert.equal(eventTime(hourAgo).getTime(), hourAgo.getTime());
  assert.throws(() => eventTime(new Date(Date.now() - 20 * 864e5)));
});
