import { fail } from './errors.js';

export type Fetch = typeof fetch;
export class GoogleHttpError extends Error {
  constructor(readonly status: number) { super('Google request failed'); }
}

// Never propagate server bodies, tokens, URLs with query strings, or transport errors.
export async function googleRequest(url: string, init: RequestInit, send: Fetch = fetch): Promise<unknown> {
  let response: Response;
  try { response = await send(url, { ...init, redirect: 'error', signal: AbortSignal.timeout(15000) }); }
  catch { return fail('GOOGLE_NETWORK', 'Google 응답을 확인하지 못했습니다. 재시도 시 기존 이벤트 ID부터 확인하며 로컬 기록은 보존합니다.'); }
  if (!response.ok) { await response.body?.cancel(); throw new GoogleHttpError(response.status); }
  if (response.status === 204) return null;
  const reader = response.body?.getReader();
  if (!reader) fail('GOOGLE_RESPONSE', 'Google 응답 형식을 확인하지 못했습니다.');
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read(); if (done) break;
      size += value.length;
      if (size > 1024 * 1024) { await reader.cancel(); fail('GOOGLE_RESPONSE', 'Google 응답이 크기 제한을 넘었습니다.'); }
      chunks.push(value);
    }
    return size === 0 ? null : JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
  } catch { return fail('GOOGLE_RESPONSE', 'Google 응답을 끝까지 확인하지 못했습니다. 로컬 기록을 유지하고 상태를 다시 확인하세요.'); }
}

export function googleError(error: unknown): never {
  if (!(error instanceof GoogleHttpError)) throw error;
  if ([400, 401, 403].includes(error.status)) fail('GOOGLE_AUTH', 'Google 권한·계정 연결을 확인하세요. 인증이 만료되거나 거부됐다면 연결을 갱신하세요.');
  if (error.status === 412) fail('GOOGLE_CONFLICT', '조회 후 Google 일정이 바뀌었습니다. 최신 내용을 확인하기 전에는 덮어쓰지 않습니다.');
  if ([404, 410].includes(error.status)) fail('GOOGLE_NOT_FOUND', 'Google 캘린더 또는 일정이 없습니다. 삭제·권한 상태를 확인하세요.');
  if (error.status === 429) fail('GOOGLE_RATE_LIMIT', 'Google 요청 한도에 도달했습니다. 잠시 뒤 다시 시도하세요.');
  fail('GOOGLE_UNAVAILABLE', 'Google 요청을 완료하지 못했습니다. 로컬 기록은 보존했습니다.');
}
