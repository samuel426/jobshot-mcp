// Optional integration check. No model turns, persistent chats, or real user files.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const args = process.argv.slice(2);
if (args.length === 1 && args[0] === '--help') {
  console.log('Usage: node scripts/check-codex-connection.mjs --codex-bin <absolute executable path>');
  console.log('Uses an isolated CODEX_HOME and synthetic workspace under tmp/. Never starts a model turn.');
  process.exit(0);
}
if (args.length !== 2 || args[0] !== '--codex-bin' || !isAbsolute(args[1])) {
  console.error('Expected --codex-bin <absolute executable path>; use --help.');
  process.exit(1);
}

const root = fileURLToPath(new URL('../', import.meta.url));
const cli = join(root, 'dist/cli.js');
const codex = resolve(args[1]);
// Validate before creating fixtures; never resolve an arbitrary PATH installation.
try {
  assert.ok(statSync(codex).isFile());
  assert.ok(statSync(cli).isFile());
} catch {
  console.error('FAIL: Check the current Codex executable path and run npm run build first. App updates can move the executable.');
  process.exit(1);
}
mkdirSync(join(root, 'tmp'), { recursive: true });
const fixture = mkdtempSync(join(root, 'tmp/codex-check-'));
const workspace = join(fixture, 'workspace');
const codexHome = join(fixture, 'codex-home');
for (const folder of [codexHome, workspace, join(workspace, 'inbox'), join(workspace, '개인 자료')]) mkdirSync(folder);
// JSON string literals are valid TOML basic strings for these filesystem paths.
writeFileSync(join(codexHome, 'config.toml'), [
  '[mcp_servers.jobshot_check]',
  `command = ${JSON.stringify(process.execPath)}`,
  `args = ${JSON.stringify([cli, '--workspace', workspace])}`,
  '',
].join('\n'));
const profile = join(workspace, '개인 자료/가상경험.md');
writeFileSync(profile, '가상 인물: 테스트용 백엔드 프로젝트 경험.');
const source = join(workspace, 'inbox/long.png');
await sharp({ create: { width: 32, height: 3500, channels: 3, background: '#417acc' } }).png().toFile(source);
const snapshot = file => ({ hash: createHash('sha256').update(readFileSync(file)).digest('hex'), mtime: statSync(file).mtimeMs });
const profileBefore = snapshot(profile);
const sourceBefore = snapshot(source);

const child = spawn(codex, ['app-server', '--stdio'], {
  cwd: workspace, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'],
  env: { ...process.env, CODEX_HOME: codexHome },
});
const pending = new Map();
let seq = 0;
let stopped = null;
const failPending = error => {
  stopped = error;
  for (const request of pending.values()) { clearTimeout(request.timer); request.reject(error); }
  pending.clear();
};
child.on('error', failPending);
child.on('exit', () => failPending(new Error('Codex App Server exited before completing the check')));
child.stdin.on('error', failPending);
child.stderr.resume();
const lines = createInterface({ input: child.stdout });
lines.on('line', line => {
  let message;
  try { message = JSON.parse(line); } catch { failPending(new Error('Invalid JSON from App Server')); return; }
  const request = pending.get(message.id);
  if (!request) return;
  clearTimeout(request.timer);
  pending.delete(message.id);
  if (message.error) request.reject(new Error(JSON.stringify(message.error)));
  else request.resolve(message.result);
});
function request(method, params) {
  if (stopped) return Promise.reject(stopped);
  return new Promise((resolve, reject) => {
    const id = ++seq;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`Timeout: ${method}`)); }, 30000);
    pending.set(id, { resolve, reject, timer });
    child.stdin.write(JSON.stringify({ id, method, params }) + '\n');
  });
}

