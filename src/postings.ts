import { existsSync, mkdirSync, readdirSync, renameSync, rmSync, rmdirSync, writeFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { z } from 'zod';
import { fail } from './errors.js';
import { importSchema, type ImportInput } from './schemas.js';
import { components, folderPart, MAX_IMAGE_BYTES, MAX_TEXT_BYTES, sha256, Workspace } from './workspace.js';

const MAX_PIXELS = 40_000_000;
const recordSchema = z.object({
  schema_version: z.literal(1),
  id: z.string().regex(/^[a-f0-9]{64}$/),
  company: z.string(), role: z.string(),
  status: z.literal('imported'),
  image_sha256: z.string().regex(/^[a-f0-9]{64}$/),
  source_images: z.array(z.string()).length(1),
}).passthrough();

async function inspectImage(bytes: Buffer) {
  const png = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  const webp = bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP';
  if (!png && !jpeg && !webp) fail('INVALID_IMAGE', 'PNG·JPEG·WebP 이미지 파일을 선택하세요. 확장자만 바꾼 파일은 지원하지 않습니다.');
  try {
    const decoder = sharp(bytes, { limitInputPixels: MAX_PIXELS, failOn: 'warning' });
    const meta = await decoder.metadata();
    if (!meta.width || !meta.height || !['png', 'jpeg', 'webp'].includes(meta.format)
      || (meta.pages ?? 1) > 1 || meta.width * meta.height > MAX_PIXELS) {
      fail('INVALID_IMAGE', '정지 이미지 한 장(최대 4천만 픽셀)만 지원합니다.');
    }
    // metadata alone does not detect truncated/corrupt pixel data.
    await decoder.stats();
    return { width: meta.width, height: meta.height, format: meta.format, extension: meta.format === 'jpeg' ? 'jpg' : meta.format };
  } catch {
    return fail('INVALID_IMAGE', '이미지를 읽을 수 없습니다. 손상 여부와 크기(최대 4천만 픽셀)를 확인하세요.');
  }
}

function readRecord(workspace: Workspace, folder: string) {
  const { bytes } = workspace.read(`공고/${folder}/공고정보.json`, MAX_TEXT_BYTES);
  try { return recordSchema.parse(JSON.parse(bytes.toString('utf8'))); }
  catch { return fail('INVALID_RECORD', '기존 공고 기록을 읽을 수 없습니다. 원본을 보존하고 해당 공고정보.json을 확인하세요.'); }
}

export async function postingImport(workspace: Workspace, raw: ImportInput) {
  const parsed = importSchema.safeParse(raw);
  if (!parsed.success) fail('INVALID_INPUT', '기업·직무·날짜·원문 링크 입력 형식을 확인하세요. 날짜는 실제 YYYY-MM-DD 또는 unknown/rolling이어야 합니다.');
  const input = parsed.data;
  components(input.image_path);
  if (!['.png', '.jpg', '.jpeg', '.webp'].includes(extname(input.image_path).toLowerCase())) {
    fail('UNSUPPORTED_FORMAT', 'inbox/에 PNG·JPEG·WebP 파일을 저장한 뒤 파일명을 지정하세요.');
  }
  const { bytes } = workspace.read(`inbox/${input.image_path}`, MAX_IMAGE_BYTES);
  const image = await inspectImage(bytes);
  const company = input.company.normalize('NFC');
  const role = input.role.normalize('NFC');
  const imageHash = sha256(bytes);
  const identity = { image_sha256: imageHash, company, role, deadline: input.deadline, source_url: input.source_url };
  const id = sha256(JSON.stringify(identity));
  const datePart = input.deadline.kind === 'date' ? input.deadline.date : input.deadline.kind === 'rolling' ? '상시' : '마감미정';
  const baseName = `${datePart}_${folderPart(company)}_${folderPart(role)}`;

  workspace.directory('.jobshot');
  workspace.directory('공고');
  const lock = workspace.path('.jobshot/import.lock');
  try { mkdirSync(lock); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') fail('IMPORT_BUSY', '다른 저장 작업이 진행 중입니다. 완료 후 다시 시도하세요. 종료된 작업의 잠금은 사용 안내를 확인하세요.');
    throw error;
  }
  let staging: string | undefined;
  try {
    const folders = readdirSync(workspace.directory('공고'), { withFileTypes: true }).filter(entry => !entry.name.startsWith('.'));
    if (folders.length > 1000) fail('POSTING_LIMIT', '공고 항목이 1,000개를 넘었습니다. 새 작업 폴더를 사용하세요.');
    for (const entry of folders) {
      components(entry.name);
      workspace.path(`공고/${entry.name}`);
      if (!entry.isDirectory()) continue;
      const record = readRecord(workspace, entry.name);
      if (record.id === id) {
        const original = `공고/${entry.name}/사진/original-001.${image.extension}`;
        const stored = workspace.read(original, MAX_IMAGE_BYTES);
        if (sha256(stored.bytes) !== imageHash || record.image_sha256 !== imageHash) {
          fail('RECORD_CHANGED', '보관된 원본과 기록이 일치하지 않습니다. 덮어쓰지 않고 중단했습니다.');
        }
        return { duplicate: true, folder: `공고/${entry.name}`, posting: record };
      }
    }
    let folder = baseName;
    if (existsSync(workspace.path(`공고/${folder}`))) folder = `${baseName}_${id.slice(0, 12)}`;
    if (existsSync(workspace.path(`공고/${folder}`))) fail('NAME_CONFLICT', '같은 이름의 폴더가 이미 있습니다. 기존 자료를 확인하세요.');
    const destination = workspace.path(`공고/${folder}`);
    if (join(destination, '사진', 'original-001.webp').length > 240) {
      fail('PATH_TOO_LONG', '저장 경로가 너무 깁니다. 더 짧은 작업 폴더 경로 또는 기업·직무명을 사용하세요.');
    }
    const now = new Date().toISOString();
    const original = `공고/${folder}/사진/original-001.${image.extension}`;
    const posting = {
      schema_version: 1, id, company, role, status: 'imported',
      deadline: { ...input.deadline, time: null, timezone: 'Asia/Seoul', verification: 'user_or_client_supplied' },
      source_url: input.source_url,
      source_images: [original], image_sha256: imageHash,
      profile_sources: [], evaluation: null, calendar: null,
      created_at: now, updated_at: now,
    };
    const manifest = {
      schema_version: 1,
      originals: [{ path: `original-001.${image.extension}`, sha256: imageHash, bytes: bytes.length,
        width: image.width, height: image.height, format: image.format }],
      crops: [],
    };
    staging = `공고/.pending-${randomUUID()}`;
    workspace.directory(`${staging}/사진`, true);
    const save = (path: string, content: string | Buffer) => writeFileSync(workspace.path(`${staging}/${path}`), content, { flag: 'wx' });
    save(`사진/original-001.${image.extension}`, bytes);
    save('사진/manifest.json', JSON.stringify(manifest, null, 2) + '\n');
    save('공고정보.json', JSON.stringify(posting, null, 2) + '\n');
    // A complete directory becomes visible in one same-filesystem rename.
    // All cooperative import processes use the same lock; existing records are never overwritten.
    workspace.directory('공고');
    if (existsSync(workspace.path(`공고/${folder}`))) fail('NAME_CONFLICT', '저장 중 같은 이름의 폴더가 생겼습니다. 다시 시도하세요.');
    renameSync(workspace.path(staging), destination);
    staging = undefined;
    return { duplicate: false, folder: `공고/${folder}`, posting };
  } finally {
    try {
      if (staging) {
        // Only this operation's generated temporary directory, checked inside the configured root.
        const target = workspace.path(staging);
        if (existsSync(target)) rmSync(target, { recursive: true });
      }
    } finally {
      rmdirSync(workspace.path('.jobshot/import.lock'));
    }
  }
}
