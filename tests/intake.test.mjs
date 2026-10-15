import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, linkSync, mkdirSync, readFileSync, readdirSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { Workspace, MAX_IMAGE_BYTES } from '../dist/workspace.js';
import { profileList, profileRead } from '../dist/profile.js';
import { postingImport } from '../dist/postings.js';
import { fixture, image, input } from './helpers.mjs';

test('profile reads fresh UTF-8 material without modifying source bytes or mtime', t => {
  const { root, workspace } = fixture(t);
  mkdirSync(join(root, '개인 자료', '프로젝트'));
  const path = join(root, '개인 자료', '프로젝트', '경험.md');
  writeFileSync(path, '# 가상 경험\n테스트용 프로젝트 기록');
  const before = statSync(path);
  const first = profileRead(workspace, '프로젝트/경험.md');
  assert.equal(first.text, readFileSync(path, 'utf8'));
  assert.equal(first.content_role, 'untrusted_user_material');
  assert.equal(statSync(path).mtimeMs, before.mtimeMs);
  assert.deepEqual(profileList(workspace).files.map(file => file.path), ['프로젝트/경험.md']);
  writeFileSync(path, '사용자가 갱신한 가상 경험');
  const updated = profileRead(workspace, '프로젝트/경험.md');
  assert.notEqual(first.sha256, updated.sha256);
  assert.equal(updated.text, '사용자가 갱신한 가상 경험');
});

test('empty, unsupported, invalid UTF-8 and oversized profiles are explicit', t => {
  const { root, workspace } = fixture(t);
  assert.deepEqual(profileList(workspace).files, []);
  writeFileSync(join(root, '개인 자료', 'sample.pdf'), 'synthetic placeholder');
  assert.equal(profileList(workspace).files[0].readable, false);
  assert.throws(() => profileRead(workspace, 'sample.pdf'), { code: 'UNSUPPORTED_FORMAT' });
  writeFileSync(join(root, '개인 자료', 'invalid.txt'), Buffer.from([0xff, 0xfe]));
  assert.throws(() => profileRead(workspace, 'invalid.txt'), { code: 'INVALID_ENCODING' });
  writeFileSync(join(root, '개인 자료', 'large.md'), Buffer.alloc(1024 * 1024 + 1));
  assert.throws(() => profileRead(workspace, 'large.md'), { code: 'FILE_TOO_LARGE' });
  assert.throws(() => profileRead(workspace, 'missing.md'), { code: 'FILE_NOT_FOUND' });
});

test('absolute, traversal, ADS and hidden paths are rejected', async t => {
  const { workspace, root } = fixture(t);
  for (const path of ['../README.md', '/etc/passwd', 'C:/secrets.txt', '..\\secret.md', 'file.txt:stream', '.env', 'CON.txt', 'foo/../bar.md']) {
    assert.throws(() => profileRead(workspace, path), { code: 'INVALID_PATH' }, path);
    await assert.rejects(postingImport(workspace, input({ image_path: path })), { code: 'INVALID_PATH' });
  }
  assert.deepEqual(readdirSync(join(root, '공고')), []);
});

test('profile and inbox junctions and hard links cannot expose outside files', async t => {
  const { root, workspace } = fixture(t);
  const outside = join(root, 'outside');
  mkdirSync(outside);
  writeFileSync(join(outside, 'secret.md'), 'synthetic outside data');
  symlinkSync(outside, join(root, '개인 자료', 'alias'), 'junction');
  assert.equal(profileList(workspace).files[0].readable, false);
  assert.throws(() => profileRead(workspace, 'alias/secret.md'), { code: 'LINK_NOT_ALLOWED' });
  symlinkSync(outside, join(root, 'inbox', 'alias'), 'junction');
  await assert.rejects(postingImport(workspace, input({ image_path: 'alias/pic.png' })), { code: 'LINK_NOT_ALLOWED' });
  linkSync(join(outside, 'secret.md'), join(root, '개인 자료', 'linked.md'));
  assert.throws(() => profileRead(workspace, 'linked.md'), { code: 'INVALID_FILE' });
});

