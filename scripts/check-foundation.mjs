// Repository checks only. This does not run or test the future MCP product.
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const git = (args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' });
const privatePaths = [
  '개인 자료/resume.md',
  '개인 자료/nested/career.pdf',
  '공고/2026-11-01_가상기업_개발/사진/original.png',
  '공고/2026-11-01_가상기업_개발/지원서류/essay.md',
  'dashboard/index.html',
  '.jobshot/calendar/auth.json',
  '.env', '.env.local', 'credentials.json', 'client_secret_example.json',
  'token.json', 'tokens.json', 'private.key', '.mcp.json',
  '.codex/config.toml', '.claude/settings.local.json', 'debug.log',
];
const publicPaths = [
  'README.md', 'AGENTS.md', 'CLAUDE.md',
  'skills/jobshot-coach/SKILL.md', 'docs/evaluation-rubric.json',
  '.github/pull_request_template.md', '.env.example',
  '개인 자료/.gitkeep', '공고/.gitkeep', 'dashboard/.gitkeep',
];

const ignored = spawnSync('git', ['-c', 'core.quotePath=false', 'check-ignore', '--no-index', '--stdin'], {
  cwd: root,
  encoding: 'utf8',
  input: [...privatePaths, ...publicPaths].join('\n') + '\n',
});
assert.ifError(ignored.error);
assert.ok([0, 1].includes(ignored.status), ignored.stderr);
const ignoredPaths = new Set(ignored.stdout.trim().split(/\r?\n/).filter(Boolean));
for (const path of privatePaths) assert.ok(ignoredPaths.has(path), `Private path is not ignored: ${path}`);
for (const path of publicPaths) assert.ok(!ignoredPaths.has(path), `Public path is ignored: ${path}`);

const tracked = git(['ls-files', '-z']).split('\0').filter(Boolean);
for (const path of tracked) {
  const inPrivateDirectory = /^(개인 자료|공고|dashboard|\.jobshot|inbox|exports|tmp|\.codex|\.claude)\//u.test(path);
  const allowedMarker = /^(개인 자료|공고|dashboard)\/\.gitkeep$/u.test(path);
  assert.ok(!inPrivateDirectory || allowedMarker, `Private file is tracked: ${path}`);
  const basename = path.split('/').at(-1);
  const credential = /^(\.env(?:\..*)?|credentials.*\.json|client_secret.*\.json|tokens?\.json|\.mcp\.json)$/.test(basename)
    || /\.(pem|key)$/.test(basename);
  assert.ok(!credential || basename === '.env.example', `Credential file is tracked: ${path}`);
}

const rubric = JSON.parse(readFileSync(join(root, 'docs/evaluation-rubric.json'), 'utf8'));
for (const section of ['job_fit', 'essay_question']) {
  const values = Object.values(rubric[section]);
  assert.ok(values.every(value => Number.isInteger(value) && value > 0));
  assert.equal(values.reduce((sum, value) => sum + value, 0), 100, `${section} must total 100`);
}

// Only inspect repository documentation, never the user's private folders.
function markdownFiles(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? markdownFiles(path) : entry.name.endsWith('.md') ? [path] : [];
  });
}
const documents = [
  ...['README.md', 'AGENTS.md', 'CLAUDE.md', 'CONTRIBUTING.md'].map(path => join(root, path)),
  ...['docs', 'skills', '.github'].flatMap(path => markdownFiles(join(root, path))),
];
let links = 0;
for (const document of documents) {
  const content = readFileSync(document, 'utf8');
  for (const match of content.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
    const target = match[1];
    if (/^(?:https?:|mailto:|#)/.test(target)) continue;
    const path = decodeURIComponent(target.split('#')[0]);
    assert.ok(existsSync(resolve(dirname(document), path)), `Broken link in ${document}: ${target}`);
    links++;
  }
}
console.log(`PASS: ${privatePaths.length} private and ${publicPaths.length} public path cases; ${tracked.length} tracked files checked.`);
console.log(`PASS: both rubrics total 100; ${documents.length} Markdown documents and ${links} local links checked.`);
