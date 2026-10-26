import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync } from 'node:fs';
import { createServer } from 'node:http';
import { isAbsolute, join, parse, resolve, sep } from 'node:path';
import { spawnSync } from 'node:child_process';
import { z } from 'zod';
import { replace } from './calendar.js';
import { fail } from './errors.js';
import { googleError, GoogleHttpError, googleRequest, type Fetch } from './google-http.js';
import { calendarPreview, calendarSync, withWorkspaceLock, type CalendarProvider, type EventPayload, type RemoteEvent, type SyncInput } from './google-sync.js';
import { MAX_TEXT_BYTES, sha256, Workspace } from './workspace.js';

export const GOOGLE_SCOPE = 'https://www.googleapis.com/auth/calendar.app.created';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const API = 'https://www.googleapis.com/calendar/v3';
const secret = z.string().min(1).max(16000).regex(/^\S+$/);
const clientSchema = z.object({ client_id: z.string().regex(/^[a-zA-Z0-9._-]+\.apps\.googleusercontent\.com$/), client_secret: secret });
const connectionSchema = z.object({
  version: z.literal(1), workspace_key: z.string(), calendar_marker: z.string().regex(/^[a-f0-9]{32}$/), client: clientSchema,
  refresh_token: secret.nullable(), access_token: secret.nullable(), expires_at: z.number(),
  calendar_id: z.string().min(1).max(1024).nullable(), setup: z.enum(['authorized', 'pending_calendar', 'ready']),
}).strict();
type Connection = z.infer<typeof connectionSchema>;
export type Protector = { seal(value: string): string; open(value: string): string };

function dpapi(operation: 'Protect' | 'Unprotect', value: string) {
  if (process.platform !== 'win32') fail('GOOGLE_PLATFORM', 'Google 인증 정보 보호는 현재 Windows에서만 지원합니다. 다른 OS의 실계정 연결은 아직 지원하지 않습니다.');
  const script = `$ErrorActionPreference='Stop'; Add-Type -AssemblyName System.Security; $inputBytes=[Convert]::FromBase64String([Console]::In.ReadToEnd()); $entropy=[Text.Encoding]::UTF8.GetBytes('JobShot OAuth v1'); $outputBytes=[Security.Cryptography.ProtectedData]::${operation}($inputBytes,$entropy,[Security.Cryptography.DataProtectionScope]::CurrentUser); [Console]::Out.Write([Convert]::ToBase64String($outputBytes))`;
  const executable = join(process.env.SystemRoot ?? 'C:/Windows', 'System32/WindowsPowerShell/v1.0/powershell.exe');
  const result = spawnSync(executable, ['-NoProfile', '-NonInteractive', '-Command', script], { input: value, encoding: 'utf8', windowsHide: true, timeout: 10000, maxBuffer: MAX_TEXT_BYTES });
  if (result.error || result.status !== 0 || !/^[A-Za-z0-9+/=]+$/.test(result.stdout)) fail('GOOGLE_SECRET_STORE', 'Windows 인증 정보 보호 작업을 완료하지 못했습니다. 같은 Windows 사용자와 파일 접근 권한을 확인하세요.');
  return result.stdout;
}
export const windowsProtector: Protector = {
  seal: value => dpapi('Protect', Buffer.from(value).toString('base64')),
  open: value => Buffer.from(dpapi('Unprotect', value), 'base64').toString('utf8'),
};

