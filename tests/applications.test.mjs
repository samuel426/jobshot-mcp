import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync, statSync, readdirSync, mkdirSync, rmdirSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { applicationSave, countAnswer, essayWeights } from '../dist/applications.js';
import { postingGet } from '../dist/analysis.js';
import { postingImport } from '../dist/postings.js';
import { postingTrack } from '../dist/calendar.js';
import { profileRead } from '../dist/profile.js';
import { fixture, image, input } from './helpers.mjs';
import { applicationInput, resumeEvaluation } from './application-helpers.mjs';

const code = value => error => error.code === value;
const snapshot = path => ({ bytes: readFileSync(path), mtime: statSync(path).mtimeMs });
async function setup(t) {
  const f = fixture(t); await image(f.root);
  const p = await postingImport(f.workspace, input());
  const source = join(f.root, '개인 자료/가상경험.md');
  writeFileSync(source, '가상 인물의 프로젝트 개발 경험');
  const current = () => applicationInput(postingGet(f.workspace, p.posting.id), profileRead(f.workspace, '가상경험.md'));
  return { ...f, p, source, current, versions: join(f.root, p.folder, '지원서류') };
}

test('essay and resume drafts preserve every version, sources, posting status and calendar', async t => {
  const f = await setup(t); postingTrack(f.workspace, f.p.posting.id, true);
  const protectedFiles = [f.source, join(f.root, f.p.posting.source_images[0]), join(f.root, f.p.folder, '공고정보.json'), join(f.root, 'dashboard/index.html')];
  const before = protectedFiles.map(snapshot);
  const a = f.current(); a.sections[0].answer = '  ' + a.sections[0].answer + '\r\n';
  const first = applicationSave(f.workspace, a);
  const stored = JSON.parse(readFileSync(join(f.root, first.record_path)));
  assert.equal(stored.sections[0].answer, a.sections[0].answer);
  assert.equal(stored.sections[0].evaluation.score, 100); assert.equal(first.sections[0].evaluated, true);
  assert.equal(stored.sections[0].prompt_sha256.length, 64); assert.ok(stored.profile_sources[0].read_at);
  const old = [snapshot(join(f.root, first.path)), snapshot(join(f.root, first.record_path))];
  const second = applicationSave(f.workspace, a);
  a.kind = 'resume'; a.sections[0].evaluation = resumeEvaluation(a.sections[0].answer.trim());
  const third = applicationSave(f.workspace, a);
  assert.equal(readdirSync(f.versions).length, 3); assert.notEqual(first.version, second.version);
  assert.equal(JSON.parse(readFileSync(join(f.root, third.record_path))).kind, 'resume');
  assert.deepEqual([snapshot(join(f.root, first.path)), snapshot(join(f.root, first.record_path))], old);
  assert.deepEqual(protectedFiles.map(snapshot), before);
});

test('each essay question gets its own rubric, evidence, perspectives and server total', async t => {
  const f = await setup(t), a = f.current();
  assert.deepEqual(essayWeights, JSON.parse(readFileSync(new URL('../docs/evaluation-rubric.json', import.meta.url))).essay_question);
  a.sections.push({ ...structuredClone(a.sections[0]), key: 'q2', prompt: '두 번째 가상 문항' });
  a.sections[1].evaluation.criteria.clarity.score = 10;
  a.sections[1].evaluation.criteria.clarity.deduction_reason = '역할과 결과 사이 설명이 생략되어 5점 감점';
  const r = applicationSave(f.workspace, a);
  assert.deepEqual(r.sections.map(s => s.score), [100, 95]);
  const clarity = r.sections[1].evaluation.criteria.clarity;
  assert.equal(clarity.maximum, 15); assert.equal(clarity.deducted, 5);
  assert.equal(clarity.reason, a.sections[1].evaluation.criteria.clarity.reason);
  assert.equal(clarity.deduction_reason, a.sections[1].evaluation.criteria.clarity.deduction_reason);
  assert.deepEqual(clarity.answer_quotes, [a.sections[1].answer]);
  const md = readFileSync(join(f.root, r.path), 'utf8');
  assert.match(md, /인사담당자 관점/); assert.match(md, /실무자 관점/); assert.match(md, /개선 우선순위/);
  assert.match(md, /감점 5/); assert.match(md, /역할과 결과 사이 설명/);
  const stored = JSON.parse(readFileSync(join(f.root, r.record_path)));
  assert.ok(stored.sections[0].evaluation.evaluated_at);
  a.kind = 'resume'; assert.throws(() => applicationSave(f.workspace, a), code('INVALID_APPLICATION'));
});

