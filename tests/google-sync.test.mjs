import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { calendarPreview, calendarSync } from '../dist/google-sync.js';
import { GoogleHttpError } from '../dist/google-http.js';
import { postingImport } from '../dist/postings.js';
import { postingTrack } from '../dist/calendar.js';
import { fixture, image, input } from './helpers.mjs';

const snapshot = file => ({ bytes: readFileSync(file), mtime: statSync(file).mtimeMs });
const code = c => e => e.code === c;
async function setup(t, extra = {}) {
  const f = fixture(t); await image(f.root); const p = await postingImport(f.workspace, input(extra));
  const file = join(f.root, p.folder, '공고정보.json');
  const current = () => { const v = calendarPreview(f.workspace, p.posting.id); return { id: v.id, posting_sha256: v.posting_sha256 }; };
  return { ...f, p, file, current };
}
function provider() {
  let remote = null, seq = 0;
  const calls = [];
  return { calendarId: 'synthetic-calendar', calls, get remote() { return remote; }, set remote(v) { remote = v; },
    async get(id) { calls.push(['get', id]); return structuredClone(remote); },
    async insert(id, payload, postingId) { calls.push(['insert', id, payload]); remote = { ...structuredClone(payload), id, etag: `"${++seq}"`, extendedProperties: { private: { jobshot_id: postingId } } }; return structuredClone(remote); },
    async patch(id, payload, etag) { calls.push(['patch', id, payload, etag]); if (etag !== remote.etag) throw new GoogleHttpError(412); remote = { ...remote, ...structuredClone(payload), etag: `"${++seq}"` }; return structuredClone(remote); },
  };
}

test('preview is local, sends minimal all-day fields, and computes exclusive year/leap end dates', async t => {
  for (const [date, end] of [['2026-12-31', '2027-01-01'], ['2028-02-29', '2028-03-01']]) {
    const f = await setup(t, { deadline: { kind: 'date', date } }); const before = snapshot(f.file);
    const value = calendarPreview(f.workspace, f.p.posting.id);
    assert.equal(value.network_requested, false); assert.equal(value.event.start.date, date); assert.equal(value.event.end.date, end);
    assert.deepEqual(Object.keys(value.event).sort(), ['description', 'end', 'start', 'summary']);
    assert.ok(!JSON.stringify(value.event).includes('dateTime')); assert.deepEqual(snapshot(f.file), before);
    assert.match(value.event_id, /^[0-9a-v]{5,1024}$/);
  }
});

test('sync creates once, preserves sources and local tracking, retries as no-op and updates by If-Match', async t => {
  const f = await setup(t); postingTrack(f.workspace, f.p.posting.id, true);
  const source = join(f.root, f.p.posting.source_images[0]), html = join(f.root, 'dashboard/index.html');
  const before = [snapshot(source), snapshot(html)]; const api = provider();
  const first = await calendarSync(f.workspace, f.current(), async () => api);
  assert.equal(first.synced, true); assert.equal(first.remote_changed, true);
  const again = await calendarSync(f.workspace, f.current(), async () => api);
  assert.equal(again.remote_changed, false); assert.equal(api.calls.filter(c => c[0] === 'insert').length, 1);
  let record = JSON.parse(readFileSync(f.file)); record.deadline.date = '2026-11-02'; writeFileSync(f.file, JSON.stringify(record));
  const previousEtag = api.remote.etag;
  const updated = await calendarSync(f.workspace, f.current(), async () => api);
  assert.equal(updated.synced, true); assert.equal(api.calls.at(-1)[0], 'patch'); assert.equal(api.calls.at(-1)[3], previousEtag);
  record = JSON.parse(readFileSync(f.file)); assert.equal(record.status, 'tracked'); assert.equal(record.calendar.status, 'synced');
  assert.equal(record.evaluation, null); assert.deepEqual([snapshot(source), snapshot(html)], before);
});

test('unknown dates and stale posting hashes fail before opening a connection', async t => {
  const f = await setup(t, { deadline: { kind: 'unknown' } }); let connections = 0;
  assert.throws(() => calendarPreview(f.workspace, f.p.posting.id), code('DEADLINE_REQUIRED'));
  await assert.rejects(calendarSync(f.workspace, { id: f.p.posting.id, posting_sha256: '0'.repeat(64) }, async () => { connections++; return provider(); }), code('DEADLINE_REQUIRED'));
  const g = await setup(t); const old = g.current(); postingTrack(g.workspace, g.p.posting.id, true);
  await assert.rejects(calendarSync(g.workspace, old, async () => { connections++; return provider(); }), code('STALE_POSTING'));
  assert.equal(connections, 0);
});

test('external edits return differences; only explicitly approved current etag can overwrite', async t => {
  const f = await setup(t), api = provider(); await calendarSync(f.workspace, f.current(), async () => api);
  api.remote.summary = '사용자가 바꾼 가상 일정'; api.remote.etag = '"external"';
  const conflict = await calendarSync(f.workspace, f.current(), async () => api);
  assert.equal(conflict.conflict, true); assert.equal(conflict.google.summary, api.remote.summary); assert.equal(conflict.event_etag, '"external"');
  assert.equal(api.calls.filter(c => c[0] === 'patch').length, 0);
  api.remote.etag = '"newer"';
  const stale = await calendarSync(f.workspace, { ...f.current(), resolve_conflict_etag: conflict.event_etag }, async () => api);
  assert.equal(stale.conflict, true); assert.equal(api.calls.filter(c => c[0] === 'patch').length, 0);
  const accepted = await calendarSync(f.workspace, { ...f.current(), resolve_conflict_etag: stale.event_etag }, async () => api);
  assert.equal(accepted.synced, true); assert.equal(api.calls.filter(c => c[0] === 'patch').length, 1);
});

