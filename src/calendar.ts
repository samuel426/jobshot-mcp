import { existsSync, lstatSync, mkdirSync, readdirSync, renameSync, rmdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { fail, publicError } from './errors.js';
import { importSchema, deadlineSchema } from './schemas.js';
import { components, MAX_TEXT_BYTES, Workspace } from './workspace.js';
import { renderDashboard } from './dashboard.js';

export const postingIdSchema = z.string().regex(/^[a-f0-9]{64}$/);
const recordSchema = z.object({
  schema_version: z.literal(1), id: postingIdSchema,
  company: importSchema.shape.company, role: importSchema.shape.role,
  status: z.enum(['imported', 'analyzed', 'tracked', 'submitted', 'closed', 'archived']),
  deadline: z.object({ kind: z.enum(['date', 'unknown', 'rolling']), date: z.string().optional(), time: z.null(), timezone: z.literal('Asia/Seoul') }).passthrough(),
  source_url: importSchema.shape.source_url,
  tracking_previous_status: z.enum(['imported', 'analyzed']).optional(),
}).passthrough();
type RecordData = z.infer<typeof recordSchema>;
export type CalendarEntry = { id: string; company: string; role: string; date: string | null; kind: 'date' | 'unknown' | 'rolling'; source_url: string | null };

function records(workspace: Workspace) {
  const entries = readdirSync(workspace.directory('공고'), { withFileTypes: true }).filter(e => !e.name.startsWith('.'));
  if (entries.length > 1000) fail('POSTING_LIMIT', '공고 항목이 1,000개를 넘었습니다.');
  const ids = new Set<string>();
  return entries.flatMap(entry => {
    components(entry.name);
    workspace.path(`공고/${entry.name}`);
    if (!entry.isDirectory()) return [];
    const file = `공고/${entry.name}/공고정보.json`;
    const { bytes } = workspace.read(file, MAX_TEXT_BYTES);
    let record: RecordData;
    try {
      record = recordSchema.parse(JSON.parse(bytes.toString('utf8')));
      deadlineSchema.parse(record.deadline.kind === 'date' ? { kind: 'date', date: record.deadline.date } : { kind: record.deadline.kind });
      if (ids.has(record.id)) throw new Error('Duplicate ID');
    } catch { return fail('INVALID_RECORD', '공고정보.json의 날짜·링크·상태·ID를 확인하세요. 기존 파일은 변경하지 않았습니다.'); }
    ids.add(record.id);
    return [{ file, record }];
  });
}

function summary(record: RecordData): CalendarEntry {
  return { id: record.id, company: record.company, role: record.role, date: record.deadline.kind === 'date' ? record.deadline.date! : null, kind: record.deadline.kind, source_url: record.source_url };
}

function locked<T>(workspace: Workspace, action: () => T): T {
  workspace.directory('.jobshot');
  const lock = workspace.path('.jobshot/import.lock');
  try { mkdirSync(lock); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') fail('IMPORT_BUSY', '다른 저장 작업이 진행 중입니다. 완료 후 다시 시도하세요.');
    throw error;
  }
  try { return action(); } finally { rmdirSync(workspace.path('.jobshot/import.lock')); }
}

function checkTarget(workspace: Workspace, target: string) {
  const path = workspace.path(target);
  if (existsSync(path)) {
    const info = lstatSync(path);
    if (!info.isFile() || info.nlink > 1) fail('INVALID_FILE', '일반 파일만 갱신할 수 있습니다. 링크나 폴더를 확인하세요.');
  }
  return path;
}

// Same-directory atomic replacement. No delete-then-write window; old output survives failures.
function replace(workspace: Workspace, target: string, content: string) {
  checkTarget(workspace, target);
  const temp = `${target}.pending-${randomUUID()}`;
  try {
    writeFileSync(workspace.path(temp), content, { flag: 'wx' });
    renameSync(workspace.path(temp), checkTarget(workspace, target));
  } finally {
    const path = workspace.path(temp);
    if (existsSync(path)) unlinkSync(path);
  }
}

export function postingList(workspace: Workspace) {
  return locked(workspace, () => ({ postings: records(workspace).map(({ record }) => ({ ...summary(record), status: record.status })) }));
}

function htmlFor(items: ReturnType<typeof records>) {
  return renderDashboard(items.filter(item => item.record.status === 'tracked').map(item => summary(item.record)));
}

export function dashboardBuild(workspace: Workspace) {
  return locked(workspace, () => {
    const items = records(workspace);
    const html = htmlFor(items);
    workspace.directory('dashboard', true);
    replace(workspace, 'dashboard/index.html', html);
    return { path: 'dashboard/index.html', tracked_count: items.filter(item => item.record.status === 'tracked').length, timezone: 'Asia/Seoul' };
  });
}

export function postingTrack(workspace: Workspace, id: string, tracked: boolean, writeDashboard = replace) {
  if (!postingIdSchema.safeParse(id).success || typeof tracked !== 'boolean') fail('INVALID_INPUT', '공고 ID와 등록 여부(true/false)를 확인하세요.');
  return locked(workspace, () => {
    const items = records(workspace);
    const item = items.find(item => item.record.id === id);
    if (!item) fail('POSTING_NOT_FOUND', '해당 공고가 없습니다. posting_list로 ID를 확인하세요.');
    const before = item.record;
    if (!['imported', 'analyzed', 'tracked'].includes(before.status)) fail('INVALID_STATE', '현재 상태에서는 달력 등록을 변경할 수 없습니다.');
    const changed = (before.status === 'tracked') !== tracked;
    if (changed) {
      if (!tracked && !before.tracking_previous_status) fail('INVALID_RECORD', '등록 전 상태가 없어 해제할 수 없습니다. 공고 기록을 확인하세요.');
      item.record = { ...before, status: tracked ? 'tracked' : before.tracking_previous_status!, updated_at: new Date().toISOString() };
      if (tracked) item.record.tracking_previous_status = before.status as 'imported' | 'analyzed';
      else delete item.record.tracking_previous_status;
    }
    const html = htmlFor(items);
    // Check output before committing tracking state. Build failures after the state commit are explicit.
    workspace.directory('dashboard', true);
    checkTarget(workspace, 'dashboard/index.html');
    if (changed) {
      const serialized = JSON.stringify(item.record, null, 2) + '\n';
      if (Buffer.byteLength(serialized) > MAX_TEXT_BYTES) fail('FILE_TOO_LARGE', '변경할 공고 기록이 크기 제한을 넘습니다. 기존 기록을 보존했습니다.');
      replace(workspace, item.file, serialized);
    }
    try {
      writeDashboard(workspace, 'dashboard/index.html', html);
      return { id, tracked, changed, dashboard_updated: true, path: 'dashboard/index.html' };
    } catch (error) {
      return { id, tracked, changed, dashboard_updated: false, warning: publicError(error), next_step: '등록 상태는 저장됐습니다. 파일 사용 여부를 확인한 뒤 dashboard_build로 달력을 다시 만드세요.' };
    }
  });
}
