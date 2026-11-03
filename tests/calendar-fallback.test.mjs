import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { syncWithLocalFallback } from '../dist/calendar-fallback.js';
import { calendarPreview, calendarSync } from '../dist/google-sync.js';
import { postingTrack, dashboardBuild } from '../dist/calendar.js';
import { JobShotError } from '../dist/errors.js';
import { GoogleHttpError } from '../dist/google-http.js';
import { postingImport } from '../dist/postings.js';
import { fixture, image, input } from './helpers.mjs';

async function setup(t) {
  const f = fixture(t); const original = await image(f.root);
  const p = await postingImport(f.workspace, input());
  const file = join(f.root, p.folder, '공고정보.json');
  const current = () => { const p = calendarPreview(f.workspace, id); return { id, posting_sha256: p.posting_sha256 }; };
  const id = p.posting.id;
  return { ...f, p, id, file, original, current, record: () => JSON.parse(readFileSync(file)) };
}
const disconnected = async () => { throw new JobShotError('GOOGLE_NOT_CONNECTED', 'Connect first'); };

test('unconnected Google falls back to a standalone local calendar and repeated failures never duplicate entries', async t => {
  const f = await setup(t);
  const first = await syncWithLocalFallback(f.workspace, f.current(), disconnected);
  assert.equal(first.synced, false); assert.equal(first.error.code, 'GOOGLE_NOT_CONNECTED');
  assert.equal(first.remote_result, 'not_attempted'); assert.equal(first.local_calendar.dashboard_updated, true);
  assert.equal(f.record().status, 'tracked'); assert.equal(f.record().tracking_previous_status, 'imported');
  assert.equal(first.posting_sha256, f.current().posting_sha256);
  const again = await syncWithLocalFallback(f.workspace, f.current(), disconnected);
  assert.equal(again.local_calendar.changed, false);
  const html = readFileSync(join(f.root, first.local_calendar.path), 'utf8');
  const data = JSON.parse(html.match(/<script id="jobshot-data"[^>]*>(.*?)<\/script>/s)[1]);
  assert.equal(data.entries.length, 1); assert.equal(data.entries[0].id, f.id);
  assert.deepEqual(readFileSync(join(f.root, f.p.posting.source_images[0])), f.original);
  postingTrack(f.workspace, f.id, false); assert.equal(f.record().status, 'imported');
});

test('permission and uncertain network failures preserve Google errors and fall back using the new saved hash', async t => {
  for (const [error, expected] of [[new GoogleHttpError(403), 'GOOGLE_AUTH'], [new JobShotError('GOOGLE_NETWORK', 'Lost response'), 'GOOGLE_NETWORK']]) {
    const f = await setup(t);
    const provider = { calendarId: 'synthetic', get: async () => { throw error; } };
    const result = await syncWithLocalFallback(f.workspace, f.current(), (w, i) => calendarSync(w, i, async () => provider));
    assert.equal(result.synced, false); assert.equal(result.error.code, expected); assert.equal(result.remote_result, 'unconfirmed');
    assert.equal(result.local_calendar.dashboard_updated, true); assert.equal(f.record().calendar.status, 'sync_failed');
    assert.equal(result.posting_sha256, f.current().posting_sha256);
  }
});

test('remote conflict is preserved while local fallback remains usable without overwriting Google', async t => {
  const f = await setup(t); let writes = 0;
  const provider = { calendarId: 'synthetic', get: async () => ({ id: `jobshot${f.id}`, etag: '"external"', summary: '외부 수정', start: { date: '2026-11-01' }, end: { date: '2026-11-02' }, extendedProperties: { private: { jobshot_id: f.id } } }), patch: async () => { writes++; } };
  const result = await syncWithLocalFallback(f.workspace, f.current(), (w, i) => calendarSync(w, i, async () => provider));
  assert.equal(result.conflict, true); assert.equal(result.google.summary, '외부 수정'); assert.equal(result.event_etag, '"external"');
  assert.equal(result.local_calendar.dashboard_updated, true); assert.equal(writes, 0); assert.equal(f.record().calendar.status, 'conflict');
});

test('successful Google registration keeps local registration independent, even when local result saving failed', async t => {
  const f = await setup(t); const before = readFileSync(f.file);
  for (const local_record_updated of [true, false]) {
    const success = { id: f.id, synced: true, local_record_updated, remote_changed: true };
    const result = await syncWithLocalFallback(f.workspace, f.current(), async () => success);
    assert.deepEqual(result, success); assert.deepEqual(readFileSync(f.file), before);
    assert.equal(existsSync(join(f.root, 'dashboard/index.html')), false);
  }
});

test('invalid inputs, stale preview and concurrent edits cannot trigger fallback registration', async t => {
  const f = await setup(t); const before = readFileSync(f.file);
  await assert.rejects(syncWithLocalFallback(f.workspace, { id: 'bad', posting_sha256: 'bad' }, disconnected), e => e.code === 'INVALID_INPUT');
  await assert.rejects(syncWithLocalFallback(f.workspace, { ...f.current(), posting_sha256: '0'.repeat(64) }), e => e.code === 'STALE_POSTING');
  assert.deepEqual(readFileSync(f.file), before);
  const old = f.current();
  const result = await syncWithLocalFallback(f.workspace, old, async () => {
    const r = f.record(); r.role = '동시 변경'; writeFileSync(f.file, JSON.stringify(r)); return disconnected();
  });
  assert.equal(result.local_calendar.error.code, 'STALE_POSTING'); assert.equal(f.record().status, 'imported'); assert.equal(f.record().role, '동시 변경');
  const unconfirmed = await syncWithLocalFallback(f.workspace, f.current(), async () => ({ id: f.id, synced: false, local_record_updated: false, error: { code: 'STALE_POSTING', message: 'changed' } }));
  assert.equal(unconfirmed.local_calendar.attempted, false); assert.equal(f.record().status, 'imported');
});

test('local HTML write failure reports saved tracking separately and can be rebuilt', async t => {
  const f = await setup(t);
  const track = (w, id, tracked, _write, expected) => postingTrack(w, id, tracked, () => { throw new Error('disk failure'); }, expected);
  const result = await syncWithLocalFallback(f.workspace, f.current(), disconnected, track);
  assert.equal(result.synced, false); assert.equal(result.local_calendar.tracked, true); assert.equal(result.local_calendar.dashboard_updated, false);
  assert.equal(result.posting_sha256, f.current().posting_sha256); assert.equal(f.record().status, 'tracked');
  assert.equal(existsSync(join(f.root, 'dashboard/index.html')), false);
  assert.equal(dashboardBuild(f.workspace).tracked_count, 1);
});

test('blocked local output preserves original records and reports both failures without claiming fallback succeeded', async t => {
  const f = await setup(t); const before = readFileSync(f.file);
  mkdirSync(join(f.root, 'dashboard/index.html'), { recursive: true });
  const result = await syncWithLocalFallback(f.workspace, f.current(), disconnected);
  assert.equal(result.synced, false); assert.equal(result.local_calendar.error.code, 'INVALID_FILE');
  assert.equal(result.local_calendar.tracked, undefined); assert.deepEqual(readFileSync(f.file), before);
});