test('412 races, remote deletions, foreign IDs and attendees never cause blind overwrite or recreation', async t => {
  const f = await setup(t), api = provider(); await calendarSync(f.workspace, f.current(), async () => api);
  const record = JSON.parse(readFileSync(f.file)); record.role = '가상 변경 직무'; writeFileSync(f.file, JSON.stringify(record));
  const patch = api.patch; api.patch = async () => { throw new GoogleHttpError(412); };
  const raced = await calendarSync(f.workspace, f.current(), async () => api); assert.equal(raced.error.code, 'GOOGLE_CONFLICT');
  api.patch = patch;
  const remote = structuredClone(api.remote); api.remote = null;
  assert.equal((await calendarSync(f.workspace, f.current(), async () => api)).error.code, 'GOOGLE_EVENT_DELETED');
  assert.equal(api.calls.filter(c => c[0] === 'insert').length, 1);
  api.remote = remote; api.remote.extendedProperties.private.jobshot_id = 'different';
  assert.equal((await calendarSync(f.workspace, f.current(), async () => api)).error.code, 'GOOGLE_ID_CONFLICT');
  api.remote = remote; api.remote.extendedProperties.private.jobshot_id = f.p.posting.id; api.remote.attendees = [{ email: 'synthetic@example.com' }];
  assert.equal((await calendarSync(f.workspace, f.current(), async () => api)).error.code, 'GOOGLE_EVENT_UNSUPPORTED');
});

test('lost insert responses and local-save failures recover by stable event ID without duplicates', async t => {
  const f = await setup(t), api = provider(), insert = api.insert;
  api.insert = async (...args) => { await insert(...args); throw new Error('synthetic secret must not escape'); };
  const lost = await calendarSync(f.workspace, f.current(), async () => api);
  assert.equal(lost.synced, false); assert.ok(!JSON.stringify(lost).includes('synthetic secret'));
  assert.equal(JSON.parse(readFileSync(f.file)).calendar.status, 'sync_failed');
  api.insert = insert;
  assert.equal((await calendarSync(f.workspace, f.current(), async () => api)).synced, true);
  assert.equal(api.calls.filter(c => c[0] === 'insert').length, 1);
  const g = await setup(t), other = provider(); const before = snapshot(g.file);
  const partial = await calendarSync(g.workspace, g.current(), async () => other, () => { throw new Error('disk full'); });
  assert.equal(partial.synced, true); assert.equal(partial.local_record_updated, false); assert.deepEqual(snapshot(g.file), before);
  assert.equal((await calendarSync(g.workspace, g.current(), async () => other)).synced, true);
  assert.equal(other.calls.filter(c => c[0] === 'insert').length, 1);
});

test('shared lock remains held during async requests and manual local edits are preserved', async t => {
  const f = await setup(t), api = provider();
  const get = api.get;
  api.get = async id => {
    assert.throws(() => postingTrack(f.workspace, f.p.posting.id, true), code('IMPORT_BUSY'));
    const record = JSON.parse(readFileSync(f.file)); record.role = '사용자가 수정한 직무'; writeFileSync(f.file, JSON.stringify(record));
    return get(id);
  };
  const result = await calendarSync(f.workspace, f.current(), async () => api);
  assert.equal(result.local_record_updated, false); assert.equal(JSON.parse(readFileSync(f.file)).role, '사용자가 수정한 직무');
  assert.equal(JSON.parse(readFileSync(f.file)).calendar, null);
  assert.equal(api.remote, null); assert.equal(api.calls.filter(c => c[0] === 'insert').length, 0);
});

test('409 insert races adopt matching owned event and rate limits preserve the last successful baseline', async t => {
  const f = await setup(t), api = provider(), insert = api.insert;
  api.insert = async (...args) => { await insert(...args); throw new GoogleHttpError(409); };
  const adopted = await calendarSync(f.workspace, f.current(), async () => api); assert.equal(adopted.synced, true);
  assert.equal(api.calls.filter(c => c[0] === 'insert').length, 1);
  const baseline = JSON.parse(readFileSync(f.file)).calendar;
  api.get = async () => { throw new GoogleHttpError(429); };
  const failed = await calendarSync(f.workspace, f.current(), async () => api);
  assert.equal(failed.error.code, 'GOOGLE_RATE_LIMIT');
  const after = JSON.parse(readFileSync(f.file)).calendar;
  assert.equal(after.status, 'sync_failed'); assert.equal(after.etag, baseline.etag); assert.deepEqual(after.last_payload, baseline.last_payload);
  const again = await postingImport(f.workspace, input()); assert.equal(again.duplicate, true);
  assert.deepEqual(again.posting.calendar, after);
});

test('source URLs cannot inject active HTML into Google event descriptions', async t => {
  const f = await setup(t, { source_url: 'https://example.com/<img>?a=1&b=2' });
  const preview = calendarPreview(f.workspace, f.p.posting.id);
  assert.ok(!preview.event.description.includes('<img>')); assert.ok(preview.event.description.includes('&lt;img&gt;'));
  assert.ok(preview.event.description.includes('&amp;b=2'));
});

test('target changes and unsafe local destinations stop before external writes', async t => {
  const f = await setup(t), api = provider(); await calendarSync(f.workspace, f.current(), async () => api);
  const count = api.calls.length; api.calendarId = 'another-calendar';
  await assert.rejects(calendarSync(f.workspace, f.current(), async () => api), code('GOOGLE_TARGET_CHANGED'));
  assert.equal(api.calls.length, count);
  mkdirSync(join(f.root, '.jobshot/import.lock'));
  await assert.rejects(calendarSync(f.workspace, { id: f.p.posting.id, posting_sha256: '0'.repeat(64) }, async () => api), code('IMPORT_BUSY'));
});
