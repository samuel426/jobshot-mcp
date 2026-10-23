import { jobFitWeights } from '../dist/analysis.js';

export function analysisInput(posting, profile) {
  const evidence = [{ source_index: 0, quote: profile.text }];
  const posting_evidence = [{ quote: '가상 프로젝트 개발 경험', location: '원본 이미지의 지원 자격' }];
  return {
    id: posting.posting.id, posting_sha256: posting.posting_sha256, rubric_version: '0.1',
    profile_sources: [{ path: profile.path, sha256: profile.sha256 }],
    criteria: Object.fromEntries(Object.entries(jobFitWeights).map(([key, max]) => [key, { status: 'assessed', score: max, reason: '가상 자료의 개발 경험과 관련 있음', posting_evidence, evidence }])),
    required_requirements: [{ requirement: '개발 경험', posting_evidence: posting_evidence[0], status: 'met', reason: '가상 자료에 경험이 명시됨', evidence }],
    summary: ['가상 자료의 개발 경험을 근거로 평가'], missing_information: [],
  };
}
