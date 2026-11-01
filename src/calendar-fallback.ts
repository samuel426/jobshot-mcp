import { postingTrack } from './calendar.js';
import { fail, JobShotError, publicError } from './errors.js';
import { syncWithGoogle } from './google-auth.js';
import { syncSchema, type SyncInput } from './google-sync.js';
import type { Workspace } from './workspace.js';

// Only connection failures qualify before a remote request. Input/file/concurrency errors
// must never silently register a different or changed posting.
const connectionErrors = new Set(['GOOGLE_NOT_CONNECTED', 'GOOGLE_PLATFORM', 'GOOGLE_SECRET_STORE', 'GOOGLE_AUTH', 'GOOGLE_NETWORK', 'GOOGLE_UNAVAILABLE', 'GOOGLE_RATE_LIMIT', 'GOOGLE_NOT_FOUND', 'GOOGLE_TARGET_CHANGED']);

export async function syncWithLocalFallback(workspace: Workspace, raw: SyncInput, synchronize = syncWithGoogle, track = postingTrack) {
  const parsed = syncSchema.safeParse(raw);
  if (!parsed.success) fail('INVALID_INPUT', '미리보기의 공고 ID·해시를 확인하세요.');
  const input = parsed.data;
  let google: Awaited<ReturnType<typeof syncWithGoogle>> | { id: string; synced: false; remote_result: 'not_attempted'; error: ReturnType<typeof publicError> };
  try { google = await synchronize(workspace, input); }
  catch (error) {
    if (!(error instanceof JobShotError) || !connectionErrors.has(error.code)) throw error;
    google = { id: input.id, synced: false, remote_result: 'not_attempted', error: publicError(error) };
  }
  if (google.synced) return google;
  // A failed local commit can indicate another writer changed this posting. Don't mutate it again.
  if ('local_record_updated' in google && google.local_record_updated === false) {
    return { ...google, local_calendar: { attempted: false, reason: 'LOCAL_RECORD_UNCONFIRMED' },
      next_step: 'Google 결과와 로컬 공고 저장 상태를 먼저 확인하세요. 로컬 기록을 확인하지 못해 자동 달력 등록도 중단했습니다.' };
  }
  const expectedSha = 'posting_sha256' in google ? google.posting_sha256 : input.posting_sha256;
  try {
    const local = track(workspace, input.id, true, undefined, expectedSha);
    return { ...google, posting_sha256: local.posting_sha256, local_calendar: { attempted: true, ...local },
      next_step: local.dashboard_updated
        ? 'Google 등록은 완료되지 않았거나 결과 확인이 필요합니다. 해당 공고는 로컬 웹 달력에 등록했습니다. dashboard/index.html을 열어 관리하세요. Google 재시도 전 calendar_preview를 다시 확인하세요.'
        : 'Google 등록 결과를 확인하세요. 로컬 등록 상태는 저장했지만 웹 달력 갱신에 실패했습니다. dashboard_build로 다시 만든 뒤 여세요.' };
  } catch (error) {
    return { ...google, local_calendar: { attempted: true, error: publicError(error) },
      next_step: 'Google 등록을 확인하지 못했고 로컬 웹 달력 등록도 완료하지 못했습니다. 오류와 최신 공고를 확인한 뒤 다시 요청하세요.' };
  }
}
