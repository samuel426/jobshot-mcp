import { readClipboardPng, saveClipboardPng } from './clipboard.js';
import { publicError } from './errors.js';
import { Workspace } from './workspace.js';

const args = process.argv.slice(2);
if (args.length === 1 && args[0] === '--help') {
  console.log('JobShot Windows capture\nUsage: node dist/capture-cli.js --workspace <existing absolute folder>\nReads the current clipboard image once into inbox/. Does not analyze or register a posting.');
} else if (args.length !== 2 || args[0] !== '--workspace' || !args[1]) {
  console.error('Usage: node dist/capture-cli.js --workspace <existing absolute folder>');
  process.exitCode = 1;
} else {
  try {
    const workspace = new Workspace(args[1]);
    console.log(JSON.stringify(await saveClipboardPng(workspace, readClipboardPng())));
  } catch (error) {
    console.error(JSON.stringify(publicError(error)));
    process.exitCode = 1;
  }
}
