export class JobShotError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = 'JobShotError';
  }
}

export function fail(code: string, message: string): never {
  throw new JobShotError(code, message);
}

export function publicError(error: unknown) {
  if (error instanceof JobShotError) return { code: error.code, message: error.message };
  // Do not expose absolute paths, file contents or native decoder errors to logs.
  return { code: 'IO_ERROR', message: '파일 작업을 완료하지 못했습니다. 접근 권한과 파일 사용 여부를 확인한 뒤 다시 시도하세요.' };
}
