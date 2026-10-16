import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { publishDirectory } from '../dist/publish.js';
import { fixture } from './helpers.mjs';

test('publication retries transient locks but stops if a destination appears', async t => {
  const { root, workspace } = fixture(t);
  mkdirSync(join(root, '공고', '.pending-test'));
  let calls = 0;
  await publishDirectory(workspace, '공고/.pending-test', '공고/done', (from, to) => {
    if (++calls < 3) throw Object.assign(new Error('busy'), { code: 'EPERM' });
    renameSync(from, to);
  });
  assert.equal(calls, 3);
  assert.equal(existsSync(join(root, '공고', 'done')), true);
  mkdirSync(join(root, '공고', '.pending-second'));
  await assert.rejects(publishDirectory(workspace, '공고/.pending-second', '공고/collision', () => {
    mkdirSync(join(root, '공고', 'collision'));
    writeFileSync(join(root, '공고', 'collision', 'keep.txt'), 'keep');
    throw Object.assign(new Error('busy'), { code: 'EBUSY' });
  }), { code: 'NAME_CONFLICT' });
  assert.equal(readFileSync(join(root, '공고', 'collision', 'keep.txt'), 'utf8'), 'keep');
});

test('publication stops after bounded retries and does not retry unrelated failures', async t => {
  const { root, workspace } = fixture(t);
  mkdirSync(join(root, '공고', '.pending-test'));
  for (const [code, expected] of [['EACCES', 4], ['ENOSPC', 1]]) {
    let calls = 0;
    await assert.rejects(publishDirectory(workspace, '공고/.pending-test', '공고/done', () => {
      calls++; throw Object.assign(new Error('test failure'), { code });
    }), { code });
    assert.equal(calls, expected);
    assert.equal(existsSync(join(root, '공고', '.pending-test')), true);
  }
});
