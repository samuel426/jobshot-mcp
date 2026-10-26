import { dirname, basename } from 'node:path';
import { connectGoogle, defaultGoogleStore, disconnectGoogle, recoverCalendar } from './google-auth.js';
import { publicError, fail } from './errors.js';
import { MAX_TEXT_BYTES, Workspace } from './workspace.js';

const args = process.argv.slice(2);
if (args.length === 1 && args[0] === '--help') {
  console.log('JobShot Google Calendar (Windows)\nnode dist/google-cli.js --workspace <absolute folder> --connect <Desktop OAuth JSON absolute path>\nnode dist/google-cli.js --workspace <absolute folder> --status\nnode dist/google-cli.js --workspace <absolute folder> --disconnect\nnode dist/google-cli.js --workspace <absolute folder> --recover-calendar <calendar ID>\nConnect uses your browser consent and creates a dedicated JobShot calendar. It does not send job postings. Never paste credentials or tokens into chat.');
} else {
  try {
    const action = args[2];
    if (args[0] !== '--workspace' || !args[1] || !['--connect', '--status', '--disconnect', '--recover-calendar'].includes(action ?? '')
      || args.length !== (['--connect', '--recover-calendar'].includes(action!) ? 4 : 3)) fail('INVALID_INPUT', 'google-cli.js --help로 명령 형식을 확인하세요.');
    const workspace = new Workspace(args[1]); const store = defaultGoogleStore(workspace);
    let result: unknown;
    if (action === '--status') {
      const connection = store.load();
      result = { connected: !!connection?.refresh_token && connection.setup === 'ready', calendar_id: connection?.calendar_id ?? null, setup: connection?.setup ?? null, notice: '로컬 연결 정보이며 Google 권한 유효성은 전송 시 확인합니다.' };
    } else if (action === '--disconnect') result = await disconnectGoogle(store);
    else if (action === '--recover-calendar') result = await recoverCalendar(store, args[3]!);
    else {
      const file = args[3]!;
      const source = new Workspace(dirname(file), false);
      let credentials: unknown;
      try { credentials = JSON.parse(source.read(basename(file), MAX_TEXT_BYTES).bytes.toString('utf8')); }
      catch { fail('GOOGLE_CLIENT', '선택한 Desktop OAuth JSON 파일을 읽지 못했습니다.'); }
      result = await connectGoogle(store, credentials, url => { console.log(`시스템 브라우저에서 아래 주소를 열어 계정을 선택하고 동의하세요. 3분 안에 완료해 주세요.\n${url}`); });
    }
    console.log(JSON.stringify(result));
  } catch (error) { console.error(JSON.stringify(publicError(error))); process.exitCode = 1; }
}
