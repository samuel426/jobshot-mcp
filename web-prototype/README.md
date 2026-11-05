# JobShot 웹 프로토타입

기존 로컬 MCP와 분리한 Vercel용 정적 화면이다. `public/`의 HTML·CSS·JavaScript만 서비스하며 런타임 패키지 설치나 빌드가 필요 없다.

## 화면과 범위

- 지원 달력: 월 이동·오늘·월간/목록 전환, 가상 공고 상세
- 공고 보관함: 가상 목록·기업/직무 검색·검색 결과 없음
- 지원 서류: 사전 작성된 자소서 점수/이유·이력서 정성 평가 예시
- 관리 설정: 가상 관리자 역할과 미연결 상태
- 520px 이하에서는 날짜별 목록, 그보다 큰 화면에서는 월간/목록 선택

화면 이동과 검색만 실제로 동작한다. 업로드·자료 저장·Google 연결·AI 평가·계정 로그인은 구현하지 않았다. 모든 자료는 가상이며 브라우저 저장소나 외부 API를 사용하지 않는다. 관리자 표시는 UI 예시이며 접근 제어가 아니다. 사용자 결정에 따라 Vercel 프로젝트의 소유 계정으로 배포·관리한다. 비밀번호·토큰을 화면이나 소스에 넣지 않는다.

## 로컬 확인

저장소 루트에서 `node scripts/preview-web-prototype.mjs`를 실행하고 출력된 루프백 URL을 연다. 이 서버는 허용된 정적 파일만 제공한다. 확인 후 Ctrl+C로 종료한다.

## Vercel 배포

2026-11-06 [공개 프로토타입](https://jobshot-web-prototype.vercel.app) 배포 완료. 익명 HTTP 200 응답과 배포된 PC·모바일 화면을 확인했다. 현재는 아래 CLI 수동 배포 방식이다.

CLI에서는 **이 web-prototype 폴더로 이동해서** 실행한다. 저장소 최상위 폴더를 배포하지 않는다.

```powershell
vercel whoami
vercel link --project jobshot-web-prototype --scope samuel426s-projects
vercel deploy --dry --json
vercel deploy --prod --scope samuel426s-projects
```

현재 프로젝트는 사용자 소유 `samuel426s-projects/jobshot-web-prototype`이다. CLI 인증은 Vercel이 관리하며 프로젝트 소스에 인증 값을 복사하지 않는다. 이 정적 화면에는 환경 변수가 필요 없다. CLI가 자동 생성하는 `.env.local`과 `.vercel/`은 Git 및 업로드에서 제외한다.

Git 연동을 나중에 설정할 경우:

| 항목 | 값 |
| --- | --- |
| 소유자 | 사용자의 Vercel 계정/개인 팀 |
| 저장소 | samuel426/jobshot-mcp |
| 웹 브랜치 | codex/vercel-prototype |
| Root Directory | web-prototype |
| Framework Preset | Other |
| Build/Install Command | 비움; vercel.json이 빈 명령을 지정 |
| Output Directory | public |
| 환경 변수 | 없음 |

CLI 수동 배포와 Git 자동 배포는 별개다. Git 연동·프로덕션 브랜치 설정을 확인하기 전에는 push만으로 사이트가 갱신된다고 안내하지 않는다. [Vercel 빌드/루트 안내](https://vercel.com/docs/builds/configure-a-build)를 따른다.

사이트 접속을 계정 소유자로 제한하려면 별도로 Vercel Deployment Protection을 설정해야 한다. 지금은 가상 화면이며 앱 로그인 기능은 없다. [Vercel Authentication](https://vercel.com/docs/deployment-protection/methods-to-protect-deployments/vercel-authentication)의 보호 범위와 요금제 조건을 확인한다.

## 검증

Windows Chrome의 320·390·768·1440 CSS 픽셀에서 페이지 가로 넘침, 월 이동·빈 달·오늘, 검색/빈 결과, 상세→서류, 이력서 전환, 업로드 미구현 안내, 설정의 Google 미연결 안내를 확인했다. 320px 공고 추가 버튼 줄바꿈을 수정했고 dialog Escape 닫기를 확인했다. 너비 모사이며 휴대전화 실기기 검증은 아니다.

화면용 CSP는 외부 연결을 차단한다. noindex는 검색 제외 요청일 뿐 접근 제어가 아니다. 실제 개인 자료를 넣는 서비스로 사용하지 않는다.
