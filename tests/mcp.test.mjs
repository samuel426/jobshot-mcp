import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { createInterface } from 'node:readline';
import sharp from 'sharp';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { cli, fixture, image, input } from './helpers.mjs';
import { analysisInput } from './analysis-helpers.mjs';
import { applicationInput, resumeEvaluation } from './application-helpers.mjs';

test('real stdio client discovers tools, reads selected material, imports and receives errors', { timeout: 20000 }, async t => {
  const { root } = fixture(t);
  await image(root);
  const source = join(root, '개인 자료', '가상이력서.md');
  writeFileSync(source, '가상 인물의 테스트용 프로젝트 경험');
  const client = new Client({ name: 'jobshot-integration-test', version: '1.0.0' });
  const transport = new StdioClientTransport({ command: process.execPath, args: [cli, '--workspace', root], stderr: 'pipe' });
  let stderr = '';
  transport.stderr?.on('data', chunk => { stderr += chunk.toString(); });
  try {
    await client.connect(transport);
    const { tools } = await client.listTools();
    assert.deepEqual(tools.map(tool => tool.name).sort(), ['application_save', 'dashboard_build', 'posting_get', 'posting_import', 'posting_list', 'posting_save_analysis', 'posting_track', 'profile_list', 'profile_read']);
    assert.equal(tools.find(tool => tool.name === 'profile_read').annotations.readOnlyHint, true);
    assert.equal(tools.find(tool => tool.name === 'posting_import').annotations.readOnlyHint, false);
    const list = await client.callTool({ name: 'profile_list', arguments: {} });
    assert.equal(list.structuredContent.files[0].path, '가상이력서.md');
    const profile = await client.callTool({ name: 'profile_read', arguments: { path: '가상이력서.md' } });
    assert.equal(profile.structuredContent.text, readFileSync(source, 'utf8'));
    const imported = await client.callTool({ name: 'posting_import', arguments: input() });
    assert.equal(imported.isError, undefined);
    assert.equal(imported.structuredContent.duplicate, false);
    const again = await client.callTool({ name: 'posting_import', arguments: input() });
    assert.equal(again.structuredContent.duplicate, true);
    const listing = await client.callTool({ name: 'posting_list', arguments: {} });
    assert.equal(listing.structuredContent.postings.length, 1);
    const tracked = await client.callTool({ name: 'posting_track', arguments: { id: imported.structuredContent.posting.id, tracked: true } });
    assert.equal(tracked.structuredContent.dashboard_updated, true);
    const built = await client.callTool({ name: 'dashboard_build', arguments: {} });
    assert.equal(built.structuredContent.tracked_count, 1);
    const trackedAgain = await client.callTool({ name: 'posting_import', arguments: input() });
    assert.equal(trackedAgain.structuredContent.duplicate, true);
    assert.equal(trackedAgain.structuredContent.posting.status, 'tracked');
    const fetched = await client.callTool({ name: 'posting_get', arguments: { id: imported.structuredContent.posting.id } });
    assert.ok(!fetched.isError);
    const analysis = analysisInput(fetched.structuredContent, profile.structuredContent);
    const saved = await client.callTool({ name: 'posting_save_analysis', arguments: analysis });
    assert.ok(!saved.isError); assert.equal(saved.structuredContent.score, 100); assert.equal(saved.structuredContent.status, 'tracked');
    const stale = await client.callTool({ name: 'posting_save_analysis', arguments: analysis });
    assert.equal(stale.isError, true); assert.equal(stale.structuredContent.error.code, 'STALE_POSTING');
    const latest = await client.callTool({ name: 'posting_get', arguments: { id: analysis.id } });
    const draft = applicationInput(latest.structuredContent, profile.structuredContent);
    const application = await client.callTool({ name: 'application_save', arguments: draft });
    assert.ok(!application.isError); assert.equal(application.structuredContent.sections[0].score, 100);
    assert.equal(application.structuredContent.sections[0].evaluation.criteria.clarity.deducted, 0);
    const missingEvaluation = structuredClone(draft); missingEvaluation.sections[0].evaluation = null;
    assert.equal((await client.callTool({ name: 'application_save', arguments: missingEvaluation })).isError, true);
    const resume = structuredClone(draft); resume.kind = 'resume';
    resume.sections[0].evaluation = resumeEvaluation(resume.sections[0].answer);
    const reviewed = await client.callTool({ name: 'application_save', arguments: resume });
    assert.ok(!reviewed.isError); assert.equal(reviewed.structuredContent.sections[0].evaluation.mode, 'qualitative');
    assert.equal(reviewed.structuredContent.sections[0].score, null);
    const firstVersion = application.structuredContent.version;
    const revised = await client.callTool({ name: 'application_save', arguments: draft });
    assert.ok(!revised.isError); assert.notEqual(revised.structuredContent.version, firstVersion);
    draft.sections[0].claims[0].evidence[0].quote = '존재하지 않는 수치';
    const badDraft = await client.callTool({ name: 'application_save', arguments: draft });
    assert.equal(badDraft.isError, true); assert.equal(badDraft.structuredContent.error.code, 'INVALID_EVIDENCE');
    const long = await sharp({ create: { width: 32, height: 3500, channels: 3, background: 'white' } }).png().toBuffer();
    writeFileSync(join(root, 'inbox', 'long.png'), long);
    const split = await client.callTool({ name: 'posting_import', arguments: input({ image_path: 'long.png' }) });
    assert.equal(split.isError, undefined);
    assert.equal(split.structuredContent.manifest.crops.length, 3);
    assert.equal(split.structuredContent.manifest.crops[1].top, 1440);
    const invalid = await client.callTool({ name: 'profile_read', arguments: { path: '../secret.md' } });
    assert.equal(invalid.isError, true);
    assert.equal(invalid.structuredContent.error.code, 'INVALID_PATH');
    assert.ok(!JSON.stringify(invalid).includes(root));
    assert.equal(stderr, '');
  } finally { await client.close(); }
});

test('CLI requires an explicit workspace and provides help without starting a server', () => {
  const missing = spawnSync(process.execPath, [cli], { encoding: 'utf8' });
  assert.equal(missing.status, 1);
  assert.equal(missing.stdout, '');
  const help = spawnSync(process.execPath, [cli, '--help'], { encoding: 'utf8' });
  assert.equal(help.status, 0);
  assert.match(help.stdout, /profile_list/);
});

test('legacy 2025 MCP initialization and tools/list work over plain JSON-RPC', { timeout: 10000 }, async t => {
  const { root } = fixture(t);
  const child = spawn(process.execPath, [cli, '--workspace', root], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
  const lines = createInterface({ input: child.stdout });
  const pending = new Map();
  const exited = new Promise(resolve => child.once('exit', resolve));
  let stderr = '';
  child.stderr.on('data', chunk => { stderr += chunk.toString(); });
  lines.on('line', line => {
    const message = JSON.parse(line);
    if (message.id !== undefined) { pending.get(message.id)?.(message); pending.delete(message.id); }
  });
  const request = (id, method, params) => new Promise(resolve => {
    pending.set(id, resolve);
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
  });
  try {
    const initialized = await request(1, 'initialize', { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'legacy-test', version: '1' } });
    assert.equal(initialized.result.protocolVersion, '2025-11-25');
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
    const list = await request(2, 'tools/list', {});
    assert.equal(list.result.tools.length, 9);
    assert.equal(stderr, '');
  } finally {
    lines.close();
    child.stdin.end();
    child.kill();
    await exited;
  }
});
