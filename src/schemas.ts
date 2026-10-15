import { z } from 'zod';

const text = z.string().trim().min(1).max(120).refine(value => !/[\x00-\x1f\x7f]/.test(value), '제어 문자는 사용할 수 없습니다.');
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const parsed = new Date(`${value}T00:00:00Z`);
  return value >= '1900-01-01' && value <= '2199-12-31' && Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}, '1900~2199년의 실제 YYYY-MM-DD 날짜를 입력하세요.');

export const deadlineSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('unknown') }).strict(),
  z.object({ kind: z.literal('rolling') }).strict(),
  z.object({ kind: z.literal('date'), date }).strict(),
]);

export const importSchema = z.object({
  image_path: z.string().min(1).max(500).describe('inbox/ 기준 상대 이미지 경로. 예: 공고.png. 외부 절대 경로와 URL은 받지 않습니다.'),
  company: text.describe('사용자가 제공하거나 공고에서 확인한 기업명'),
  role: text.describe('확인한 직무명'),
  deadline: deadlineSchema.default({ kind: 'unknown' }).describe('날짜 미정은 unknown, 상시는 rolling. 연도·시각을 추측하지 마세요.'),
  source_url: z.string().max(2048).url().refine(value => {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password;
  }, '인증 정보가 없는 http(s) 원문 링크만 허용됩니다.').nullable().default(null),
}).strict();

export type ImportInput = z.input<typeof importSchema>;
