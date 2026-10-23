import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, statSync, mkdirSync, rmdirSync, linkSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { postingGet, postingSaveAnalysis, jobFitWeights } from '../dist/analysis.js';
import { postingImport } from '../dist/postings.js';
import { profileRead } from '../dist/profile.js';
import { postingTrack, dashboardBuild } from '../dist/calendar.js';
import { fixture, image, input } from './helpers.mjs';
import { analysisInput } from './analysis-helpers.mjs';

const code = c => e => e.code === c;
const snapshot = p => ({ bytes: readFileSync(p), mtime: statSync(p).mtimeMs });
async function setup(t) {
  const f = fixture(t); await image(f.root);
  const p = await postingImport(f.workspace, input());
  const profilePath = join(f.root, '개인 자료/가상경험.md');
  writeFileSync(profilePath, '가상 인물의 개발 경험');
  const current = () => analysisInput(postingGet(f.workspace, p.posting.id), profileRead(f.workspace, '가상경험.md'));
  return { ...f, p, profilePath, current, file: join(f.root, p.folder, '공고정보.json'), report: join(f.root, p.folder, '분석.md') };
}

test('analysis uses rubric, saves source versions, preserves originals and stays off calendar', async t => {
  const f = await setup(t);
  assert.deepEqual(jobFitWeights, JSON.parse(readFileSync(new URL('../docs/evaluation-rubric.json', import.meta.url))).job_fit);
  const original = join(f.root, f.p.posting.source_images[0]);
  const before = [snapshot(original), snapshot(f.profilePath)];
  const result = postingSaveAnalysis(f.workspace, f.current());
  assert.equal(result.score, 100); assert.equal(result.report_updated, true);
  assert.equal(result.status, 'analyzed'); assert.equal(dashboardBuild(f.workspace).tracked_count, 0);
  const stored = postingGet(f.workspace, f.p.posting.id);
  assert.equal(stored.posting.evaluation.rubric_version, '0.1');
  assert.equal(stored.posting.evaluation.posting_image_sha256, f.p.posting.image_sha256);
  assert.equal(stored.posting.profile_sources[0].sha256, f.current().profile_sources[0].sha256);
  assert.ok(stored.posting.profile_sources[0].read_at);
  assert.equal(stored.posting.calendar, null);
  assert.deepEqual([snapshot(original), snapshot(f.profilePath)], before);
  assert.match(readFileSync(f.report, 'utf8'), /직무 적합도 100\/100/);
  assert.equal((await postingImport(f.workspace, input())).posting.status, 'analyzed');
});

test('not-applicable weights normalize; unmet requirements remain visible and unknowns withhold', async t => {
  const f = await setup(t);
  let a = f.current();
  a.criteria.preferred_qualifications = { status: 'not_applicable', score: null, reason: '공고에 우대 조건 없음', posting_evidence: [], evidence: [] };
  a.criteria.evidence_and_results.score = 20;
  a.required_requirements[0].status = 'unmet';
  a.required_requirements[0].reason = '자료를 비교한 결과 미충족';
  let result = postingSaveAnalysis(f.workspace, a);
  assert.equal(result.score, 94.1); assert.equal(result.required_requirements[0].status, 'unmet');
  a = f.current(); a.required_requirements[0].status = 'unknown'; a.required_requirements[0].evidence = [];
  result = postingSaveAnalysis(f.workspace, a); assert.equal(result.score, null); assert.equal(result.withheld, true);
  a = f.current(); a.criteria.evidence_and_results.status = 'unknown'; a.criteria.evidence_and_results.score = null;
  assert.equal(postingSaveAnalysis(f.workspace, a).score, null);
  a = f.current(); a.missing_information = ['경험 기간 확인'];
  assert.equal(postingSaveAnalysis(f.workspace, a).score, null);
  a = f.current(); a.profile_sources = [];
  for (const c of Object.values(a.criteria)) { c.status = 'unknown'; c.score = null; c.evidence = []; }
  a.required_requirements[0].status = 'unknown'; a.required_requirements[0].evidence = [];
  assert.equal(postingSaveAnalysis(f.workspace, a).score, null);
});

