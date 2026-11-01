import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

const digest = value => createHash('sha256').update(value).digest();
const matches = (left, right) => left.length === right.length && timingSafeEqual(left, right);

// Codes and session tokens never persist; restarting revokes all devices.
export function createDeviceAccess({ clock = Date.now, pairingMs = 300000, sessionMs = 28800000 } = {}) {
  let pairing = null;
  const sessions = new Map();
  function issueCode() {
    const code = randomBytes(6).toString('hex').toUpperCase();
    pairing = { hash: digest(code), expires: clock() + pairingMs, attempts: 0 };
    return code;
  }
  function pair(value) {
    if (!pairing || clock() >= pairing.expires || pairing.attempts >= 8) return null;
    pairing.attempts++;
    const candidate = typeof value === 'string' ? value.trim().toUpperCase() : '';
    if (!matches(digest(candidate), pairing.hash)) return null;
    pairing = null;
    for (const [key, session] of sessions) if (session.expires <= clock()) sessions.delete(key);
    if (sessions.size >= 32) return null;
    const token = randomBytes(32).toString('hex');
    const session = { csrf: randomBytes(32).toString('hex'), expires: clock() + sessionMs };
    sessions.set(digest(token).toString('hex'), session);
    return { token, csrf: session.csrf };
  }
  function authenticate(token) {
    if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) return null;
    const key = digest(token).toString('hex');
    const session = sessions.get(key);
    if (!session || session.expires <= clock()) { sessions.delete(key); return null; }
    return session;
  }
  return { issueCode, pair, authenticate };
}
