import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { createServer } from './server.js';
import { Workspace } from './workspace.js';
import { publicError } from './errors.js';

const args = process.argv.slice(2);
if (args.length === 1 && args[0] === '--help') {
  console.log('JobShot MCP\nUsage: node dist/cli.js --workspace <existing absolute folder>\nTools: profile_list, profile_read, posting_import\nTransport: stdio (no HTTP listener)');
} else if (args.length !== 2 || args[0] !== '--workspace' || !args[1]) {
  console.error('Usage: node dist/cli.js --workspace <existing absolute folder>');
  process.exitCode = 1;
} else {
  try {
    const workspace = new Workspace(args[1]);
    serveStdio(() => createServer(workspace), {
      onerror: () => console.error('JobShot: MCP 통신 오류. 연결 상태와 입력 형식을 확인하세요.'),
    });
  } catch (error) {
    console.error(JSON.stringify(publicError(error)));
    process.exitCode = 1;
  }
}
