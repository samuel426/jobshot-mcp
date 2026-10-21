import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync, statSync, symlinkSync, linkSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { postingImport } from '../dist/postings.js';
import { dashboardBuild, postingList, postingTrack } from '../dist/calendar.js';
import { monthCells, todayKey } from '../dist/dashboard-view.js';
import { fixture, image, input } from './helpers.mjs';

const data = html => JSON.parse(html.match(/<script id="jobshot-data"[^>]*>(.*?)<\/script>/s)[1]);
const dashboard = root => readFileSync(join(root, 'dashboard/index.html'), 'utf8');
const recordPath = (root, posting) => join(root, posting.folder, '공고정보.json');
const code = expected => error => error.code === expected;

test('only explicitly tracked records enter HTML; untrack restores state and import stays idempotent', async t => {
  const { root, workspace } = fixture(t); await image(root);
  const a = await postingImport(workspace, input());
  const b = await postingImport(workspace, input({ company: '분석전용기업' }));
  const file = recordPath(root, b);
  writeFileSync(file, JSON.stringify({ ...b.posting, status: 'analyzed', evaluation: { private: 'PRIVATE_ESSAY' } }));
  assert.equal(dashboardBuild(workspace).tracked_count, 0);
  assert.deepEqual(data(dashboard(root)).entries, []);
  const source = readFileSync(join(root, a.posting.source_images[0]));
  const tracked = postingTrack(workspace, a.posting.id, true);
  assert.equal(tracked.dashboard_updated, true);
  assert.equal(data(dashboard(root)).entries.length, 1);
  assert.ok(!dashboard(root).includes('PRIVATE_ESSAY'));
  const before = statSync(recordPath(root, a)).mtimeMs;
  assert.equal(postingTrack(workspace, a.posting.id, true).changed, false);
  assert.equal(statSync(recordPath(root, a)).mtimeMs, before);
  const imported = await postingImport(workspace, input());
  assert.equal(imported.duplicate, true); assert.equal(imported.posting.status, 'tracked');
  assert.deepEqual(readFileSync(join(root, a.posting.source_images[0])), source);
  postingTrack(workspace, b.posting.id, true);
  postingTrack(workspace, b.posting.id, false);
  assert.equal(JSON.parse(readFileSync(file)).status, 'analyzed');
  postingTrack(workspace, a.posting.id, false);
  assert.equal(JSON.parse(readFileSync(recordPath(root, a))).status, 'imported');
  assert.deepEqual(data(dashboard(root)).entries, []);
  assert.equal(postingList(workspace).postings.length, 2);
});

test('unknown/rolling dates stay undated, script-like text stays data, personal bodies never enter HTML', async t => {
  const { root, workspace } = fixture(t); await image(root);
  const text = '</script><img src=x onerror=alert(1)> & "';
  const a = await postingImport(workspace, input({ company: text, deadline: { kind: 'unknown' } }));
  const b = await postingImport(workspace, input({ company: '상시기업', deadline: { kind: 'rolling' }, source_url: null }));
  writeFileSync(join(root, '개인 자료/비공개.md'), 'PRIVATE_PROFILE');
  const file = recordPath(root, a);
  writeFileSync(file, JSON.stringify({ ...a.posting, evaluation: { text: 'PRIVATE_ESSAY' }, profile_sources: ['PRIVATE_SOURCE'] }));
  postingTrack(workspace, a.posting.id, true); postingTrack(workspace, b.posting.id, true);
  const html = dashboard(root), entries = data(html).entries;
  assert.deepEqual(entries.map(e => e.date), [null, null]);
  assert.equal(entries.find(e => e.id === a.posting.id).company, text);
  assert.ok(!html.includes(text));
  for (const privateText of ['PRIVATE_PROFILE', 'PRIVATE_ESSAY', 'PRIVATE_SOURCE']) assert.ok(!html.includes(privateText));
  assert.match(html, /Content-Security-Policy/);
});