test('workspace refuses a junction at the output root before writing through it', t => {
  const { root } = fixture(t);
  const other = join(root, 'other');
  mkdirSync(other);
  const nested = join(root, 'nested');
  mkdirSync(nested);
  symlinkSync(other, join(nested, '공고'), 'junction');
  assert.throws(() => new Workspace(nested), { code: 'LINK_NOT_ALLOWED' });
  assert.deepEqual(readdirSync(other), []);
});

test('imports into Korean paths, preserves image bytes, creates manifest and does not track a calendar', async t => {
  const { root, workspace } = fixture(t);
  const bytes = await image(root);
  const mtime = statSync(join(root, 'inbox', '공고.png')).mtimeMs;
  const result = await postingImport(workspace, input());
  assert.equal(result.duplicate, false);
  assert.equal(result.folder, '공고/2026-11-01_가상기업_백엔드 개발');
  const record = JSON.parse(readFileSync(join(root, result.folder, '공고정보.json')));
  assert.equal(record.status, 'imported');
  assert.equal(record.deadline.time, null);
  assert.equal(record.calendar, null);
  assert.equal(record.evaluation, null);
  assert.deepEqual(readFileSync(join(root, record.source_images[0])), bytes);
  const manifest = JSON.parse(readFileSync(join(root, result.folder, '사진', 'manifest.json')));
  assert.equal(manifest.originals[0].sha256, record.image_sha256);
  assert.equal(manifest.originals[0].height, 24);
  assert.deepEqual(manifest.crops, []);
  assert.equal(statSync(join(root, 'inbox', '공고.png')).mtimeMs, mtime);
  assert.equal(existsSync(join(root, '.jobshot', 'import.lock')), false);
});

test('identical reimport is idempotent and a changed image gets a distinct collision-safe folder', async t => {
  const { root, workspace } = fixture(t);
  await image(root);
  const first = await postingImport(workspace, input());
  const path = join(root, first.folder, '공고정보.json');
  const mtime = statSync(path).mtimeMs;
  await image(root, '같은사진.png');
  const second = await postingImport(workspace, input({ image_path: '같은사진.png' }));
  assert.equal(second.duplicate, true);
  assert.equal(second.folder, first.folder);
  assert.equal(statSync(path).mtimeMs, mtime);
  await image(root, '다른사진.png', 'blue');
  const changed = await postingImport(workspace, input({ image_path: '다른사진.png' }));
  assert.notEqual(changed.folder, first.folder);
  assert.equal(readdirSync(join(root, '공고')).length, 2);
});

test('deadline uncertainty, rolling intake and Windows names are preserved safely', async t => {
  const { root, workspace } = fixture(t);
  await image(root);
  const unknown = await postingImport(workspace, input({ company: 'CON', role: 'A/B:C*D? ', deadline: { kind: 'unknown' } }));
  assert.equal(unknown.folder, '공고/마감미정__CON_A_B_C_D_');
  assert.equal(unknown.posting.deadline.kind, 'unknown');
  const rolling = await postingImport(workspace, input({ deadline: { kind: 'rolling' } }));
  assert.ok(rolling.folder.startsWith('공고/상시_'));
  const leap = await postingImport(workspace, input({ deadline: { kind: 'date', date: '2028-02-29' } }));
  assert.equal(leap.posting.deadline.date, '2028-02-29');
  for (const date of ['2026-02-29', '2026-04-31', '2026-13-01', '10/31', '0000-01-01']) {
    await assert.rejects(postingImport(workspace, input({ deadline: { kind: 'date', date } })), { code: 'INVALID_INPUT' });
  }
});