test('stale material/posting, invented citations and invalid scores never overwrite saved analysis', async t => {
  const f = await setup(t); postingSaveAnalysis(f.workspace, f.current());
  const before = [snapshot(f.file), snapshot(f.report)];
  const a = f.current(); writeFileSync(f.profilePath, '사용자가 추가한 최신 경험');
  assert.throws(() => postingSaveAnalysis(f.workspace, a), code('STALE_PROFILE'));
  for (const mutate of [
    v => { v.criteria.evidence_and_results.score = 26; },
    v => { delete v.criteria.evidence_and_results; },
    v => { v.criteria.evidence_and_results.status = 'unknown'; },
    v => { v.required_requirements = []; },
    v => { v.criteria.required_qualifications.status = 'not_applicable'; v.criteria.required_qualifications.score = null; },
  ]) { const b = f.current(); mutate(b); assert.throws(() => postingSaveAnalysis(f.workspace, b), code('INVALID_ANALYSIS')); }
  const b = f.current(); b.criteria.evidence_and_results.evidence = [{ source_index: 0, quote: '없는 수치 999%' }];
  assert.throws(() => postingSaveAnalysis(f.workspace, b), code('INVALID_EVIDENCE'));
  b.criteria.evidence_and_results.evidence = [{ source_index: 5, quote: '없는 자료' }];
  assert.throws(() => postingSaveAnalysis(f.workspace, b), code('INVALID_EVIDENCE'));
  assert.deepEqual([snapshot(f.file), snapshot(f.report)], before);
  const latest = f.current(); postingSaveAnalysis(f.workspace, latest);
  assert.equal(postingGet(f.workspace, f.p.posting.id).posting.profile_sources[0].sha256, latest.profile_sources[0].sha256);
  assert.throws(() => postingSaveAnalysis(f.workspace, latest), code('STALE_POSTING'));
});

test('analysis of a tracked posting preserves HTML/Google and untracking restores analyzed', async t => {
  const f = await setup(t); postingTrack(f.workspace, f.p.posting.id, true);
  const html = join(f.root, 'dashboard/index.html'), before = snapshot(html);
  const result = postingSaveAnalysis(f.workspace, f.current());
  assert.equal(result.status, 'tracked'); assert.deepEqual(snapshot(html), before);
  assert.ok(!readFileSync(html, 'utf8').includes('가상 인물의 개발 경험'));
  postingTrack(f.workspace, f.p.posting.id, false);
  assert.equal(postingGet(f.workspace, f.p.posting.id).posting.status, 'analyzed');
});

test('shared lock, blocked paths and Markdown failure have explicit recovery and no original writes', async t => {
  const f = await setup(t); const a = f.current(), before = snapshot(f.file);
  mkdirSync(join(f.root, '.jobshot/import.lock'));
  assert.throws(() => postingSaveAnalysis(f.workspace, a), code('IMPORT_BUSY'));
  rmdirSync(join(f.root, '.jobshot/import.lock'));
  linkSync(f.profilePath, f.report);
  assert.throws(() => postingSaveAnalysis(f.workspace, a), code('INVALID_FILE'));
  assert.deepEqual(snapshot(f.file), before);
  const { unlinkSync } = await import('node:fs'); unlinkSync(f.report);
  const result = postingSaveAnalysis(f.workspace, a, () => { throw new Error('Injected report failure'); });
  assert.equal(result.report_updated, false); assert.equal(result.score, 100);
  assert.equal(postingGet(f.workspace, f.p.posting.id).posting.status, 'analyzed');
  assert.equal(postingSaveAnalysis(f.workspace, { ...a, posting_sha256: result.posting_sha256 }).report_updated, true);
  assert.equal(readFileSync(f.profilePath, 'utf8'), '가상 인물의 개발 경험');
});

test('cross-folder references, changed images and profile path escapes are rejected', async t => {
  const f = await setup(t); const a = f.current();
  a.profile_sources[0].path = '개인 자료/../secret.md';
  assert.throws(() => postingSaveAnalysis(f.workspace, a), code('INVALID_PATH'));
  const dir = join(f.root, 'outside'); mkdirSync(dir);
  symlinkSync(dir, join(f.root, '개인 자료/link'), process.platform === 'win32' ? 'junction' : 'dir');
  a.profile_sources[0].path = '개인 자료/link/file.md';
  assert.throws(() => postingSaveAnalysis(f.workspace, a), code('LINK_NOT_ALLOWED'));
  const record = JSON.parse(readFileSync(f.file)); record.source_images = ['inbox/공고.png'];
  writeFileSync(f.file, JSON.stringify(record));
  assert.throws(() => postingGet(f.workspace, a.id), code('INVALID_RECORD'));
  writeFileSync(f.file, JSON.stringify(f.p.posting));
  writeFileSync(join(f.root, f.p.posting.source_images[0]), 'changed');
  assert.throws(() => postingGet(f.workspace, a.id), code('STALE_POSTING'));
});

test('generated report escapes active Markdown and closed records reject saving', async t => {
  const f = await setup(t); const a = f.current();
  a.summary = ['<script>alert(1)</script> ![x](https://example.com/track)'];
  postingSaveAnalysis(f.workspace, a);
  const md = readFileSync(f.report, 'utf8'); assert.ok(!md.includes('<script>')); assert.ok(!md.includes('![x]('));
  const record = JSON.parse(readFileSync(f.file)); record.status = 'closed'; writeFileSync(f.file, JSON.stringify(record));
  assert.throws(() => postingSaveAnalysis(f.workspace, f.current()), code('INVALID_STATE'));
});
