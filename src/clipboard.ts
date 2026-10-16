import { spawnSync } from 'node:child_process';
import { closeSync, openSync, unlinkSync, writeFileSync } from 'node:fs';
import { fail } from './errors.js';
import { inspectImage } from './images.js';
import { MAX_IMAGE_BYTES, sha256, Workspace } from './workspace.js';

// One explicit read, never SetImage/Clear, clipboard polling, text or file-list access.
// No user data is interpolated into PowerShell code or command arguments.
export const clipboardScript = `
$ErrorActionPreference = 'Stop'
$image = $null
$stream = $null
try {
  Add-Type -AssemblyName System.Windows.Forms
  Add-Type -AssemblyName System.Drawing
  $image = [System.Windows.Forms.Clipboard]::GetImage()
  if ($null -eq $image) { exit 2 }
  if ([long]$image.Width * [long]$image.Height -gt 40000000) { exit 3 }
  $stream = New-Object System.IO.MemoryStream
  $image.Save($stream, [System.Drawing.Imaging.ImageFormat]::Png)
  if ($stream.Length -gt 20971520) { exit 3 }
  [Console]::Out.Write([Convert]::ToBase64String($stream.ToArray()))
} catch { exit 4 }
finally {
  if ($null -ne $stream) { $stream.Dispose() }
  if ($null -ne $image) { $image.Dispose() }
}
`;

export function runClipboardScript(script: string) {
  return spawnSync('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-STA',
    '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], {
    encoding: 'utf8', windowsHide: true, timeout: 10000,
    maxBuffer: Math.ceil(MAX_IMAGE_BYTES / 3) * 4 + 4096,
  });
}

type Runner = (script: string) => { status: number | null; stdout: string; error?: unknown };
export function readClipboardPng(platform: string = process.platform, run: Runner = runClipboardScript): Buffer {
  if (platform !== 'win32') fail('UNSUPPORTED_PLATFORM', '클립보드 저장은 Windows에서만 지원합니다. 이미지를 inbox/에 파일로 저장하세요.');
  const result = run(clipboardScript);
  if (result.error) fail('CLIPBOARD_UNAVAILABLE', '클립보드를 읽지 못했습니다. 캡처를 파일로 저장해 inbox/에 넣으세요.');
  if (result.status === 2) fail('CLIPBOARD_EMPTY', '복사된 이미지가 없습니다. Win+Shift+S로 캡처한 뒤 다시 실행하세요.');
  if (result.status === 3) fail('FILE_TOO_LARGE', '캡처가 20 MiB 또는 4천만 픽셀 제한을 넘었습니다. 더 작은 영역을 캡처하세요.');
  if (result.status !== 0) fail('CLIPBOARD_UNAVAILABLE', '클립보드가 사용 중이거나 접근할 수 없습니다. 다시 시도하거나 파일 입력을 사용하세요.');
  const encoded = result.stdout.trim();
  if (!encoded || encoded.length > Math.ceil(MAX_IMAGE_BYTES / 3) * 4
    || encoded.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) {
    fail('INVALID_IMAGE', '클립보드 이미지 응답을 읽을 수 없습니다. 파일 입력을 사용하세요.');
  }
  const bytes = Buffer.from(encoded, 'base64');
  if (bytes.toString('base64') !== encoded) fail('INVALID_IMAGE', '클립보드 이미지 응답이 올바르지 않습니다.');
  return bytes;
}

export async function saveClipboardPng(workspace: Workspace, bytes: Buffer) {
  const info = await inspectImage(bytes);
  if (info.format !== 'png') fail('INVALID_IMAGE', '클립보드 저장에는 PNG 응답이 필요합니다.');
  workspace.directory('inbox');
  const hash = sha256(bytes);
  const name = `capture-${hash}.png`;
  const relative = `inbox/${name}`;
  const path = workspace.path(relative);
  if (path.length > 240) fail('PATH_TOO_LONG', '작업 폴더 경로가 너무 깁니다. 더 짧은 경로를 사용하세요.');
  let fd: number;
  try { fd = openSync(path, 'wx'); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    const saved = workspace.read(relative, MAX_IMAGE_BYTES);
    if (sha256(saved.bytes) !== hash) fail('RECORD_CHANGED', '같은 이름의 캡처 파일이 변경됐습니다. 기존 파일을 확인하세요.');
    return { image_path: name, duplicate: true, sha256: hash };
  }
  try { writeFileSync(fd, bytes); }
  catch (error) {
    closeSync(fd);
    unlinkSync(workspace.path(relative));
    throw error;
  }
  closeSync(fd);
  return { image_path: name, duplicate: false, sha256: hash };
}
