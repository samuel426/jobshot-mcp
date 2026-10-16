import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import sharp from 'sharp';
import { clipboardScript, readClipboardPng, runClipboardScript, saveClipboardPng } from '../dist/clipboard.js';
import { postingImport } from '../dist/postings.js';
import { fixture, input, projectRoot } from './helpers.mjs';

test('captured PNG is staged once and can be imported with crops via the normal file path', async t => {
  const { root, workspace } = fixture(t);
  const bytes = await sharp({ create: { width: 32, height: 3500, channels: 3, background: 'white' } }).png().toBuffer();
  const decoded = readClipboardPng('win32', () => ({ status: 0, stdout: bytes.toString('base64') }));
  const first = await saveClipboardPng(workspace, decoded);
  assert.equal(first.duplicate, false);
  const path = join(root, 'inbox', first.image_path);
  const mtime = statSync(path).mtimeMs;
  assert.deepEqual(readFileSync(path), bytes);
  assert.equal((await saveClipboardPng(workspace, decoded)).duplicate, true);
  assert.equal(statSync(path).mtimeMs, mtime);
  const imported = await postingImport(workspace, input({ image_path: first.image_path }));
  assert.equal(imported.manifest.crops.length, 3);
  writeFileSync(path, 'changed synthetic file');
  await assert.rejects(saveClipboardPng(workspace, bytes), { code: 'RECORD_CHANGED' });
  assert.equal(readFileSync(path, 'utf8'), 'changed synthetic file');
});

test('clipboard errors are bounded, explicit and do not return contents', async t => {
  const { root, workspace } = fixture(t);
  assert.throws(() => readClipboardPng('darwin', () => { throw new Error('must not execute'); }), { code: 'UNSUPPORTED_PLATFORM' });
  for (const [result, code] of [
    [{ status: 2, stdout: '' }, 'CLIPBOARD_EMPTY'],
    [{ status: 3, stdout: '' }, 'FILE_TOO_LARGE'],
    [{ status: 4, stdout: 'private data' }, 'CLIPBOARD_UNAVAILABLE'],
    [{ status: null, stdout: '', error: new Error('timeout') }, 'CLIPBOARD_UNAVAILABLE'],
    [{ status: 0, stdout: 'not base64!' }, 'INVALID_IMAGE'],
    [{ status: 0, stdout: 'Zh==' }, 'INVALID_IMAGE'],
  ]) assert.throws(() => readClipboardPng('win32', () => result), { code });
  await assert.rejects(saveClipboardPng(workspace, Buffer.from('invalid')), { code: 'INVALID_IMAGE' });
  assert.deepEqual(readdirSync(join(root, 'inbox')), []);
});

test('capture CLI help and missing arguments never read the clipboard', () => {
  const cli = resolve(projectRoot, 'dist/capture-cli.js');
  const help = spawnSync(process.execPath, [cli, '--help'], { encoding: 'utf8' });
  assert.equal(help.status, 0);
  assert.match(help.stdout, /clipboard image once/);
  const missing = spawnSync(process.execPath, [cli], { encoding: 'utf8' });
  assert.equal(missing.status, 1);
  assert.equal(missing.stdout, '');
});

// Exercise real STA PowerShell and System.Drawing without touching the user's
// clipboard: replace ONLY the image provider with a synthetic in-memory bitmap.
test('Windows PowerShell PNG conversion works with a synthetic image and empty provider', { skip: process.platform !== 'win32' }, async () => {
  const provider = '$image = [System.Windows.Forms.Clipboard]::GetImage()';
  assert.ok(clipboardScript.includes(provider));
  const synthetic = clipboardScript.replace(provider, '$image = New-Object System.Drawing.Bitmap(32, 3500)');
  assert.ok(!synthetic.includes('[System.Windows.Forms.Clipboard]'));
  const converted = runClipboardScript(synthetic);
  assert.equal(converted.status, 0, converted.stderr);
  const bytes = readClipboardPng('win32', () => converted);
  const meta = await sharp(bytes).metadata();
  assert.equal(meta.width, 32);
  assert.equal(meta.height, 3500);
  const empty = runClipboardScript(clipboardScript.replace(provider, '$image = $null'));
  assert.equal(empty.status, 2);
  assert.equal(empty.stdout, '');
});
