import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, mkdirSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { GoogleAuthStore, GOOGLE_SCOPE, connectGoogle, disconnectGoogle, recoverCalendar, connectedAPI, startAuthorization, windowsProtector } from '../dist/google-auth.js';
import { GoogleHttpError, googleRequest } from '../dist/google-http.js';
import { fixture, projectRoot } from './helpers.mjs';

const code = c => e => e.code === c;
// Fake protector only for platform-neutral protocol tests; Windows DPAPI is tested separately.
const protector = { seal: value => Buffer.from(value).toString('base64'), open: value => Buffer.from(value, 'base64').toString('utf8') };
const credentials = { installed: { client_id: 'synthetic.apps.googleusercontent.com', client_secret: 'synthetic-client-secret', token_uri: 'https://ignored.invalid/token' } };
const authorization = async () => ({ url: 'https://accounts.google.com/synthetic', code: Promise.resolve('synthetic-code'), verifier: 'v'.repeat(43), redirectUri: 'http://127.0.0.1:45678/oauth/callback', close() {} });
const json = value => new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } });
function fixtureAuth(t) {
  const f = fixture(t); const store = new GoogleAuthStore(f.workspace, join(f.root, 'auth'), protector);
  const calls = []; let calendar = null;
  const send = async (url, options) => {
    calls.push({ url, options });
    if (url === 'https://oauth2.googleapis.com/token') return json({ access_token: 'synthetic-access', refresh_token: 'synthetic-refresh', scope: GOOGLE_SCOPE, token_type: 'Bearer', expires_in: 3600 });
    if (url === 'https://oauth2.googleapis.com/revoke') return new Response('');
    if (url === 'https://www.googleapis.com/calendar/v3/calendars' && options.method === 'POST') {
      calendar = { ...JSON.parse(options.body), id: 'synthetic@group.calendar.google.com' }; return json(calendar);
    }
    if (url.includes('/calendars/synthetic%40group.calendar.google.com') && !url.includes('/events')) return json(calendar);
    throw new Error('Unexpected synthetic endpoint');
  };
  const connect = () => connectGoogle(store, credentials, () => {}, send, authorization);
  return { ...f, store, calls, send, connect, get calendar() { return calendar; } };
}

test('PKCE uses only dedicated scope, random state and loopback; malformed callbacks never complete authorization', async () => {
  const session = await startAuthorization(credentials.installed.client_id, 5000);
  try {
    const url = new URL(session.url);
    assert.equal(url.origin, 'https://accounts.google.com'); assert.equal(url.searchParams.get('scope'), GOOGLE_SCOPE);
    assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
    assert.equal(url.searchParams.get('code_challenge'), createHash('sha256').update(session.verifier).digest('base64url'));
    assert.equal(new URL(session.redirectUri).hostname, '127.0.0.1');
    const state = url.searchParams.get('state');
    for (const suffix of [`?state=wrong&code=no`, `?state=${encodeURIComponent('가'.repeat(state.length))}&code=no`, `?state=${state}&state=${state}&code=no`]) {
      const response = await fetch(session.redirectUri + suffix); assert.equal(response.status, 400);
    }
    const response = await fetch(session.redirectUri + `?state=${state}&code=synthetic-code`);
    assert.equal(response.status, 200); assert.ok(!(await response.text()).includes('synthetic-code'));
    assert.equal(await session.code, 'synthetic-code');
  } finally { session.close(); }
  const timeout = await startAuthorization(credentials.installed.client_id, 20);
  try { await assert.rejects(timeout.code, /timeout/); } finally { timeout.close(); }
});

test('connect creates a dedicated calendar after consent, stores protected credentials and reconnect reuses target', async t => {
  const f = fixtureAuth(t); const first = await f.connect();
  assert.equal(first.connected, true); assert.equal(first.created, true);
  assert.equal(f.calendar.summary, 'JobShot 지원 일정'); assert.equal(f.calendar.timeZone, 'Asia/Seoul');
  assert.equal(f.calendar.description, `JobShot 전용 지원 일정 · 연결 ID ${f.store.load().calendar_marker}`);
  assert.ok(!f.calendar.description.includes(f.store.key));
  const disk = readFileSync(join(f.root, 'auth/connection.bin'), 'utf8');
  assert.ok(!disk.includes('synthetic-refresh')); assert.ok(!JSON.stringify(first).includes('synthetic-access'));
  const second = await f.connect(); assert.equal(second.created, false);
  assert.equal(f.calls.filter(c => c.url.endsWith('/calendars') && c.options.method === 'POST').length, 1);
  assert.ok(f.calls.every(c => c.options.redirect === 'error'));
  assert.ok(!f.calls.some(c => c.url.includes('/events') || c.url.includes('ignored.invalid')));
  const tokenBody = f.calls[0].options.body;
  assert.equal(tokenBody.get('code_verifier'), 'v'.repeat(43)); assert.equal(tokenBody.get('redirect_uri'), 'http://127.0.0.1:45678/oauth/callback');
});

test('missing credentials, denied consent and insufficient scopes preserve prior connection', async t => {
  const f = fixtureAuth(t); await f.connect(); const before = readFileSync(join(f.root, 'auth/connection.bin'));
  await assert.rejects(connectGoogle(f.store, { web: credentials.installed }, () => {}, f.send, authorization), code('GOOGLE_CLIENT'));
  const denied = async () => ({ ...await authorization(), code: Promise.reject(new Error('user denied synthetic-secret')) });
  await assert.rejects(connectGoogle(f.store, credentials, () => {}, f.send, denied), code('GOOGLE_AUTH_CANCELLED'));
  const missingScope = async () => json({ access_token: 'synthetic-access', refresh_token: 'synthetic-refresh', token_type: 'Bearer', expires_in: 3600, scope: 'unrelated' });
  await assert.rejects(connectGoogle(f.store, credentials, () => {}, missingScope, authorization), code('GOOGLE_SCOPE'));
  assert.deepEqual(readFileSync(join(f.root, 'auth/connection.bin')), before);
});

