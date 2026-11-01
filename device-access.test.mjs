import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDeviceAccess } from './device-access.mjs';

test('pairing is single-use, expires, and revokes sessions on restart', () => {
  let now = 0;
  const access = createDeviceAccess({ clock: () => now, pairingMs: 100, sessionMs: 200 });
  const code = access.issueCode();
  assert.equal(access.pair('incorrect'), null);
  const paired = access.pair(code);
  assert.ok(paired);
  assert.equal(access.pair(code), null);
  assert.equal(access.authenticate(paired.token).csrf, paired.csrf);
  assert.equal(createDeviceAccess().authenticate(paired.token), null);
  now = 200;
  assert.equal(access.authenticate(paired.token), null);
  const expired = access.issueCode();
  now += 100;
  assert.equal(access.pair(expired), null);
});

test('eight failed attempts exhaust a code and rotation invalidates the old code', () => {
  const access = createDeviceAccess();
  const oldCode = access.issueCode();
  for (let i = 0; i < 8; i++) assert.equal(access.pair('incorrect'), null);
  assert.equal(access.pair(oldCode), null);
  const newCode = access.issueCode();
  assert.equal(access.pair(oldCode), null);
  assert.ok(access.pair(newCode));
});