test('unknown facts, conflicts, missing evidence and unknown length withhold totals', async t => {
  const f = await setup(t);
  for (const mutate of [
    s => { s.claims[0].status = 'needs_confirmation'; s.claims[0].evidence = []; },
    s => { s.claims[0].status = 'conflict'; },
    s => { s.missing_information = ['실제 역할 확인']; },
    s => { s.claims = []; },
    s => { s.length_rule.spaces = 'unknown'; s.evaluation.criteria.format_compliance.status = 'unknown'; s.evaluation.criteria.format_compliance.score = null; },
  ]) {
    const a = f.current(); mutate(a.sections[0]);
    const r = applicationSave(f.workspace, a);
    assert.equal(r.sections[0].score, null); assert.equal(r.sections[0].withheld, true);
    assert.ok(r.sections[0].evaluation.withholding_reasons.length > 0);
    assert.match(readFileSync(join(f.root, r.path), 'utf8'), /점수 유보/);
  }
});

test('resume reviews always explain strengths, evidence gaps and improvements without numeric scores', async t => {
  const f = await setup(t), a = f.current();
  a.kind = 'resume'; a.sections[0].evaluation = resumeEvaluation(a.sections[0].answer);
  const r = applicationSave(f.workspace, a), review = r.sections[0].evaluation;
  assert.equal(r.sections[0].evaluated, true); assert.equal(review.score, null); assert.equal(review.withheld, true);
  assert.equal(review.mode, 'qualitative'); assert.ok(!('criteria' in review));
  assert.equal(review.strengths[0].comment, a.sections[0].evaluation.strengths[0].comment);
  assert.equal(review.evidence_gaps[0].comment, a.sections[0].evaluation.evidence_gaps[0].comment);
  assert.deepEqual(review.improvement_priorities, a.sections[0].evaluation.improvement_priorities);
  const md = readFileSync(join(f.root, r.path), 'utf8');
  for (const label of ['이력서 항목별 평가', '숫자 점수 유보', '강점', '부족한 근거', '개선 우선순위']) assert.ok(md.includes(label));
  assert.ok(!md.includes('/100'));
  const before = snapshot(join(f.root, r.record_path));
  for (const [error, mutate] of [
    ['INVALID_APPLICATION', s => { s.evaluation = null; }],
    ['INVALID_APPLICATION', s => { s.evaluation.score = 90; }],
    ['INVALID_APPLICATION', s => { delete s.evaluation.improvement_priorities; }],
    ['INVALID_EVIDENCE', s => { s.evaluation.strengths[0].answer_quotes = ['본문에 없는 강점']; }],
    ['INVALID_EVIDENCE', s => { s.evaluation.evidence_gaps[0].answer_quotes = ['다른 항목의 내용']; }],
  ]) {
    const b = structuredClone(a); mutate(b.sections[0]);
    assert.throws(() => applicationSave(f.workspace, b), code(error));
  }
  assert.equal(readdirSync(f.versions).length, 1); assert.deepEqual(snapshot(join(f.root, r.record_path)), before);
  a.kind = 'essay'; assert.throws(() => applicationSave(f.workspace, a), code('INVALID_APPLICATION'));
});

test('length preserves input and counts code points, whitespace, CRLF and boundaries explicitly', () => {
  const rule = { minimum: null, maximum: 5, spaces: 'included', platform: null };
  assert.equal(countAnswer('가 😀\r\n나', rule).included, 5);
  assert.equal(countAnswer('가 😀\r\n나', rule).excluded, 3);
  assert.equal(countAnswer('가 😀\r\n나', rule).status, 'within_limit');
  assert.equal(countAnswer('가 😀\r\n나다', rule).status, 'over_limit');
  assert.equal(countAnswer('가\t나', { ...rule, minimum: 4 }).status, 'under_minimum');
  assert.equal(countAnswer('가\t나', { ...rule, spaces: 'excluded' }).selected, 2);
  assert.equal(countAnswer('가', { ...rule, maximum: null }).status, 'unknown');
  assert.equal(countAnswer('가', { ...rule, spaces: 'unknown' }).selected, null);
});