try {
  await request('initialize', { clientInfo: { name: 'jobshot_connection_check', version: '1.0.0' }, capabilities: { experimentalApi: true } });
  child.stdin.write(JSON.stringify({ method: 'initialized', params: {} }) + '\n');
  const started = await request('thread/start', { cwd: workspace, ephemeral: true });
  const threadId = started.thread.id;
  const inventory = await request('mcpServerStatus/list', { threadId, serverName: 'jobshot_check', detail: 'toolsAndAuthOnly' });
  const server = inventory.data.find(item => item.name === 'jobshot_check');
  assert.equal(server?.runtimeStatus, 'connected');
  assert.deepEqual(Object.keys(server.tools).sort(), ['dashboard_build', 'posting_get', 'posting_import', 'posting_list', 'posting_save_analysis', 'posting_track', 'profile_list', 'profile_read']);
  const call = (tool, arguments_) => request('mcpServer/tool/call', { threadId, server: 'jobshot_check', tool, arguments: arguments_ });
  const list = await call('profile_list', {});
  assert.ok(!list.isError);
  assert.equal(list.structuredContent.files[0].path, '가상경험.md');
  const read = await call('profile_read', { path: '가상경험.md' });
  assert.ok(!read.isError);
  assert.equal(read.structuredContent.text, readFileSync(profile, 'utf8'));
  const invalid = await call('profile_read', { path: '../secret.md' });
  assert.equal(invalid.isError, true);
  assert.equal(invalid.structuredContent.error.code, 'INVALID_PATH');
  const input = { image_path: 'long.png', company: '가상기업', role: '백엔드 개발', deadline: { kind: 'unknown' } };
  const first = await call('posting_import', input);
  assert.ok(!first.isError);
  const imported = first.structuredContent;
  assert.equal(imported.duplicate, false);
  assert.equal(imported.posting.deadline.kind, 'unknown');
  assert.equal(imported.posting.calendar, null);
  assert.equal(imported.posting.evaluation, null);
  assert.deepEqual(imported.manifest.crops.map(crop => crop.top), [0, 1440, 2880]);
  const folder = join(workspace, imported.folder);
  const record = join(folder, '공고정보.json');
  const recordBefore = snapshot(record);
  assert.equal(snapshot(join(folder, '사진/original-001.png')).hash, sourceBefore.hash);
  for (const crop of imported.manifest.crops) {
    const expected = await sharp(source).extract({ left: crop.left, top: crop.top, width: crop.width, height: crop.height }).raw().toBuffer();
    const actual = await sharp(join(folder, '사진', crop.path)).raw().toBuffer();
    assert.deepEqual(actual, expected);
  }
  const again = await call('posting_import', input);
  assert.ok(!again.isError);
  assert.equal(again.structuredContent.duplicate, true);
  assert.equal(again.structuredContent.folder, imported.folder);
  assert.deepEqual(snapshot(record), recordBefore);
  assert.deepEqual(snapshot(profile), profileBefore);
  assert.deepEqual(snapshot(source), sourceBefore);
  const postings = await call('posting_list', {});
  assert.equal(postings.structuredContent.postings[0].id, imported.posting.id);
  const tracked = await call('posting_track', { id: imported.posting.id, tracked: true });
  assert.ok(!tracked.isError); assert.equal(tracked.structuredContent.dashboard_updated, true);
  const built = await call('dashboard_build', {});
  assert.ok(!built.isError); assert.equal(built.structuredContent.tracked_count, 1);
  const untracked = await call('posting_track', { id: imported.posting.id, tracked: false });
  assert.ok(!untracked.isError); assert.equal(untracked.structuredContent.dashboard_updated, true);
  assert.equal(JSON.parse(readFileSync(record, 'utf8')).status, 'imported');
  const fetched = await call('posting_get', { id: imported.posting.id });
  assert.ok(!fetched.isError);
  const { analysisInput } = await import('../tests/analysis-helpers.mjs');
  const analysis = await call('posting_save_analysis', analysisInput(fetched.structuredContent, read.structuredContent));
  assert.ok(!analysis.isError); assert.equal(analysis.structuredContent.score, 100);
  assert.equal(analysis.structuredContent.status, 'analyzed');
  assert.deepEqual(snapshot(profile), profileBefore); assert.deepEqual(snapshot(source), sourceBefore);
  const result = { transport: 'Codex App Server ephemeral session; no model turn', tools: Object.keys(server.tools).sort(), crops: 3, originalPreserved: true, profilePreserved: true, duplicate: true, trackingAndDashboard: true, analysisSaved: true, calendar: null };
  writeFileSync(join(fixture, 'result.json'), JSON.stringify(result, null, 2) + '\n');
  console.log(`PASS: Codex discovery, profile read, path rejection, image crops, reimport, tracking/dashboard, analysis save and original preservation. Evidence: ${relative(root, fixture)}`);
} catch (error) {
  console.error(`FAIL: ${error.message}`);
  process.exitCode = 1;
} finally {
  failPending(new Error('Check finished'));
  lines.close();
  child.stdin.end();
  child.kill();
}
