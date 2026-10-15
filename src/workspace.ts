import { constants, closeSync, fstatSync, lstatSync, mkdirSync, openSync, readSync, realpathSync } from 'node:fs';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { createHash } from 'node:crypto';
import { fail } from './errors.js';

export const MAX_TEXT_BYTES = 1024 * 1024;
export const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
export const sha256 = (data: string | Buffer) => createHash('sha256').update(data).digest('hex');
const reserved = /^(con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/i;

export function components(value: string): string[] {
  if (typeof value !== 'string' || !value || value.length > 500 || isAbsolute(value)) {
    fail('INVALID_PATH', '허용된 폴더 안의 상대 경로를 / 구분자로 입력하세요.');
  }
  const parts = value.split('/');
  if (parts.some(part => !part || part === '.' || part === '..' || part.startsWith('.')
    || /[<>:"\\|?*\x00-\x1f\x7f]/.test(part) || /[. ]$/.test(part) || reserved.test(part))) {
    fail('INVALID_PATH', '숨김 경로, 상위 경로, Windows 예약 이름이나 금지 문자는 사용할 수 없습니다.');
  }
  return parts;
}

export function folderPart(value: string): string {
  let part = value.normalize('NFC').replace(/[<>:"/\\|?*\x00-\x1f\x7f]/g, '_')
    .replace(/^[. ]+|[. ]+$/g, '').slice(0, 32).replace(/[. ]+$/g, '');
  if (!part) part = '미확인';
  if (reserved.test(part)) part = `_${part}`;
  return part;
}

export class Workspace {
  readonly root: string;

  constructor(root: string) {
    if (!isAbsolute(root)) fail('INVALID_WORKSPACE', '--workspace에는 기존 폴더의 절대 경로가 필요합니다.');
    const info = lstatSync(root);
    if (!info.isDirectory() || info.isSymbolicLink()) fail('INVALID_WORKSPACE', '작업 폴더는 실제 디렉터리여야 합니다.');
    this.root = realpathSync(root);
    // Existing personal material is never rewritten or migrated.
    for (const name of ['개인 자료', '공고', 'inbox', '.jobshot']) this.directory(name, true);
  }

  path(relativePath: string): string {
    const target = resolve(this.root, relativePath);
    const rel = relative(this.root, target);
    if (!rel || rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
      fail('INVALID_PATH', '작업 폴더 밖에는 접근할 수 없습니다.');
    }
    // Check every existing component, including Windows junctions.
    let current = this.root;
    for (const part of rel.split(sep)) {
      current = join(current, part);
      try {
        if (lstatSync(current).isSymbolicLink()) fail('LINK_NOT_ALLOWED', '심볼릭 링크나 정션 대신 실제 파일·폴더를 사용하세요.');
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') break;
        throw error;
      }
    }
    return target;
  }

  directory(relativePath: string, create = false): string {
    const target = this.path(relativePath);
    if (create) mkdirSync(target, { recursive: true });
    this.path(relativePath);
    if (!lstatSync(target).isDirectory()) fail('INVALID_DIRECTORY', '필요한 경로가 폴더가 아닙니다.');
    return target;
  }

  read(relativePath: string, maximum: number): { bytes: Buffer; modified_at: string } {
    const path = this.path(relativePath);
    let descriptor: number;
    try {
      descriptor = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') fail('FILE_NOT_FOUND', '파일을 찾지 못했습니다. 폴더 안에 저장한 뒤 상대 경로를 확인하세요.');
      throw error;
    }
    try {
      const before = fstatSync(descriptor);
      if (!before.isFile() || before.nlink > 1) fail('INVALID_FILE', '일반 파일만 읽을 수 있습니다. 링크는 지원하지 않습니다.');
      if (before.size > maximum) fail('FILE_TOO_LARGE', `파일 크기가 제한(${maximum} bytes)을 넘었습니다.`);
      const bytes = Buffer.alloc(before.size);
      let offset = 0;
      while (offset < bytes.length) {
        const read = readSync(descriptor, bytes, offset, bytes.length - offset, offset);
        if (read === 0) fail('FILE_CHANGED', '읽는 동안 파일이 바뀌었습니다. 저장을 마친 뒤 다시 시도하세요.');
        offset += read;
      }
      this.path(relativePath);
      const after = fstatSync(descriptor);
      const current = lstatSync(path);
      if (before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs
        || current.ino !== before.ino || current.dev !== before.dev) {
        fail('FILE_CHANGED', '읽는 동안 파일이 바뀌었습니다. 저장을 마친 뒤 다시 시도하세요.');
      }
      return { bytes, modified_at: before.mtime.toISOString() };
    } finally {
      closeSync(descriptor);
    }
  }
}