test('malformed dates/links/duplicate IDs fail without replacing dashboard or changing tracking', async t => {
  const { root, workspace } = fixture(t); await image(root);
  const a = await postingImport(workspace, input());
  dashboardBuild(workspace); const before = dashboard(root);
  const file = recordPath(root, a);
  for (const modified of [
    { ...a.posting, deadline: { ...a.posting.deadline, date: '2026-02-30' } },
    { ...a.posting, source_url: 'javascript:alert(1)' },
    { ...a.posting, source_url: 'https://user:password@example.com' },
  ]) {
    writeFileSync(file, JSON.stringify(modified)); const bytes = readFileSync(file);
    assert.throws(() => postingTrack(workspace, a.posting.id, true), code('INVALID_RECORD'));
    assert.equal(dashboard(root), before); assert.deepEqual(readFileSync(file), bytes);
  }
  writeFileSync(file, JSON.stringify(a.posting));
  mkdirSync(join(root, '공고/중복'));
  writeFileSync(join(root, '공고/중복/공고정보.json'), JSON.stringify(a.posting));
  assert.throws(() => dashboardBuild(workspace), code('INVALID_RECORD'));
  assert.equal(dashboard(root), before);
});

test('blocked output and shared write lock preserve state; partial HTML failure is recoverable', async t => {
  const { root, workspace } = fixture(t); await image(root);
  const a = await postingImport(workspace, input()); const file = recordPath(root, a);
  mkdirSync(join(root, '.jobshot/import.lock'));
  assert.throws(() => postingTrack(workspace, a.posting.id, true), code('IMPORT_BUSY'));
  assert.equal(JSON.parse(readFileSync(file)).status, 'imported');
  const { rmdirSync } = await import('node:fs'); rmdirSync(join(root, '.jobshot/import.lock'));
  dashboardBuild(workspace); const before = dashboard(root);
  const result = postingTrack(workspace, a.posting.id, true, () => { throw new Error('Simulated output write failure'); });
  assert.equal(result.dashboard_updated, false); assert.equal(result.tracked, true);
  assert.equal(JSON.parse(readFileSync(file)).status, 'tracked'); assert.equal(dashboard(root), before);
  assert.equal(dashboardBuild(workspace).tracked_count, 1);
  assert.equal(data(dashboard(root)).entries.length, 1);
  assert.ok(!readdirSync(join(root, 'dashboard')).some(x => x.includes('pending')));
});

test('dashboard junctions and hard links cannot redirect writes', async t => {
  const { root, workspace } = fixture(t); await image(root); const a = await postingImport(workspace, input());
  const outside = join(root, 'outside'); mkdirSync(outside);
  symlinkSync(outside, join(root, 'dashboard'), process.platform === 'win32' ? 'junction' : 'dir');
  assert.throws(() => postingTrack(workspace, a.posting.id, true), code('LINK_NOT_ALLOWED'));
  assert.equal(JSON.parse(readFileSync(recordPath(root, a))).status, 'imported');
  const { unlinkSync } = await import('node:fs'); unlinkSync(join(root, 'dashboard')); mkdirSync(join(root, 'dashboard'));
  const original = join(outside, 'original.html'); writeFileSync(original, 'KEEP'); linkSync(original, join(root, 'dashboard/index.html'));
  assert.throws(() => dashboardBuild(workspace), code('INVALID_FILE'));
  assert.equal(readFileSync(original, 'utf8'), 'KEEP');
});

test('calendar dates handle Korea midnight, leap February and year boundaries independently of host time zone', () => {
  assert.equal(todayKey(new Date('2026-10-21T14:59:59Z')), '2026-10-21');
  assert.equal(todayKey(new Date('2026-10-21T15:00:00Z')), '2026-10-22');
  assert.equal(monthCells(2024, 2).filter(Boolean).length, 29);
  assert.equal(monthCells(2025, 2).filter(Boolean).length, 28);
  assert.equal(monthCells(2026, 12).filter(Boolean).at(-1), '2026-12-31');
  assert.equal(monthCells(2027, 1).filter(Boolean)[0], '2027-01-01');
});
