import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { createInterface } from 'node:readline';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { cli, fixture, image, input } from './helpers.mjs';

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
    assert.deepEqual(tools.map(tool => tool.name).sort(), ['posting_import', 'profile_list', 'profile_read']);
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
    assert.equal(list.result.tools.length, 3);
    assert.equal(stderr, '');
  } finally {
    lines.close();
    child.stdin.end();
    child.kill();
    await exited;
  }
});
