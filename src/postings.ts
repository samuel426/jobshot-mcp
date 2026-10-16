import { existsSync, mkdirSync, readdirSync, rmSync, rmdirSync, writeFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { fail } from './errors.js';
import { importSchema, type ImportInput } from './schemas.js';
import { components, folderPart, MAX_IMAGE_BYTES, MAX_TEXT_BYTES, sha256, Workspace } from './workspace.js';

import { imageCrops, inspectImage, SPLIT_POLICY, type CropRecord } from './images.js';
import { publishDirectory } from './publish.js';
const recordSchema = z.object({
  schema_version: z.literal(1),
  id: z.string().regex(/^[a-f0-9]{64}$/),
  company: z.string(), role: z.string(),
  status: z.literal('imported'),
  image_sha256: z.string().regex(/^[a-f0-9]{64}$/),
  source_images: z.array(z.string()).length(1),
}).passthrough();

function readRecord(workspace: Workspace, folder: string) {
  const { bytes } = workspace.read(`공고/${folder}/공고정보.json`, MAX_TEXT_BYTES);
  try { return recordSchema.parse(JSON.parse(bytes.toString('utf8'))); }
  catch { return fail('INVALID_RECORD', '기존 공고 기록을 읽을 수 없습니다. 원본을 보존하고 해당 공고정보.json을 확인하세요.'); }
}

function readManifest(workspace: Workspace, folder: string, originalHash: string) {
  const hash = z.string().regex(/^[a-f0-9]{64}$/);
  const schema = z.object({
    schema_version: z.literal(1),
    originals: z.array(z.object({ path: z.string().regex(/^original-001\.(png|jpg|webp)$/), sha256: hash }).passthrough()).length(1),
    crops: z.array(z.object({ path: z.string().regex(/^crop-\d{3}\.png$/), sha256: hash }).passthrough()).max(64),
    split_policy: z.object({ version: z.literal(1) }).passthrough().optional(),
  }).passthrough();
  const { bytes } = workspace.read(`공고/${folder}/사진/manifest.json`, MAX_TEXT_BYTES);
  let manifest;
  try { manifest = schema.parse(JSON.parse(bytes.toString('utf8'))); }
  catch { return fail('INVALID_RECORD', '이미지 manifest를 읽을 수 없습니다. 기존 원본과 기록을 확인하세요.'); }
  if (manifest.originals[0]!.sha256 !== originalHash) fail('RECORD_CHANGED', '원본과 manifest 해시가 다릅니다. 기존 파일을 확인하세요.');
  for (const crop of manifest.crops) {
    const stored = workspace.read(`공고/${folder}/사진/${crop.path}`, MAX_IMAGE_BYTES);
    if (sha256(stored.bytes) !== crop.sha256) fail('RECORD_CHANGED', '분할본이 변경됐습니다. 덮어쓰지 않고 중단했습니다.');
  }
  return manifest;
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
        const manifest = readManifest(workspace, entry.name, imageHash);
        return { duplicate: true, folder: `공고/${entry.name}`, posting: record, manifest,
          split_status: manifest.split_policy ? 'ready' : 'legacy_unsplit' };
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
        width: image.width, height: image.height, format: image.format, orientation: image.orientation }],
      coordinate_space: 'exif_oriented_pixels',
      display_width: image.display_width, display_height: image.display_height,
      split_policy: SPLIT_POLICY,
      crops: [] as CropRecord[],
    };
    staging = `공고/.pending-${randomUUID()}`;
    workspace.directory(`${staging}/사진`, true);
    const save = (path: string, content: string | Buffer) => writeFileSync(workspace.path(`${staging}/${path}`), content, { flag: 'wx' });
    save(`사진/original-001.${image.extension}`, bytes);
    for await (const crop of imageCrops(bytes, image)) {
      save(`사진/${crop.record.path}`, crop.bytes);
      manifest.crops.push(crop.record);
    }
    save('사진/manifest.json', JSON.stringify(manifest, null, 2) + '\n');
    save('공고정보.json', JSON.stringify(posting, null, 2) + '\n');
    // A complete directory becomes visible in one same-filesystem rename.
    // All cooperative import processes use the same lock; existing records are never overwritten.
    workspace.directory('공고');
    await publishDirectory(workspace, staging, `공고/${folder}`);
    staging = undefined;
    return { duplicate: false, folder: `공고/${folder}`, posting, manifest, split_status: 'ready' };
  } finally {
    try {
      if (staging) {
        // Only this operation's generated temporary directory, checked inside the configured root.
        const target = workspace.path(staging);
        if (existsSync(target)) rmSync(target, { recursive: true, maxRetries: 3, retryDelay: 100 });
      }
    } finally {
      rmdirSync(workspace.path('.jobshot/import.lock'));
    }
  }
}