test('malformed input and images fail without creating partial postings', async t => {
  const { root, workspace } = fixture(t);
  await image(root);
  for (const source_url of ['javascript:alert(1)', 'file:///secret', 'https://user:secret@example.com/']) {
    await assert.rejects(postingImport(workspace, input({ source_url })), { code: 'INVALID_INPUT' });
  }
  for (const name of ['fake.png', 'truncated.png']) {
    const bytes = name === 'fake.png' ? Buffer.from('<svg>not a photo</svg>') : readFileSync(join(root, 'inbox', '공고.png')).subarray(0, 50);
    writeFileSync(join(root, 'inbox', name), bytes);
    await assert.rejects(postingImport(workspace, input({ image_path: name })), { code: 'INVALID_IMAGE' });
  }
  writeFileSync(join(root, 'inbox', 'large.png'), Buffer.alloc(MAX_IMAGE_BYTES + 1));
  await assert.rejects(postingImport(workspace, input({ image_path: 'large.png' })), { code: 'FILE_TOO_LARGE' });
  await assert.rejects(postingImport(workspace, input({ image_path: 'missing.png' })), { code: 'FILE_NOT_FOUND' });
  assert.deepEqual(readdirSync(join(root, '공고')), []);
});

test('stale/busy lock is not stolen, and corrupted records are not overwritten', async t => {
  const { root, workspace } = fixture(t);
  await image(root);
  const first = await postingImport(workspace, input());
  const recordPath = join(root, first.folder, '공고정보.json');
  writeFileSync(recordPath, '{broken');
  await assert.rejects(postingImport(workspace, input()), { code: 'INVALID_RECORD' });
  assert.equal(readFileSync(recordPath, 'utf8'), '{broken');
  assert.equal(existsSync(join(root, '.jobshot', 'import.lock')), false);
  mkdirSync(join(root, '.jobshot', 'import.lock'));
  await assert.rejects(postingImport(workspace, input()), { code: 'IMPORT_BUSY' });
  assert.equal(existsSync(join(root, '.jobshot', 'import.lock')), true);
});

test('concurrent imports never create duplicate or partial directories', async t => {
  const { root, workspace } = fixture(t);
  await image(root);
  const results = await Promise.allSettled(Array.from({ length: 4 }, () => postingImport(workspace, input())));
  assert.ok(results.some(result => result.status === 'fulfilled'));
  for (const result of results) if (result.status === 'rejected') assert.equal(result.reason.code, 'IMPORT_BUSY');
  assert.equal(readdirSync(join(root, '공고')).length, 1);
  assert.equal((await postingImport(workspace, input())).duplicate, true);
});

test('JPEG and WebP originals retain their bytes and canonical extensions', async t => {
  const { root, workspace } = fixture(t);
  for (const format of ['jpeg', 'webp']) {
    const bytes = await sharp({ create: { width: 8, height: 12, channels: 3, background: 'red' } }).toFormat(format).toBuffer();
    const name = `sample.${format}`;
    writeFileSync(join(root, 'inbox', name), bytes);
    const result = await postingImport(workspace, input({ image_path: name }));
    assert.ok(result.posting.source_images[0].endsWith(format === 'jpeg' ? '.jpg' : '.webp'));
    assert.deepEqual(readFileSync(join(root, result.posting.source_images[0])), bytes);
  }
});

test('oversized pixel dimensions and overly long destination paths fail before saving', async t => {
  const { root, workspace } = fixture(t);
  const large = await sharp({ create: { width: 7000, height: 6000, channels: 3, background: 'white' } }).png().toBuffer();
  writeFileSync(join(root, 'inbox', 'large-pixels.png'), large);
  await assert.rejects(postingImport(workspace, input({ image_path: 'large-pixels.png' })), { code: 'INVALID_IMAGE' });
  assert.deepEqual(readdirSync(join(root, '공고')), []);
  const nested = join(root, '긴'.repeat(Math.max(1, 175 - root.length)));
  mkdirSync(nested);
  const longWorkspace = new Workspace(nested);
  await image(nested);
  await assert.rejects(postingImport(longWorkspace, input({ company: '기업'.repeat(16), role: '직무'.repeat(16) })), { code: 'PATH_TOO_LONG' });
  assert.deepEqual(readdirSync(join(nested, '공고')), []);
  assert.equal(existsSync(join(nested, '.jobshot', 'import.lock')), false);
});
