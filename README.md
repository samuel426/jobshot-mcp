# JobShot

채용공고 캡처를 지원 일정과 나만의 취업 준비 계획으로 바꾸는 개인용 MCP 프로젝트.

> 현재 상태: 1단계 첫 구현 — 개인 자료 조회와 공고 이미지 저장 MCP.
> 달력, AI 평가 자동화, Google 연동, 긴 이미지 분할은 아직 없습니다.

## 목표하는 경험

1. 사용자가 `개인 자료/`에 이력서·경험·프로젝트 자료를 등록합니다.
2. AI 대화에 채용공고 캡처를 주면 공고 정보와 개인 자료를 비교합니다.
3. 분석만 원하면 적합도와 근거를 보여주고 끝냅니다.
4. 사용자가 원할 때만 월간 달력에 등록하고 Google 캘린더로 보냅니다.
5. 요청한 공고에 맞춰 서류 초안과 문항별 평가를 별도 파일로 만듭니다.

개발자 서버는 운영하지 않습니다. 개인 자료 원본은 읽기 전용으로 다루고,
실제 공고·서류·인증 정보는 Git에 포함하지 않습니다.
AI에 전달되는 자료는 사용자가 선택한 AI 서비스에서 처리됩니다.
로컬 MCP가 실행된다고 AI 처리까지 오프라인이 되는 것은 아닙니다.

## 지금 시작할 수 있는 것

```sh
git clone https://github.com/samuel426/jobshot-mcp.git
cd jobshot-mcp
```

Node.js 24에서 설치하고 빌드합니다.

```sh
npm ci
npm run build
node dist/cli.js --help
```

[설치·MCP 연결·공고 입력 안내](docs/getting-started.md)를 따라 연결하세요.
현재 도구는 `profile_list`, `profile_read`, `posting_import` 세 가지입니다.
개인 자료는 UTF-8 TXT·MD·JSON, 공고 원본은 PNG·JPEG·WebP 한 장을 지원합니다.
프로젝트 폴더의 `inbox/`에 이미지를 저장하면 공고별 폴더에 원본 그대로 보관할 수 있습니다.
실제 자료를 공개 이슈나 PR에는 첨부하지 마세요.
AI에 프로젝트를 설명할 때는 [AGENTS.md](AGENTS.md)를 읽도록 요청하세요.

| 문서 | 내용 |
| --- | --- |
| [시작하기](docs/getting-started.md) | 현재 구현 설치·도구 호출·문제 해결 |
| [제품 요구사항](docs/requirements.md) | 첫 버전 범위와 사용자 흐름 |
| [단계별 로드맵](docs/roadmap.md) | 0~5단계 완료 조건 |
| [구조와 데이터](docs/architecture.md) | 로컬 파일, 공고 상태, 날짜 처리 |
| [평가 기준](docs/evaluation.md) | 직무 적합도·자소서 문항별 점수 |
| [개인 자료 관리](docs/privacy.md) | 원본 보존과 전송 범위 |
| [협업 안내](CONTRIBUTING.md) | 브랜치·커밋·PR 규칙 |
| [AI 사용 흐름 스킬](skills/jobshot-coach/SKILL.md) | 첫 사용, 공고 분석, 등록 안내 |

## 개발 확인

`npm run check`는 빌드, 가상 자료 기반 기능·stdio 통합 테스트,
문서 링크·평가 배점·개인 파일 Git 제외 규칙 검사를 실행합니다.
GitHub Actions에서도 Windows와 Linux에 같은 검사를 실행합니다.
테스트는 `tmp/`의 격리 폴더를 사용하며 실제 개인 자료를 읽지 않습니다.

## 공개 및 라이선스 상태

오픈소스 배포를 목표로 준비 중입니다. 라이선스는 아직 확정하지 않았으며,
첫 배포 전에 결정합니다. 현재 공개된 저장소를 정식 배포판으로 안내하지 않습니다.
