import { mkdirSync, rmdirSync } from 'node:fs';
import { z } from 'zod';
import { checkTarget, postingIdSchema, records, replace, locked } from './calendar.js';
import { fail, publicError } from './errors.js';
import { GoogleHttpError, googleError } from './google-http.js';
import { MAX_TEXT_BYTES, sha256, Workspace } from './workspace.js';

const dateValue = z.object({ date: z.string() }).strict();
const payloadSchema = z.object({
  summary: z.string().max(500), description: z.string().max(5000), start: dateValue, end: dateValue,
}).strict();
export type EventPayload = z.infer<typeof payloadSchema>;
export type RemoteEvent = { id: string; etag: string; status?: string; summary?: string; description?: string;
  start?: { date?: string; dateTime?: string }; end?: { date?: string; dateTime?: string };
  extendedProperties?: { private?: Record<string, string> }; attendees?: unknown[]; recurrence?: string[] };
export interface CalendarProvider {
  calendarId: string;
  get(id: string): Promise<RemoteEvent | null>;
  insert(id: string, payload: EventPayload, postingId: string): Promise<RemoteEvent>;
  patch(id: string, payload: EventPayload, etag: string): Promise<RemoteEvent>;
}
const eventId = (id: string) => `jobshot${id}`;
const stateSchema = z.object({
  provider: z.literal('google'), calendar_id: z.string().min(1).max(1024), event_id: z.string().min(1).max(100),
  status: z.enum(['synced', 'sync_failed', 'conflict']), etag: z.string().min(1).max(1024).nullable(),
  last_payload: payloadSchema.nullable(), last_synced_at: z.string().nullable(),
  last_error: z.object({ code: z.string(), message: z.string() }).nullable(),
}).strict();
export const syncSchema = z.object({
  id: postingIdSchema, posting_sha256: postingIdSchema,
  resolve_conflict_etag: z.string().min(1).max(1024).optional().describe('반환된 충돌 내용을 사용자에게 보여주고 로컬 내용으로 덮어쓰라는 요청을 받은 경우에만 현재 Google etag를 전달하세요.'),
}).strict();
export type SyncInput = z.input<typeof syncSchema>;

function desired(workspace: Workspace, id: string) {
  if (!postingIdSchema.safeParse(id).success) fail('INVALID_INPUT', '공고 ID를 확인하세요.');
  const item = records(workspace).find(item => item.record.id === id);
  if (!item) fail('POSTING_NOT_FOUND', '공고를 찾지 못했습니다. posting_list로 확인하세요.');
  if (!['imported', 'analyzed', 'tracked'].includes(item.record.status)) fail('INVALID_STATE', '현재 상태의 공고는 Google 전송 대상이 아닙니다.');
  if (item.record.deadline.kind !== 'date') fail('DEADLINE_REQUIRED', 'Google 등록에는 확인된 마감 날짜가 필요합니다. 날짜 미정·상시는 로컬 목록에서 관리하세요.');
  const start = item.record.deadline.date!;
  const end = new Date(`${start}T00:00:00Z`); end.setUTCDate(end.getUTCDate() + 1);
  const link = item.record.source_url?.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const payload: EventPayload = { summary: `${item.record.company} · ${item.record.role} 지원 마감`,
    description: `마감 시각 미확인 · 날짜만 표시\n${link ? `원문: ${link}` : '원문 링크 미확인'}`,
    start: { date: start }, end: { date: end.toISOString().slice(0, 10) } };
  const parsed = item.record.calendar == null ? null : stateSchema.safeParse(item.record.calendar);
  if (parsed && !parsed.success) fail('INVALID_RECORD', 'Google 동기화 기록 형식이 올바르지 않습니다. 기존 기록은 보존했습니다.');
  return { ...item, payload, state: parsed?.success ? parsed.data : null };
}