test('invalid evidence, scores, keys, source paths and inconsistent format fail without new versions', async t => {
  const f = await setup(t); const saved = applicationSave(f.workspace, f.current());
  const before = snapshot(join(f.root, saved.record_path));
  for (const [error, mutate] of [
    ['INVALID_EVIDENCE', a => { a.sections[0].claims[0].evidence[0].quote = '조작한 수치 999%'; }],
    ['INVALID_EVIDENCE', a => { a.sections[0].claims[0].evidence[0].source_index = 5; }],
    ['INVALID_EVIDENCE', a => { a.sections[0].claims[0].evidence = []; }],
    ['INVALID_EVIDENCE', a => { a.sections[0].claims[0].text = '본문에 없는 경험'; }],
    ['INVALID_EVIDENCE', a => { a.sections[0].evaluation.criteria.clarity.answer_quotes = ['다른 문항의 문장']; }],
    ['INVALID_APPLICATION', a => { a.sections[0].evaluation.criteria.clarity.score = 16; }],
    ['INVALID_APPLICATION', a => { a.sections[0].evaluation = null; }],
    ['INVALID_APPLICATION', a => { delete a.sections[0].evaluation; }],
    ['INVALID_APPLICATION', a => { delete a.sections[0].evaluation.criteria.clarity.deduction_reason; }],
    ['INVALID_APPLICATION', a => { a.sections.push(a.sections[0]); }],
    ['INVALID_APPLICATION', a => { a.sections[0].length_rule.maximum = 1; }],
    ['INVALID_APPLICATION', a => { a.sections[0].length_rule.spaces = 'unknown'; }],
    ['INVALID_APPLICATION', a => { a.profile_sources = []; }],
    ['INVALID_APPLICATION', a => { a.profile_sources.push(a.profile_sources[0]); }],
    ['INVALID_PATH', a => { a.profile_sources[0].path = '개인 자료/../secret.md'; }],
  ]) {
    const a = f.current(); mutate(a);
    assert.throws(() => applicationSave(f.workspace, a), code(error));
    assert.equal(readdirSync(f.versions).length, 1);
  }
  assert.deepEqual(snapshot(join(f.root, saved.record_path)), before);
  const a = f.current(); a.sections[0].length_rule.maximum = 1; a.sections[0].evaluation.criteria.format_compliance.score = 0;
  assert.equal(applicationSave(f.workspace, a).sections[0].score, 95);
});

test('freshness, closed state, shared lock and linked destination reject writes', async t => {
  const f = await setup(t), a = f.current();
  writeFileSync(f.source, '사용자가 갱신한 경험');
  assert.throws(() => applicationSave(f.workspace, a), code('STALE_PROFILE'));
  const b = f.current(); postingTrack(f.workspace, f.p.posting.id, true);
  assert.throws(() => applicationSave(f.workspace, b), code('STALE_POSTING'));
  mkdirSync(join(f.root, '.jobshot/import.lock'));
  assert.throws(() => applicationSave(f.workspace, b), code('IMPORT_BUSY'));
  rmdirSync(join(f.root, '.jobshot/import.lock'));
  const c = f.current();
  const outside = join(f.root, 'outside'); mkdirSync(outside);
  symlinkSync(outside, f.versions, process.platform === 'win32' ? 'junction' : 'dir');
  assert.throws(() => applicationSave(f.workspace, c), code('LINK_NOT_ALLOWED'));
  assert.deepEqual(readdirSync(outside), []);
  const recordPath = join(f.root, f.p.folder, '공고정보.json');
  const record = JSON.parse(readFileSync(recordPath)); record.status = 'closed'; writeFileSync(recordPath, JSON.stringify(record));
  assert.throws(() => applicationSave(f.workspace, f.current()), code('INVALID_STATE'));
});

test('failed second file write publishes no version and preserves previous versions; retry works', async t => {
  const f = await setup(t); const a = f.current();
  const first = applicationSave(f.workspace, a), before = snapshot(join(f.root, first.record_path));
  let writes = 0;
  assert.throws(() => applicationSave(f.workspace, a, (...args) => {
    if (++writes === 2) throw new Error('Injected full disk');
    writeFileSync(...args);
  }), /Injected full disk/);
  assert.deepEqual(readdirSync(f.versions), [first.version]);
  assert.deepEqual(snapshot(join(f.root, first.record_path)), before);
  assert.ok(!existsSync(join(f.root, '.jobshot/import.lock')));
  assert.equal(applicationSave(f.workspace, a).saved, true);
});

test('untrusted prose cannot add active Markdown links, images or HTML to rendered drafts', async t => {
  const f = await setup(t), a = f.current();
  a.title = '[click](https://example.com)\n<script>alert(1)</script>';
  a.sections[0].answer += '\n![track](https://example.com/pixel)';
  const r = applicationSave(f.workspace, a), md = readFileSync(join(f.root, r.path), 'utf8');
  assert.ok(!md.includes('<script>')); assert.ok(!md.includes('![track](')); assert.ok(!md.includes('[click]('));
  assert.equal(JSON.parse(readFileSync(join(f.root, r.record_path))).sections[0].answer, a.sections[0].answer);
});

test('oversized versions and changed source images fail before creating output', async t => {
  const f = await setup(t), a = f.current();
  a.sections[0].answer = '가'.repeat(50000); a.sections[0].claims = [];
  for (const c of Object.values(a.sections[0].evaluation.criteria)) c.answer_quotes = ['가'];
  a.sections[0].evaluation.criteria.format_compliance.score = 0;
  a.sections = Array.from({ length: 8 }, (_, i) => ({ ...structuredClone(a.sections[0]), key: `q${i}` }));
  assert.throws(() => applicationSave(f.workspace, a), code('FILE_TOO_LARGE'));
  assert.ok(!existsSync(f.versions));
  const b = f.current(); writeFileSync(join(f.root, f.p.posting.source_images[0]), 'changed');
  assert.throws(() => applicationSave(f.workspace, b), code('STALE_POSTING'));
  assert.ok(!existsSync(f.versions));
});
