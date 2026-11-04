// Repeatable first-use smoke check. Uses only a new synthetic workspace; no Google calls.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';

const root = fileURLToPath(new URL('../', import.meta.url));
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
mkdirSync(join(root, 'tmp'), { recursive: true });
const workspace = mkdtempSync(join(root, 'tmp/release-smoke-'));
for (const folder of ['inbox', '개인 자료']) mkdirSync(join(workspace, folder));
const answer = '가상 프로젝트에서 기능 구현을 담당했습니다.';
const profileFile = join(workspace, '개인 자료/가상경험.md');
writeFileSync(profileFile, answer + '\n실제 지원자 자료가 아닌 설치 확인용 예시입니다.\n');
const imageFile = join(workspace, 'inbox/sample.png');
await sharp(Buffer.from('<svg width="800" height="500" xmlns="http://www.w3.org/2000/svg"><rect width="800" height="500" fill="white"/><g font-family="sans-serif" fill="black"><text x="40" y="90" font-size="36">JobShot synthetic posting</text><text x="40" y="170" font-size="24">Example Co / Backend developer</text><text x="40" y="230" font-size="24">Requirement: project development experience</text><text x="40" y="290" font-size="24">Deadline: unknown / No live vacancy</text></g></svg>')).png().toFile(imageFile);
const snapshot = file => ({ sha256: createHash('sha256').update(readFileSync(file)).digest('hex'), mtime: statSync(file).mtimeMs });
const original = snapshot(imageFile), profileBefore = snapshot(profileFile);
const client = new Client({ name: 'jobshot-release-smoke', version: pkg.version });
const transport = new StdioClientTransport({ command: process.execPath,
  args: [join(root, 'dist/cli.js'), '--workspace', workspace], stderr: 'pipe',
  env: { ...process.env, JOBSHOT_AUTH_HOME: join(workspace, 'synthetic-auth'), LOCALAPPDATA: join(workspace, 'synthetic-auth') },
});
let stderr = '';
transport.stderr?.on('data', data => { stderr += data.toString(); });
async function call(name, args = {}) {
  const result = await client.callTool({ name, arguments: args }, undefined, { timeout: 30000 });
  assert.ok(!result.isError, `${name}: ${JSON.stringify(result.structuredContent)}`);
  return result.structuredContent;
}
try {
  await client.connect(transport, { timeout: 30000 });
  assert.equal(client.getServerVersion().version, pkg.version);
  const inventory = await client.listTools();
  assert.equal(inventory.tools.length, 11);
  const profiles = await call('profile_list');
  assert.equal(profiles.files.length, 1);
  const profile = await call('profile_read', { path: '가상경험.md' });
  const input = { image_path: 'sample.png', company: '가상기업', role: '백엔드 개발', deadline: { kind: 'unknown' }, source_url: null };
  const imported = await call('posting_import', input);
  assert.equal(imported.posting.status, 'imported');
  assert.equal((await call('dashboard_build')).tracked_count, 0);
  assert.equal((await call('posting_import', input)).duplicate, true);
  const tracked = await call('posting_track', { id: imported.posting.id, tracked: true });
  assert.equal(tracked.dashboard_updated, true);
  assert.equal((await call('dashboard_build')).tracked_count, 1);
  const fetched = await call('posting_get', { id: imported.posting.id });
  const draft = { id: imported.posting.id, posting_sha256: fetched.posting_sha256, kind: 'resume', title: '설치 확인용 가상 이력서',
    profile_sources: [{ path: profile.path, sha256: profile.sha256 }],
    sections: [{ key: 'experience', prompt: '개발 경험', answer,
      length_rule: { minimum: null, maximum: null, spaces: 'unknown', platform: null },
      posting_evidence: [{ quote: 'Requirement: project development experience', location: '가상 공고 이미지' }],
      claims: [{ text: answer, status: 'supported', evidence: [{ source_index: 0, quote: answer }], note: '가상 자료 인용' }],
      missing_information: [], evaluation: { type: 'resume_qualitative',
        strengths: [{ comment: '담당 역할이 명시되어 있음', answer_quotes: [answer] }],
        evidence_gaps: [{ comment: '구현 과정·결과 근거가 부족함', answer_quotes: [answer] }],
        recruiter_view: '경험의 역할을 확인할 수 있음', practitioner_view: '기술 선택과 구현 과정을 확인할 필요가 있음',
        improvement_priorities: ['확인 가능한 구현 과정과 결과를 추가'],
      },
    }],
  };
  const saved = await call('application_save', draft);
  assert.equal(saved.saved, true);
  assert.equal(saved.sections[0].score, null);
  assert.equal(saved.sections[0].evaluation.mode, 'qualitative');
  const first = readFileSync(join(workspace, saved.path));
  const revised = await call('application_save', draft);
  assert.notEqual(revised.version, saved.version);
  assert.deepEqual(readFileSync(join(workspace, saved.path)), first);
  const missing = await client.callTool({ name: 'profile_read', arguments: { path: '없는자료.md' } });
  assert.equal(missing.isError, true);
  assert.equal(missing.structuredContent.error.code, 'FILE_NOT_FOUND');
  assert.deepEqual(snapshot(imageFile), original);
  assert.deepEqual(snapshot(profileFile), profileBefore);
  assert.equal(stderr, '');
  const receipt = { version: pkg.version, node: process.version, platform: process.platform,
    transport: 'MCP SDK stdio; not a client UI or model-generated draft',
    toolCount: 11, imported: true, duplicatePrevented: true, tracked: true, resumeVersions: 2,
    qualitativeEvaluation: true, missingFileRejected: true, originalsPreserved: true, googleNetworkRequested: false,
    dashboard: 'dashboard/index.html', application: saved.path,
  };
  writeFileSync(join(workspace, 'result.json'), JSON.stringify(receipt, null, 2) + '\n');
  console.log(`PASS: first posting, calendar, resume/review, version preservation and missing-file recovery.\nSample workspace: ${relative(root, workspace)}\nNo Google connection or user configuration changed.`);
} catch (error) {
  console.error(`FAIL: ${error.message}`);
  process.exitCode = 1;
} finally { await client.close(); }