export function calendarPreview(workspace: Workspace, id: string) {
  return locked(workspace, () => {
    const item = desired(workspace, id);
    return { id, posting_sha256: item.sha256, destination: 'JobShot 전용 Google 캘린더', event_id: eventId(id),
      event: item.payload, calendar: item.state, network_requested: false,
      notice: '전송 미리보기이며 등록하지 않았습니다. 개인 자료·지원서류·평가 점수는 보내지 않습니다. Google 전송은 별도 요청 시에만 수행합니다.' };
  });
}

export async function withWorkspaceLock<T>(workspace: Workspace, action: () => Promise<T>) {
  workspace.directory('.jobshot'); const lock = workspace.path('.jobshot/import.lock');
  try { mkdirSync(lock); } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') fail('IMPORT_BUSY', '다른 저장 작업이 진행 중입니다. 완료 후 다시 시도하세요.');
    throw error;
  }
  try { return await action(); } finally { rmdirSync(workspace.path('.jobshot/import.lock')); }
}

function fields(remote: RemoteEvent): EventPayload | null {
  const parsed = payloadSchema.safeParse({ summary: remote.summary ?? '', description: remote.description ?? '', start: remote.start, end: remote.end });
  return parsed.success ? parsed.data : null;
}
const same = (a: EventPayload | null, b: EventPayload) => a !== null && JSON.stringify(a) === JSON.stringify(b);
function checkRemote(remote: RemoteEvent, id: string) {
  if (remote.id !== eventId(id) || !remote.etag || remote.etag.length > 1024 || /[\r\n]/.test(remote.etag)) fail('GOOGLE_RESPONSE', 'Google 이벤트 식별자·버전을 확인하지 못했습니다.');
  if (remote.status === 'cancelled') fail('GOOGLE_EVENT_DELETED', 'Google에서 삭제한 일정은 자동으로 복구하지 않습니다. 삭제 상태를 확인하세요.');
  if (remote.extendedProperties?.private?.jobshot_id !== id) fail('GOOGLE_ID_CONFLICT', '같은 이벤트 ID의 소유 표식이 다릅니다. 자동으로 덮어쓰지 않습니다.');
  if (remote.attendees?.length || remote.recurrence?.length) fail('GOOGLE_EVENT_UNSUPPORTED', '참석자 또는 반복 일정이 추가된 이벤트는 자동으로 변경하지 않습니다.');
}

