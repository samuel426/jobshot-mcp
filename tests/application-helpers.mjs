import { essayWeights } from '../dist/applications.js';

export function applicationInput(posting, profile, evaluated = false) {
  const answer = '가상 프로젝트에서 기능 구현을 담당했습니다.';
  return {
    id: posting.posting.id, posting_sha256: posting.posting_sha256, kind: 'essay', title: '가상 지원서',
    profile_sources: [{ path: profile.path, sha256: profile.sha256 }],
    sections: [{ key: 'q1', prompt: '직무 관련 경험을 설명하세요.', answer,
      length_rule: { minimum: null, maximum: 500, spaces: 'included', platform: null },
      posting_evidence: [{ quote: '가상 프로젝트 개발 경험', location: '지원 자격' }],
      claims: [{ text: answer, status: 'supported', evidence: [{ source_index: 0, quote: profile.text }], note: '가상 자료에 기재된 개발 경험을 요약' }],
      missing_information: [], evaluation: evaluated ? {
        rubric_version: '0.1', criteria: Object.fromEntries(Object.entries(essayWeights).map(([key, max]) => [key, { status: 'assessed', score: max, reason: '가상 테스트 기준 충족', answer_quotes: [answer] }])),
        recruiter_view: '역할이 간결하게 전달됨', practitioner_view: '구현 과정 설명을 추가할 수 있음', improvement_priorities: ['구현 과정을 구체화'],
      } : null,
    }],
  };
}
