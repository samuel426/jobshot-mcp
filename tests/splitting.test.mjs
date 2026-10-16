import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { cropRegions } from '../dist/images.js';
import { postingImport } from '../dist/postings.js';
import { sha256 } from '../dist/workspace.js';
import { fixture, image, input } from './helpers.mjs';

async function pattern(width, height, format = 'png', orientation = 1) {
  const data = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const offset = (y * width + x) * 3;
    data[offset] = y % 256; data[offset + 1] = x % 256; data[offset + 2] = (x + y) % 256;
  }
  return sharp(data, { raw: { width, height, channels: 3 } }).toFormat(format).withMetadata({ orientation }).toBuffer();
}

test('split boundaries cover every row with fixed overlap and bounded crop count', () => {
  assert.deepEqual(cropRegions(30, 2000), []);
  for (const height of [2001, 3040, 3041, 3500, 92320]) {
    const regions = cropRegions(30, height);
    assert.equal(regions[0].top, 0);
    assert.equal(regions.at(-1).top + regions.at(-1).height, height);
    assert.ok(regions.length <= 64);
    for (let n = 1; n < regions.length; n++) {
      assert.equal(regions[n - 1].top + regions[n - 1].height - regions[n].top, 160);
    }
  }
  assert.throws(() => cropRegions(30, 92321), { code: 'SPLIT_LIMIT' });
  assert.throws(() => cropRegions(0, 1), { code: 'INVALID_IMAGE' });
});

test('long images retain original bytes and crops match every oriented source pixel', async t => {
  const { root, workspace } = fixture(t);
  for (const [format, orientation] of [['png', 1], ['webp', 1], ...Array.from({ length: 8 }, (_, i) => ['jpeg', i + 1])]) {
    const rotated = orientation >= 5;
    const bytes = await pattern(rotated ? 3500 : 32, rotated ? 32 : 3500, format, orientation);
    const name = `sample-${format}-${orientation}.${format}`;
    writeFileSync(join(root, 'inbox', name), bytes);
    const before = statSync(join(root, 'inbox', name)).mtimeMs;
    const result = await postingImport(workspace, input({ image_path: name }));
    const { manifest } = result;
    assert.equal(manifest.coordinate_space, 'exif_oriented_pixels');
    assert.equal(manifest.display_width, 32);
    assert.equal(manifest.display_height, 3500);
    assert.equal(manifest.crops.length, 3);
    assert.deepEqual(readFileSync(join(root, result.posting.source_images[0])), bytes);
    const oriented = await sharp(bytes).autoOrient().toColourspace('srgb').raw().toBuffer({ resolveWithObject: true });
    for (const crop of manifest.crops) {
      const saved = readFileSync(join(root, result.folder, '사진', crop.path));
      assert.equal(sha256(saved), crop.sha256);
      const pixels = await sharp(saved).raw().toBuffer();
      const stride = oriented.info.width * oriented.info.channels;
      assert.deepEqual(pixels, oriented.data.subarray(crop.top * stride, (crop.top + crop.height) * stride));
    }
    const originalMtime = statSync(join(root, result.posting.source_images[0])).mtimeMs;
    const again = await postingImport(workspace, input({ image_path: name }));
    assert.equal(again.duplicate, true);
    assert.deepEqual(again.manifest, manifest);
    assert.equal(statSync(join(root, result.posting.source_images[0])).mtimeMs, originalMtime);
    assert.equal(statSync(join(root, 'inbox', name)).mtimeMs, before);
  }
});

test('crop write failure removes only staging data and releases the import lock', async t => {
  const { root, workspace } = fixture(t);
  writeFileSync(join(root, 'inbox', '공고.png'), await pattern(32, 3500));
  const path = workspace.path.bind(workspace);
  const mock = t.mock.method(workspace, 'path', value => {
    if (value.endsWith('/crop-002.png')) throw new Error('simulated disk error');
    return path(value);
  });
  await assert.rejects(postingImport(workspace, input()), /simulated disk error/);
  assert.deepEqual(readdirSync(join(root, '공고')), []);
  assert.equal(existsSync(join(root, '.jobshot', 'import.lock')), false);
  mock.mock.restore();
  assert.equal((await postingImport(workspace, input())).manifest.crops.length, 3);
});

test('modified or missing crops do not silently succeed on reimport', async t => {
  const { root, workspace } = fixture(t);
  writeFileSync(join(root, 'inbox', '공고.png'), await pattern(32, 3500));
  const first = await postingImport(workspace, input());
  const path = join(root, first.folder, '사진', 'crop-001.png');
  writeFileSync(path, 'modified synthetic crop');
  await assert.rejects(postingImport(workspace, input()), { code: 'RECORD_CHANGED' });
  assert.equal(readFileSync(path, 'utf8'), 'modified synthetic crop');
  unlinkSync(path);
  await assert.rejects(postingImport(workspace, input()), { code: 'FILE_NOT_FOUND' });
  assert.equal(existsSync(path), false);
});

test('legacy manifests stay unchanged and explicitly report missing split policy', async t => {
  const { root, workspace } = fixture(t);
  await image(root);
  const first = await postingImport(workspace, input());
  const path = join(root, first.folder, '사진', 'manifest.json');
  const legacy = { schema_version: 1, originals: first.manifest.originals, crops: [] };
  const bytes = JSON.stringify(legacy);
  writeFileSync(path, bytes);
  const again = await postingImport(workspace, input());
  assert.equal(again.split_status, 'legacy_unsplit');
  assert.equal(readFileSync(path, 'utf8'), bytes);
});
