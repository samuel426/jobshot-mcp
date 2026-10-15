import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { Workspace } from '../dist/workspace.js';

export const projectRoot = fileURLToPath(new URL('../', import.meta.url));
export const cli = resolve(projectRoot, 'dist/cli.js');
const sandbox = resolve(projectRoot, 'tmp');

export function fixture(t) {
  mkdirSync(sandbox, { recursive: true });
  const root = mkdtempSync(join(sandbox, 'jobshot-'));
  t.after(() => {
    const child = relative(sandbox, root);
    if (!child || child.startsWith('..') || child.includes(sep)) throw new Error('Unsafe test cleanup');
    rmSync(root, { recursive: true, force: true });
  });
  return { root, workspace: new Workspace(root) };
}

export async function image(root, name = '공고.png', color = 'white') {
  const bytes = await sharp({ create: { width: 16, height: 24, channels: 3, background: color } }).png().toBuffer();
  writeFileSync(join(root, 'inbox', name), bytes);
  return bytes;
}

export const input = (extra = {}) => ({
  image_path: '공고.png', company: '가상기업', role: '백엔드 개발',
  deadline: { kind: 'date', date: '2026-11-01' },
  source_url: 'https://example.com/jobs/demo', ...extra,
});