// Reject junctions in every existing parent before creating the token directory.
function safeDirectory(path: string) {
  if (!isAbsolute(path)) fail('INVALID_PATH', '인증 저장소는 절대 경로여야 합니다.');
  const absolute = resolve(path); let current = parse(absolute).root;
  for (const part of absolute.slice(current.length).split(sep).filter(Boolean)) {
    current = join(current, part);
    try { if (lstatSync(current).isSymbolicLink()) fail('LINK_NOT_ALLOWED', '인증 저장소에 링크나 정션을 사용할 수 없습니다.'); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  }
  mkdirSync(absolute, { recursive: true });
  return absolute;
}

export class GoogleAuthStore {
  readonly files: Workspace;
  readonly key: string;
  constructor(workspace: Workspace, directory: string, readonly protector: Protector = windowsProtector) {
    this.key = sha256(workspace.root);
    this.files = new Workspace(safeDirectory(directory), false);
    this.files.directory('.jobshot', true);
  }
  load(): Connection | null {
    if (!existsSync(this.files.path('connection.bin'))) return null;
    const encrypted = this.files.read('connection.bin', MAX_TEXT_BYTES).bytes.toString('utf8');
    try {
      const value = connectionSchema.parse(JSON.parse(this.protector.open(encrypted)));
      if (value.workspace_key !== this.key) fail('GOOGLE_SECRET_STORE', '다른 작업 폴더의 인증 정보입니다.');
      return value;
    } catch { return fail('GOOGLE_SECRET_STORE', '인증 정보를 읽지 못했습니다. 같은 Windows 사용자와 원래 작업 폴더에서 확인하세요.'); }
  }
  save(value: Connection) { replace(this.files, 'connection.bin', this.protector.seal(JSON.stringify(connectionSchema.parse(value)))); }
  lock<T>(action: () => Promise<T>) { return withWorkspaceLock(this.files, action); }
}

export function defaultGoogleStore(workspace: Workspace) {
  if (process.platform !== 'win32' || !process.env.LOCALAPPDATA) fail('GOOGLE_PLATFORM', 'Google 인증은 현재 Windows에서만 지원합니다.');
  return new GoogleAuthStore(workspace, join(process.env.LOCALAPPDATA, 'JobShot', 'google-auth', sha256(workspace.root)));
}

export async function startAuthorization(clientId: string, timeoutMs = 180000) {
  const state = randomBytes(32).toString('base64url'), verifier = randomBytes(32).toString('base64url');
  let accept!: (code: string) => void, reject!: (error: unknown) => void;
  const code = new Promise<string>((resolve, fail) => { accept = resolve; reject = fail; });
  // A user may take time to open the browser; attach a handler immediately.
  void code.catch(() => {});
  let host = '';
  const server = createServer((request, response) => {
    response.setHeader('Content-Type', 'text/plain; charset=utf-8');
    response.setHeader('Cache-Control', 'no-store'); response.setHeader('Referrer-Policy', 'no-referrer');
    let url: URL;
    try { url = new URL(request.url ?? '/', `http://${host}`); }
    catch { response.writeHead(400); response.end('Invalid request.'); return; }
    const returned = url.searchParams.get('state') ?? '';
    const matches = Buffer.byteLength(returned) === Buffer.byteLength(state) && timingSafeEqual(Buffer.from(returned), Buffer.from(state));
    if (request.method !== 'GET' || request.headers.host !== host || url.origin !== `http://${host}` || url.pathname !== '/oauth/callback' || !matches || url.searchParams.getAll('state').length !== 1) {
      response.writeHead(400); response.end('Invalid authorization response.'); return;
    }
    if (url.searchParams.has('error')) { response.end('연결이 취소됐습니다. 이 창을 닫으세요.'); reject(new Error('Authorization denied')); return; }
    const value = url.searchParams.get('code');
    if (!value || value.length > 4096 || url.searchParams.getAll('code').length !== 1) { response.writeHead(400); response.end('Missing authorization code.'); return; }
    response.end('인증 응답을 받았습니다. 연결 완료 여부는 JobShot 터미널에서 확인하세요. 이 창은 닫아도 됩니다.'); accept(value);
  });
  server.requestTimeout = 5000; server.headersTimeout = 5000;
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', () => resolve()); });
  const address = server.address();
  if (!address || typeof address === 'string') { server.close(); fail('GOOGLE_AUTH', '로컬 인증 응답 주소를 만들지 못했습니다.'); }
  host = `127.0.0.1:${address.port}`;
  const redirectUri = `http://${host}/oauth/callback`;
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.search = new URLSearchParams({ client_id: clientId, redirect_uri: redirectUri, response_type: 'code', scope: GOOGLE_SCOPE,
    state, code_challenge: createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256', access_type: 'offline', prompt: 'consent' }).toString();
  const timer = setTimeout(() => reject(new Error('Authorization timeout')), timeoutMs);
  const close = () => { clearTimeout(timer); server.close(); server.closeAllConnections(); };
  return { url: url.href, code, verifier, redirectUri, close };
}

const tokenSchema = z.object({ access_token: secret, expires_in: z.number().positive().max(86400), token_type: z.literal('Bearer'), refresh_token: secret.optional(), scope: z.string().optional() });
async function tokenRequest(parameters: Record<string, string>, send: Fetch) {
  try {
    const parsed = tokenSchema.safeParse(await googleRequest(TOKEN_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(parameters) }, send));
    if (!parsed.success) fail('GOOGLE_AUTH', 'Google 토큰 응답 형식을 확인하지 못했습니다. 다시 연결하세요.');
    if (parsed.data.scope !== undefined && !parsed.data.scope.split(' ').includes(GOOGLE_SCOPE)) fail('GOOGLE_SCOPE', 'JobShot 전용 캘린더 권한이 허용되지 않았습니다.');
    return parsed.data;
  } catch (error) { return googleError(error); }
}

const remoteSchema = z.object({ id: z.string(), etag: z.string(), status: z.string().optional(), summary: z.string().max(5000).optional(), description: z.string().max(50000).optional(),
  start: z.object({ date: z.string().optional(), dateTime: z.string().optional() }).optional(), end: z.object({ date: z.string().optional(), dateTime: z.string().optional() }).optional(),
  extendedProperties: z.object({ private: z.record(z.string(), z.string()).optional() }).optional(), attendees: z.array(z.unknown()).optional(), recurrence: z.array(z.string()).optional() });

export class GoogleCalendarAPI implements CalendarProvider {
  constructor(readonly calendarId: string, private readonly accessToken: () => Promise<string>, private readonly send: Fetch = fetch) {}
  async request(path: string, method = 'GET', body?: unknown, etag?: string) {
    const token = await this.accessToken();
    const headers: Record<string, string> = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
    if (etag) headers['If-Match'] = etag;
    return googleRequest(`${API}/${path}`, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }, this.send);
  }
  private parse(value: unknown): RemoteEvent {
    const parsed = remoteSchema.safeParse(value);
    if (!parsed.success) fail('GOOGLE_RESPONSE', 'Google 이벤트 응답을 확인하지 못했습니다.');
    return parsed.data as RemoteEvent;
  }
  private path(id: string) { return `calendars/${encodeURIComponent(this.calendarId)}/events/${encodeURIComponent(id)}`; }
  async get(id: string) {
    try { return this.parse(await this.request(this.path(id))); }
    catch (error) { if (error instanceof GoogleHttpError && error.status === 404) return null; throw error; }
  }
  async insert(id: string, payload: EventPayload, postingId: string) {
    return this.parse(await this.request(`calendars/${encodeURIComponent(this.calendarId)}/events?sendUpdates=none`, 'POST', { ...payload, id,
      extendedProperties: { private: { jobshot_id: postingId } }, reminders: { useDefault: false } }));
  }
  async patch(id: string, payload: EventPayload, etag: string) {
    return this.parse(await this.request(`${this.path(id)}?sendUpdates=none`, 'PATCH', { ...payload, start: { ...payload.start, dateTime: null, timeZone: null }, end: { ...payload.end, dateTime: null, timeZone: null } }, etag));
  }
}

export function connectedAPI(store: GoogleAuthStore, send: Fetch = fetch) {
  const connection = store.load();
  if (!connection?.refresh_token || !connection.calendar_id || connection.setup !== 'ready') fail('GOOGLE_NOT_CONNECTED', '먼저 Google 연결 CLI로 JobShot 전용 캘린더를 연결하세요. 토큰을 대화에 붙여넣지 마세요.');
  return new GoogleCalendarAPI(connection.calendar_id, () => accessToken(store, send), send);
}
async function accessToken(store: GoogleAuthStore, send: Fetch) {
  const current = store.load();
  if (!current?.refresh_token) fail('GOOGLE_NOT_CONNECTED', 'Google 계정을 먼저 연결하세요.');
  if (current.access_token && current.expires_at > Date.now() + 60000) return current.access_token;
  const token = await tokenRequest({ ...current.client, refresh_token: current.refresh_token, grant_type: 'refresh_token' }, send);
  store.save({ ...current, refresh_token: token.refresh_token ?? current.refresh_token, access_token: token.access_token, expires_at: Date.now() + token.expires_in * 1000 });
  return token.access_token;
}

const marker = (connection: Connection) => `JobShot 전용 지원 일정 · 연결 ID ${connection.calendar_marker}`;
export async function connectGoogle(store: GoogleAuthStore, credentials: unknown, show: (url: string) => void | Promise<void>, send: Fetch = fetch, authorize = startAuthorization) {
  const parsed = z.object({ installed: clientSchema }).safeParse(credentials);
  if (!parsed.success) fail('GOOGLE_CLIENT', 'Google Cloud에서 만든 Desktop app OAuth JSON 파일이 필요합니다. 파일을 대화에 붙여넣지 마세요.');
  return store.lock(async () => {
    const previous = store.load();
    if (previous && previous.client.client_id !== parsed.data.installed.client_id) fail('GOOGLE_CLIENT_CHANGED', '기존 연결과 다른 OAuth 클라이언트입니다. 기존 연결 파일을 덮어쓰지 않습니다.');
    const session = await authorize(parsed.data.installed.client_id);
    let code: string;
    try { await show(session.url); code = await session.code; }
    catch { return fail('GOOGLE_AUTH_CANCELLED', 'Google 인증이 취소되거나 시간이 지났습니다. 기존 연결은 유지했습니다.'); }
    finally { session.close(); }
    const tokens = await tokenRequest({ ...parsed.data.installed, code, code_verifier: session.verifier, redirect_uri: session.redirectUri, grant_type: 'authorization_code' }, send);
    if (!tokens.refresh_token || !tokens.scope?.split(' ').includes(GOOGLE_SCOPE)) fail('GOOGLE_SCOPE', '갱신 토큰과 전용 캘린더 권한을 확인하지 못했습니다. 기존 연결을 유지합니다.');
    let current: Connection = { version: 1, workspace_key: store.key, calendar_marker: previous?.calendar_marker ?? randomBytes(16).toString('hex'), client: parsed.data.installed,
      refresh_token: tokens.refresh_token, access_token: tokens.access_token, expires_at: Date.now() + tokens.expires_in * 1000,
      calendar_id: previous?.calendar_id ?? null, setup: previous?.setup ?? 'authorized' };
    const api = new GoogleCalendarAPI(current.calendar_id ?? '', async () => tokens.access_token, send);
    if (current.calendar_id) {
      try {
        const calendar = await api.request(`calendars/${encodeURIComponent(current.calendar_id)}`) as { id?: string };
        if (calendar?.id !== current.calendar_id) fail('GOOGLE_RESPONSE', '기존 전용 캘린더를 확인하지 못했습니다.');
      } catch (error) { return googleError(error); }
      store.save({ ...current, setup: 'ready' });
      return { connected: true, calendar_id: current.calendar_id, created: false };
    }
    store.save(current);
    if (current.setup === 'pending_calendar') fail('GOOGLE_SETUP_UNKNOWN', '이전 캘린더 생성 결과가 불명확합니다. Google에서 전용 캘린더 ID를 확인해 --recover-calendar로 연결하세요. 중복 생성하지 않았습니다.');
    current = { ...current, setup: 'pending_calendar' }; store.save(current);
    try {
      const calendar = await api.request('calendars', 'POST', { summary: 'JobShot 지원 일정', timeZone: 'Asia/Seoul', description: marker(current) }) as { id?: string };
      if (!calendar?.id || typeof calendar.id !== 'string' || calendar.id.length > 1024) fail('GOOGLE_RESPONSE', '생성된 캘린더 ID를 확인하지 못했습니다. Google에서 확인한 후 복구하세요.');
      store.save({ ...current, setup: 'ready', calendar_id: calendar.id });
      return { connected: true, calendar_id: calendar.id, created: true };
    } catch (error) {
      if (error instanceof GoogleHttpError && error.status >= 400 && error.status < 500) store.save({ ...current, setup: 'authorized' });
      return googleError(error);
    }
  });
}

export async function recoverCalendar(store: GoogleAuthStore, id: string, send: Fetch = fetch) {
  if (!id || id.length > 1024 || /[\r\n]/.test(id)) fail('INVALID_INPUT', 'Google 캘린더 설정에서 확인한 캘린더 ID를 입력하세요.');
  return store.lock(async () => {
    const current = store.load();
    if (!current?.refresh_token || current.calendar_id || current.setup !== 'pending_calendar') fail('GOOGLE_RECOVERY', '생성 결과가 불명확한 연결에만 복구를 적용할 수 있습니다.');
    const api = new GoogleCalendarAPI(id, () => accessToken(store, send), send);
    try {
      const calendar = await api.request(`calendars/${encodeURIComponent(id)}`) as { id?: string; description?: string };
      if (calendar?.id !== id || calendar.description !== marker(current)) fail('GOOGLE_RECOVERY', '이 작업 폴더에서 생성한 JobShot 캘린더 표식이 아닙니다.');
      store.save({ ...store.load()!, calendar_id: id, setup: 'ready' });
      return { connected: true, calendar_id: id, recovered: true };
    } catch (error) { return googleError(error); }
  });
}

export async function disconnectGoogle(store: GoogleAuthStore, send: Fetch = fetch) {
  return store.lock(async () => {
    const current = store.load(); if (!current?.refresh_token) return { disconnected: true, revoked: false, already_disconnected: true };
    store.save({ ...current, refresh_token: null, access_token: null, expires_at: 0 });
    try {
      await googleRequest('https://oauth2.googleapis.com/revoke', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ token: current.refresh_token }) }, send);
      return { disconnected: true, revoked: true };
    } catch { return { disconnected: true, revoked: false, next_step: '로컬 연결은 해제했습니다. Google 계정의 타사 연결 설정에서 JobShot 권한도 해제하세요. 기존 캘린더·일정은 유지됩니다.' }; }
  });
}

export function syncWithGoogle(workspace: Workspace, input: SyncInput) {
  const preview = calendarPreview(workspace, input.id);
  if (preview.posting_sha256 !== input.posting_sha256) fail('STALE_POSTING', '공고가 바뀌었습니다. 전송 미리보기를 다시 확인하세요.');
  const store = defaultGoogleStore(workspace);
  return store.lock(() => calendarSync(workspace, input, async () => connectedAPI(store)));
}
