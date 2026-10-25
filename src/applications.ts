import { existsSync, mkdirSync, renameSync, rmdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { findPosting } from './analysis.js';
import { locked, postingIdSchema } from './calendar.js';
import { fail } from './errors.js';
import { profileRead } from './profile.js';
import { MAX_TEXT_BYTES, sha256, Workspace } from './workspace.js';

export const essayWeights = { answers_question: 25, job_relevance: 25, specific_evidence: 30, clarity: 15, format_compliance: 5 } as const;
const labels = { answers_question: '질문에 대한 직접적인 답변', job_relevance: '직무·기업 요구사항과의 연결', specific_evidence: '경험·행동·성과의 구체성과 근거', clarity: '논리·가독성', format_compliance: '분량·형식 준수' };
const text = z.string().trim().min(1).max(2000);
const citation = z.object({ source_index: z.number().int().min(0).max(19), quote: text }).strict();
const postingEvidence = z.object({ quote: text, location: text }).strict();
const criterion = (maximum: number) => z.object({
  status: z.enum(['assessed', 'unknown']), score: z.number().min(0).max(maximum).nullable(),
  reason: text.describe('이 점수를 준 구체적인 이유와 충족한 부분'),
  deduction_reason: text.describe('감점한 부분과 이유. 만점이면 감점 없음, 미평가면 유보 이유'),
  answer_quotes: z.array(text).min(1).max(10),
}).strict().superRefine((item, ctx) => {
  if ((item.status === 'assessed') !== (item.score !== null)) ctx.addIssue({ code: 'custom', message: '평가한 항목에만 점수를 입력하세요.' });
});
const evaluation = z.object({
  rubric_version: z.literal('0.1'),
  criteria: z.object({ answers_question: criterion(25), job_relevance: criterion(25), specific_evidence: criterion(30), clarity: criterion(15), format_compliance: criterion(5) }).strict(),
  recruiter_view: text, practitioner_view: text, improvement_priorities: z.array(text).min(1).max(5),
}).strict();
const reviewPoint = z.object({ comment: text, answer_quotes: z.array(text).min(1).max(10) }).strict();
const resumeReview = z.object({
  type: z.literal('resume_qualitative'),
  strengths: z.array(reviewPoint).max(10), evidence_gaps: z.array(reviewPoint).max(10),
  recruiter_view: text, practitioner_view: text, improvement_priorities: z.array(text).min(1).max(5),
}).strict();
const lengthRule = z.object({
  minimum: z.number().int().min(0).max(50000).nullable(), maximum: z.number().int().min(1).max(50000).nullable(),
  spaces: z.enum(['included', 'excluded', 'unknown']), platform: text.nullable(),
}).strict().superRefine((rule, ctx) => {
  if (rule.minimum !== null && rule.maximum !== null && rule.minimum > rule.maximum) ctx.addIssue({ code: 'custom', message: '최소 분량이 최대 분량보다 큽니다.' });
});

export const applicationSchema = z.object({
  id: postingIdSchema, posting_sha256: postingIdSchema,
  kind: z.enum(['essay', 'resume']), title: text,
  profile_sources: z.array(z.object({ path: z.string().startsWith('개인 자료/').max(500), sha256: postingIdSchema }).strict()).min(1).max(20),
  sections: z.array(z.object({
    key: z.string().regex(/^[a-zA-Z0-9_-]{1,40}$/), prompt: text,
    // Preserve user formatting: do not trim the draft before counting or saving it.
    answer: z.string().min(1).max(50000).refine(value => value.trim().length > 0),
    length_rule: lengthRule,
    posting_evidence: z.array(postingEvidence).min(1).max(10),
    claims: z.array(z.object({
      text, status: z.enum(['supported', 'needs_confirmation', 'conflict']),
      evidence: z.array(citation).max(20), note: text,
    }).strict()).max(50),
    missing_information: z.array(text).max(20),
    evaluation: z.union([evaluation, resumeReview]).describe('항상 포함합니다. 자소서는 v0.1 항목별 점수·근거·감점 이유, 이력서는 resume_qualitative 강점·부족한 근거·개선안이며 숫자 점수는 입력하지 않습니다.'),
  }).strict()).min(1).max(20),
}).strict();
export type ApplicationInput = z.input<typeof applicationSchema>;

export function countAnswer(answer: string, rule: z.infer<typeof lengthRule>) {
  const normalized = answer.replace(/\r\n?/g, '\n');
  const included = [...normalized].length, excluded = [...normalized.replace(/\s/gu, '')].length;
  const selected = rule.spaces === 'unknown' ? null : rule.spaces === 'included' ? included : excluded;
  const status = selected === null || (rule.minimum === null && rule.maximum === null) ? 'unknown'
    : rule.maximum !== null && selected > rule.maximum ? 'over_limit'
    : rule.minimum !== null && selected < rule.minimum ? 'under_minimum' : 'within_limit';
  return { included, excluded, selected, status, method: 'unicode_code_points_lf',
    notice: '로컬 참고 글자 수입니다. CRLF/CR은 LF로 계산하고 공백 제외는 줄바꿈·탭을 포함한 모든 공백을 뺍니다. 지원 플랫폼의 실제 계산과 다를 수 있습니다.' };
}

// Every user-controlled line is a quoted paragraph. Disable active Markdown/HTML.
function quote(value: string) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/[\\`*_{}\[\]()#!|~]/g, '\\$&').split(/\r\n?|\n/).map(line => `> ${line}`).join('\n');
}

export function applicationSave(workspace: Workspace, raw: ApplicationInput, write = writeFileSync) {
  const parsed = applicationSchema.safeParse(raw);
  if (!parsed.success) fail('INVALID_APPLICATION', '모든 문항/항목에 평가가 필요합니다. 자소서는 점수·근거·감점 이유, 이력서는 강점·부족한 근거·개선안을 포함하고 서류·분량·자료·배점을 확인하세요. 기존 버전은 보존했습니다.');
  const input = parsed.data;
  return locked(workspace, () => {
    const item = findPosting(workspace, input.id);
    if (item.sha256 !== input.posting_sha256) fail('STALE_POSTING', '공고가 변경됐습니다. posting_get으로 다시 읽고 서류를 갱신하세요.');
    if (!['imported', 'analyzed', 'tracked'].includes(item.record.status)) fail('INVALID_STATE', '현재 공고 상태에서는 서류를 저장할 수 없습니다.');
    const paths = new Set<string>();
    const sources = input.profile_sources.map(source => {
      if (paths.has(source.path)) fail('INVALID_APPLICATION', '같은 자료를 중복 참조할 수 없습니다.');
      paths.add(source.path);
      const current = profileRead(workspace, source.path.slice('개인 자료/'.length));
      if (current.sha256 !== source.sha256) fail('STALE_PROFILE', '선택한 개인 자료가 변경됐습니다. 다시 읽고 서류·평가를 갱신하세요.');
      return current;
    });
    if (sources.reduce((sum, source) => sum + Buffer.byteLength(source.text), 0) > 10 * MAX_TEXT_BYTES) fail('FILE_TOO_LARGE', '선택한 자료의 합계는 10 MiB 이하여야 합니다.');
    const keys = new Set<string>();
    const savedAt = new Date().toISOString();
    const sections = input.sections.map(section => {
      if (keys.has(section.key)) fail('INVALID_APPLICATION', '문항 key는 서로 달라야 합니다.');
      keys.add(section.key);
      for (const claim of section.claims) {
        if (!section.answer.includes(claim.text)) fail('INVALID_EVIDENCE', '근거를 연결할 문장이 서류 본문에 없습니다.');
        if (claim.status === 'supported' && !claim.evidence.length) fail('INVALID_EVIDENCE', '확인된 경험·성과에는 개인 자료 인용이 필요합니다. 확인 전에는 needs_confirmation으로 표시하세요.');
        for (const citation of claim.evidence) {
          if (!sources[citation.source_index]?.text.includes(citation.quote)) fail('INVALID_EVIDENCE', '선택한 자료에 없는 인용입니다. 원문을 확인하세요.');
        }
      }
      const needsConfirmation = section.claims.some(claim => claim.status !== 'supported') || section.missing_information.length > 0;
      const length = countAnswer(section.answer, section.length_rule);
      const e = section.evaluation;
      let scored;
      if ('criteria' in e) {
        if (input.kind !== 'essay') fail('INVALID_APPLICATION', '이력서는 숫자 점수 대신 resume_qualitative 평가를 포함하세요.');
        for (const c of Object.values(e.criteria)) for (const excerpt of c.answer_quotes) {
          if (!section.answer.includes(excerpt)) fail('INVALID_EVIDENCE', '평가 근거 문장이 해당 문항의 답변에 없습니다.');
        }
        const format = e.criteria.format_compliance;
        if (length.status === 'unknown' && format.status !== 'unknown') fail('INVALID_APPLICATION', '분량 기준을 모르면 형식 점수는 unknown/null로 유보하세요.');
        if (['over_limit', 'under_minimum'].includes(length.status) && format.score !== null && format.score !== 0) fail('INVALID_APPLICATION', '분량을 벗어난 초안에 형식 준수 점수를 줄 수 없습니다.');
        const noEvidence = !section.claims.some(claim => claim.status === 'supported');
        const withheld = needsConfirmation || noEvidence || Object.values(e.criteria).some(c => c.status === 'unknown');
        const total = withheld ? null : Math.round(Object.values(e.criteria).reduce((sum, c) => sum + c.score!, 0) * 10) / 10;
        const criteria = Object.fromEntries(Object.entries(e.criteria).map(([key, c]) => {
          const maximum = essayWeights[key as keyof typeof essayWeights];
          return [key, { ...c, maximum, deducted: c.score === null ? null : Math.round((maximum - c.score) * 10) / 10 }];
        }));
        scored = { ...e, mode: 'scored' as const, criteria, score: total, withheld, evaluated_at: savedAt,
          withholding_reasons: [...(needsConfirmation ? ['확인할 사실 또는 누락 정보'] : []), ...(noEvidence ? ['개인 자료에 연결된 경험 근거 없음'] : []), ...(Object.values(e.criteria).some(c => c.status === 'unknown') ? ['미평가 항목'] : [])] };
      } else {
        if (input.kind !== 'resume') fail('INVALID_APPLICATION', '자소서는 v0.1 문항별 점수·근거·감점 이유를 포함하세요.');
        for (const point of [...e.strengths, ...e.evidence_gaps]) for (const excerpt of point.answer_quotes) {
          if (!section.answer.includes(excerpt)) fail('INVALID_EVIDENCE', '이력서 평가의 근거 문장이 해당 항목의 본문에 없습니다.');
        }
        scored = { ...e, mode: 'qualitative' as const, score: null, withheld: true, evaluated_at: savedAt,
          withholding_reasons: ['이력서 전용 수치 평가 기준 미정: 강점·부족한 근거·개선안으로 평가'],
          needs_confirmation: needsConfirmation || !section.claims.some(claim => claim.status === 'supported') };
      }
      return { ...section, prompt_sha256: sha256(JSON.stringify({ prompt: section.prompt, length_rule: section.length_rule })), answer_sha256: sha256(section.answer), length,
        status: needsConfirmation ? 'needs_confirmation' : 'draft', evaluation: scored };
    });
    const version = randomUUID();
    const notice = '검토용 초안입니다. 기업 공식 평가·합격 확률이 아닙니다. 서버는 인용 존재와 자료 버전을 검사하며 누락된 사실 주장·인용의 의미·경력 사실을 보증하지 않습니다.';
    const record = { schema_version: 1, ...input, version, created_at: savedAt, posting_image_sha256: item.image_sha256,
      profile_sources: sources.map(({ path, sha256, modified_at, read_at }) => ({ path, sha256, modified_at, read_at })), sections, notice };
    const json = JSON.stringify(record, null, 2) + '\n';
    const lines = ['# 지원서류 검토용 초안', quote(input.title), '', notice, '', `버전 ${version} · 저장 시각 ${savedAt}`, '', '## 공고', quote(`${item.record.company} / ${item.record.role}`)];
    for (const section of sections) {
      lines.push('', `## 문항/항목 ${section.key}`, quote(section.prompt), '', section.status === 'needs_confirmation' ? '**확인 필요: 사실 확인 전 제출용으로 사용하지 마세요.**' : '상태: 검토용 초안', '', '### 본문', quote(section.answer), '', '### 분량',
        `공백 포함 ${section.length.included}자 / 제외 ${section.length.excluded}자 · 로컬 판정 ${section.length.status}`,
        `최소 ${section.length_rule.minimum ?? '미확인'} / 최대 ${section.length_rule.maximum ?? '미확인'} · 공백 기준 ${section.length_rule.spaces}`,
        quote(`플랫폼: ${section.length_rule.platform ?? '미확인'}`), section.length.notice, '', '### 근거와 확인 사항');
      for (const p of section.posting_evidence) lines.push(quote(`공고: ${p.quote} (${p.location})`));
      for (const c of section.claims) lines.push(quote(`${c.status}: ${c.text}\n${c.note}`), ...c.evidence.map(e => quote(`자료 ${e.source_index + 1}: ${e.quote}`)));
      lines.push(...section.missing_information.map(quote));
      const e = section.evaluation;
      if (e.mode === 'scored') {
        lines.push('', '### 문항별 참고 평가 v0.1', e.withheld ? `점수 유보: ${e.withholding_reasons.join(', ')}` : `${e.score}/100`);
        for (const [key, c] of Object.entries(e.criteria)) lines.push(`${labels[key as keyof typeof labels]}: ${c.score ?? '유보'}/${c.maximum} · 감점 ${c.deducted ?? '유보'}`, '점수 근거', quote(c.reason), '감점·유보 이유', quote(c.deduction_reason), '답변의 근거 문장', ...c.answer_quotes.map(quote));
      } else {
        lines.push('', '### 이력서 항목별 평가', `숫자 점수 유보: ${e.withholding_reasons.join(', ')}`, '강점');
        for (const point of e.strengths) lines.push(quote(point.comment), ...point.answer_quotes.map(quote));
        if (!e.strengths.length) lines.push('현재 자료에서 확인한 강점 없음');
        lines.push('부족한 근거');
        for (const point of e.evidence_gaps) lines.push(quote(point.comment), ...point.answer_quotes.map(quote));
        if (!e.evidence_gaps.length) lines.push('평가자가 지적한 부족 근거 없음. 사실 검증 완료를 뜻하지 않습니다.');
        if (e.needs_confirmation) lines.push('확인 필요: 개인 자료에 연결된 경험 근거와 미확인 사실을 확인하세요.');
      }
      lines.push('인사담당자 관점의 전달력', quote(e.recruiter_view), '실무자 관점의 구체성', quote(e.practitioner_view), '개선 우선순위', ...e.improvement_priorities.map((p, i) => quote(`${i + 1}. ${p}`)));
      lines.push(`문항·분량 기준 SHA-256: ${section.prompt_sha256}`, `본문 SHA-256: ${section.answer_sha256}`);
    }
    lines.push('', '## 사용한 자료 버전', `공고 기록 SHA-256: ${input.posting_sha256}`, `공고 원본 SHA-256: ${item.image_sha256}`, ...sources.map((source, i) => quote(`${i + 1}. ${source.path} · SHA-256: ${source.sha256}`)));
    const markdown = lines.join('\n') + '\n';
    if (Buffer.byteLength(json) > MAX_TEXT_BYTES || Buffer.byteLength(markdown) > MAX_TEXT_BYTES) fail('FILE_TOO_LARGE', '서류 버전의 JSON 또는 Markdown이 1 MiB를 넘습니다. 문항이나 근거를 나눠 저장하세요.');
    const parent = `${item.folder}/지원서류`;
    workspace.directory(parent, true);
    const pending = `${parent}/.pending-${version}`, destination = `${parent}/${version}`;
    mkdirSync(workspace.path(pending));
    try {
      write(workspace.path(`${pending}/서류.json`), json, { flag: 'wx' });
      write(workspace.path(`${pending}/초안.md`), markdown, { flag: 'wx' });
      if (existsSync(workspace.path(destination))) fail('NAME_CONFLICT', '같은 버전 경로가 있습니다. 기존 서류는 보존했습니다.');
      renameSync(workspace.path(pending), workspace.path(destination));
    } finally {
      // Only remove the two known temporary files; never recurse through user directories.
      if (existsSync(workspace.path(pending))) {
        for (const name of ['서류.json', '초안.md']) {
          const file = workspace.path(`${pending}/${name}`);
          if (existsSync(file)) unlinkSync(file);
        }
        rmdirSync(workspace.path(pending));
      }
    }
    return { id: input.id, version, path: `${destination}/초안.md`, record_path: `${destination}/서류.json`, saved: true,
      sections: sections.map(s => ({ key: s.key, status: s.status, length: s.length, score: s.evaluation.score, evaluated: true, withheld: s.evaluation.withheld, evaluation: s.evaluation })), notice };
  });
}