export async function calendarSync(workspace: Workspace, raw: SyncInput, connect: () => Promise<CalendarProvider>, save = replace) {
  const parsed = syncSchema.safeParse(raw);
  if (!parsed.success) fail('INVALID_INPUT', '미리보기의 공고 ID·해시와 선택적인 충돌 해결 버전을 확인하세요.');
  const input = parsed.data;
  return withWorkspaceLock(workspace, async () => {
    const item = desired(workspace, input.id);
    if (input.posting_sha256 !== item.sha256) fail('STALE_POSTING', '공고가 바뀌었습니다. calendar_preview로 전송 내용을 다시 확인하세요.');
    // Check the local commit path and size before any external write.
    checkTarget(workspace, item.file);
    if (Buffer.byteLength(JSON.stringify(item.record)) > MAX_TEXT_BYTES - 20000) fail('FILE_TOO_LARGE', '동기화 결과를 기록할 여유 공간이 부족합니다. 공고 기록 크기를 확인하세요.');
    let provider: CalendarProvider;
    try { provider = await connect(); } catch (error) { return googleError(error); }
    if (item.state && (item.state.calendar_id !== provider.calendarId || item.state.event_id !== eventId(input.id))) fail('GOOGLE_TARGET_CHANGED', '기존 동기화 대상과 연결된 캘린더가 다릅니다. 다른 캘린더로 자동 복제하지 않습니다.');
    const base = item.state ?? { provider: 'google' as const, calendar_id: provider.calendarId, event_id: eventId(input.id), status: 'sync_failed' as const, etag: null, last_payload: null, last_synced_at: null, last_error: null };
    const assertFresh = () => {
      if (sha256(workspace.read(item.file, MAX_TEXT_BYTES).bytes) !== item.sha256) fail('STALE_POSTING', '전송 중 로컬 공고가 바뀌었습니다. Google 결과를 확인한 뒤 미리보기부터 다시 진행하세요.');
    };
    const persist = (state: z.infer<typeof stateSchema>) => {
      // Also detect manual edits by another program during the network request.
      assertFresh();
      const serialized = JSON.stringify({ ...item.record, calendar: state, updated_at: new Date().toISOString() }, null, 2) + '\n';
      if (Buffer.byteLength(serialized) > MAX_TEXT_BYTES) fail('FILE_TOO_LARGE', '동기화 기록이 크기 제한을 넘었습니다.');
      save(workspace, item.file, serialized); return sha256(serialized);
    };
    let remoteChanged = false;
    try {
      let remote = await provider.get(eventId(input.id));
      if (!remote && base.etag) fail('GOOGLE_EVENT_DELETED', '이전에 동기화한 일정이 Google에 없습니다. 자동으로 다시 만들지 않습니다.');
      if (!remote) {
        assertFresh();
        try { remote = await provider.insert(eventId(input.id), item.payload, input.id); remoteChanged = true; }
        catch (error) {
          if (!(error instanceof GoogleHttpError) || error.status !== 409) throw error;
          remote = await provider.get(eventId(input.id));
          if (!remote) throw error;
        }
      }
      checkRemote(remote, input.id);
      if (!same(fields(remote), item.payload)) {
        const conflict = !base.etag || remote.etag !== base.etag;
        if (conflict && input.resolve_conflict_etag !== remote.etag) {
          const state = { ...base, status: 'conflict' as const, last_error: { code: 'GOOGLE_CONFLICT', message: 'Google 일정이 외부에서 바뀌었습니다.' } };
          const hash = persist(state);
          return { id: input.id, synced: false, conflict: true, posting_sha256: hash, event_etag: remote.etag,
            previous: base.last_payload, google: fields(remote) ?? { summary: remote.summary ?? '', start: remote.start, end: remote.end }, proposed: item.payload,
            next_step: '차이를 확인하세요. 사용자가 로컬 내용으로 덮어쓰기를 요청한 경우에만 이 event_etag와 최신 posting_sha256으로 재시도하세요.' };
        }
        if (input.resolve_conflict_etag && input.resolve_conflict_etag !== remote.etag) fail('GOOGLE_CONFLICT', '승인한 이후 Google 일정이 다시 바뀌었습니다. 최신 차이를 다시 확인하세요.');
        assertFresh();
        remote = await provider.patch(eventId(input.id), item.payload, remote.etag); remoteChanged = true;
        checkRemote(remote, input.id);
      }
      if (!same(fields(remote), item.payload)) fail('GOOGLE_RESPONSE', 'Google에 저장된 내용이 전송 내용과 다릅니다. 상태를 다시 확인하세요.');
      const state = { ...base, status: 'synced' as const, etag: remote.etag, last_payload: item.payload, last_synced_at: new Date().toISOString(), last_error: null };
      try { return { id: input.id, synced: true, remote_changed: remoteChanged, local_record_updated: true, posting_sha256: persist(state), calendar_id: provider.calendarId, event_id: remote.id }; }
      catch (error) { return { id: input.id, synced: true, remote_changed: remoteChanged, local_record_updated: false, warning: publicError(error), next_step: 'Google 저장은 확인됐지만 로컬 기록 저장에 실패했습니다. 미리보기를 다시 읽고 동기화를 재시도하면 같은 이벤트 ID로 복구합니다.' }; }
    } catch (error) {
      let safe; try { googleError(error); } catch (mapped) { safe = publicError(mapped); }
      const state = { ...base, status: 'sync_failed' as const, last_error: safe! };
      try { return { id: input.id, synced: false, remote_result: 'unconfirmed', error: safe, local_record_updated: true, posting_sha256: persist(state), next_step: '실패 상태만 기록했습니다. 로컬 공고와 일정은 유지됩니다. 원인을 해결한 뒤 미리보기를 다시 읽고 재시도하세요.' }; }
      catch (saveError) { return { id: input.id, synced: false, remote_result: 'unconfirmed', error: safe, local_record_updated: false, warning: publicError(saveError) }; }
    }
  });
}
