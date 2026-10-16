import { existsSync, renameSync } from 'node:fs';
import { setTimeout } from 'node:timers/promises';
import { fail } from './errors.js';
import type { Workspace } from './workspace.js';

// Windows scanners/sync software can briefly hold a newly created directory.
// Keep the import lock and recheck paths on every attempt; never replace a target.
export async function publishDirectory(workspace: Workspace, source: string, target: string, move = renameSync) {
  for (let attempt = 0; ; attempt++) {
    const destination = workspace.path(target);
    if (existsSync(destination)) fail('NAME_CONFLICT', '저장 중 같은 이름의 폴더가 생겼습니다. 기존 자료를 확인하세요.');
    try { move(workspace.path(source), destination); return; }
    catch (error) {
      if (attempt >= 3 || !['EPERM', 'EACCES', 'EBUSY'].includes((error as NodeJS.ErrnoException).code ?? '')) throw error;
      await setTimeout(100 * (attempt + 1));
    }
  }
}