test('ambiguous calendar creation is not retried and recovery requires workspace ownership marker', async t => {
  const f = fixtureAuth(t); let created = 0;
  const uncertain = async (url, options) => {
    const response = await f.send(url, options);
    if (url.endsWith('/calendars')) { created++; throw new Error('Connection lost after create'); }
    return response;
  };
  await assert.rejects(connectGoogle(f.store, credentials, () => {}, uncertain, authorization), code('GOOGLE_NETWORK'));
  assert.equal(f.store.load().setup, 'pending_calendar');
  await assert.rejects(connectGoogle(f.store, credentials, () => {}, uncertain, authorization), code('GOOGLE_SETUP_UNKNOWN'));
  assert.equal(created, 1);
  const wrong = async () => json({ id: f.calendar.id, description: 'another workspace' });
  await assert.rejects(recoverCalendar(f.store, f.calendar.id, wrong), code('GOOGLE_RECOVERY'));
  assert.equal((await recoverCalendar(f.store, f.calendar.id, f.send)).recovered, true);
  assert.equal(f.store.load().setup, 'ready');
});

test('expired access refreshes securely; event requests pin Google host, suppress invitations and use If-Match', async t => {
  const f = fixtureAuth(t); await f.connect(); f.store.save({ ...f.store.load(), expires_at: 0 });
  const seen = [];
  const send = async (url, options) => {
    seen.push({ url, options });
    if (url.endsWith('/token')) return f.send(url, options);
    const payload = options.body ? JSON.parse(options.body) : {};
    return json({ ...payload, start: { date: '2026-11-01' }, end: { date: '2026-11-02' }, id: 'jobshot12345', etag: '"test"' });
  };
  const api = connectedAPI(f.store, send);
  const payload = { summary: '가상 기업 · 직무 마감', description: '원문 링크', start: { date: '2026-11-01' }, end: { date: '2026-11-02' } };
  await api.insert('jobshot12345', payload, 'synthetic-id'); await api.patch('jobshot12345', payload, '"old"');
  assert.equal(seen[0].options.body.get('grant_type'), 'refresh_token');
  assert.equal(seen.filter(c => c.url.endsWith('/token')).length, 1);
  assert.equal(seen[1].options.headers.Authorization, 'Bearer synthetic-access');
  const insertion = JSON.parse(seen[1].options.body); assert.ok(!('attendees' in insertion)); assert.deepEqual(insertion.reminders, { useDefault: false });
  assert.ok(seen[1].url.endsWith('sendUpdates=none')); assert.equal(seen[2].options.headers['If-Match'], '"old"');
  assert.equal(JSON.parse(seen[2].options.body).start.dateTime, null);
  assert.ok(seen.every(c => c.options.redirect === 'error'));
});

test('disconnect disables local tokens even when revocation fails and preserves dedicated calendar identity', async t => {
  const f = fixtureAuth(t); await f.connect(); const id = f.store.load().calendar_id;
  const result = await disconnectGoogle(f.store, async () => { throw new Error('secret must stay hidden'); });
  assert.equal(result.disconnected, true); assert.equal(result.revoked, false); assert.ok(!JSON.stringify(result).includes('secret'));
  assert.equal(f.store.load().refresh_token, null); assert.equal(f.store.load().calendar_id, id);
  assert.throws(() => connectedAPI(f.store), code('GOOGLE_NOT_CONNECTED'));
  await f.connect(); const success = await disconnectGoogle(f.store, f.send);
  assert.equal(success.revoked, true); assert.equal(f.store.load().access_token, null);
});

test('auth storage rejects copied workspaces and linked parents; HTTP errors never expose bodies or credentials', async t => {
  const f = fixtureAuth(t); await f.connect(); const other = fixture(t);
  const copied = new GoogleAuthStore(other.workspace, join(f.root, 'auth'), protector);
  assert.throws(() => copied.load(), code('GOOGLE_SECRET_STORE'));
  const outside = join(f.root, 'outside'); mkdirSync(outside);
  symlinkSync(outside, join(f.root, 'linked'), process.platform === 'win32' ? 'junction' : 'dir');
  assert.throws(() => new GoogleAuthStore(f.workspace, join(f.root, 'linked/new'), protector), code('LINK_NOT_ALLOWED'));
  assert.ok(!existsSync(join(outside, 'new')));
  await assert.rejects(googleRequest('https://www.googleapis.com/calendar/v3/calendars', {}, async () => new Response('secret-token', { status: 401 })), e => e instanceof GoogleHttpError && !e.message.includes('secret-token'));
  await assert.rejects(googleRequest('https://www.googleapis.com/calendar/v3/calendars', {}, async () => json('x'.repeat(1024 * 1024 + 1))), code('GOOGLE_RESPONSE'));
});

test('Windows DPAPI protects synthetic credentials; other platforms fail clearly; CLI help never connects', () => {
  if (process.platform === 'win32') {
    const encrypted = windowsProtector.seal('synthetic refresh token only');
    assert.ok(!encrypted.includes('synthetic')); assert.equal(windowsProtector.open(encrypted), 'synthetic refresh token only');
  } else assert.throws(() => windowsProtector.seal('synthetic'), code('GOOGLE_PLATFORM'));
  const help = spawnSync(process.execPath, [join(projectRoot, 'dist/google-cli.js'), '--help'], { encoding: 'utf8' });
  assert.equal(help.status, 0); assert.match(help.stdout, /dedicated JobShot calendar/);
});
