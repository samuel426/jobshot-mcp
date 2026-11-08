# 배포 준비: 0.5 미리보기

기준일: 2026-11-08. [이슈 #6](https://github.com/samuel426/jobshot-mcp/issues/6)의 준비 기록이며 로컬 MCP 공개 릴리스 완료 안내가 아니다.

## 배포 대상과 방식

우선 검증 대상은 Windows·Node.js 24·Codex다. 현재는 GitHub 소스를 내려받아 `npm ci` 후 빌드하는 방식이다. 실행 파일 설치 프로그램과 npm 패키지 게시는 준비하지 않았다. 별도 [Vercel 화면 예시](../web-prototype/README.md)는 배포했으며 실제 MCP·개인 자료·인증을 호스팅하지 않는다.

사용자는 2026-11-05 Windows·Codex용 미리보기부터 준비하고 소스에 MIT 라이선스를 적용하기로 결정했다. macOS·Claude Code는 이번 미리보기의 지원 대상으로 안내하지 않는다. 정식 배포 또는 지원 확대 전에는 해당 환경의 확인을 먼저 마쳐야 한다.

| 환경/기능 | 확인 범위 | 남은 확인 |
| --- | --- | --- |
| Windows·Codex | 기존 실제 대화 입력·달력·서류·Google 흐름, 새 복제본의 격리 App Server 연결 | 다른 사용자 PC의 안내만 보고 설치·실제 대화 첫 사용 |
| Linux | GitHub Actions의 자동 검사 | 사용자 앱·데스크톱 실사용 |
| macOS | 지원 코드와 경로 예시만 있음 | 실기기 파일 입력·한글 경로·클라이언트 연결 |
| Claude Code | 연결 예시만 있음 | 실제 첨부 파일 접근·MCP 호출 |
| 모바일 달력 | Chrome에서 320/390px 너비 모사 | iPhone/Android 터치·가로 이동·링크 확인 |
| Google 선택 연결 | 개인 Desktop OAuth·Windows DPAPI 및 실제 계정 흐름 | 다른 사용자 개인 설정 재현성. 공용 OAuth 앱과 다른 OS 인증 저장소는 후속 범위 |

## 설치와 첫 사용 확인

Git과 Node.js 24가 있는 Windows 터미널에서 새 폴더로 진행한다. 이미 사용하는 작업 폴더를 지우거나 덮어쓰지 않는다.

```powershell
git clone https://github.com/samuel426/jobshot-mcp.git
cd jobshot-mcp
npm ci
npm run build
node dist/cli.js --help
npm run check:release
```

`check:release`는 매번 새 `tmp/release-smoke-*` 폴더에 가상 경험 자료와 공고 이미지를 만든다. MCP SDK stdio로 공고 저장·중복 방지·로컬 달력·이력서 평가·버전 보존·없는 파일 오류를 확인한다. 성공하면 `PASS`, 샘플 작업 폴더와 `result.json`이 남는다. 실패는 종료 코드 1이며 첫 오류를 해결한 뒤 다시 실행한다.

샘플의 마감일은 미정이며 날짜·링크를 만들어 넣지 않는다. 평가와 초안은 검사에 넣어 둔 가상 예시다. 실제 AI 작성 품질이나 앱 대화 연결을 검증했다는 의미가 아니다. Google에 접속하지 않으며 기존 개인 자료·인증·클라이언트 설정을 바꾸지 않는다.

실제 앱의 첫 사용은 [MCP 연결 안내](getting-started.md)와 [가상 자료 체험](first-use-preview.md)을 따른다. 코드 설치 경로와 `--workspace` 자료 경로를 구분한다. 공백·한글 경로는 각각 하나의 인수로 전달한다. [JobShot 사용 스킬](../skills/jobshot-coach/SKILL.md)과 AGENTS.md를 클라이언트가 읽도록 안내하고, 호스트의 스킬 자동 설치까지 검증한 것으로 간주하지 않는다.

### 업데이트와 복구

- 새 소스를 빌드한 뒤 MCP 클라이언트를 재시작한다. 기존 HTML은 `dashboard_build`로 재생성하고 브라우저를 새로고침해야 바뀐다.
- `node`를 찾지 못하면 Node 24 설치와 PATH를 확인한다. `dist/cli.js`가 없으면 빌드한다. 의존성을 생략한 설치는 이미지 처리가 실패할 수 있으므로 잠금 파일 기준 `npm ci`를 사용한다.
- 도구가 보이지 않으면 [설정 적용·서버 시작·도구 발견 진단](getting-started.md)을 따른다. 전체 사용자 설정을 덮어쓰지 않는다.
- Google 인증은 코드 폴더와 별개다. 같은 자료 작업 폴더와 `JOBSHOT_AUTH_HOME`을 유지한다. 다른 폴더로 자료를 이동하면 작업 폴더 해시가 달라지므로 인증 유지가 자동 보장되지 않는다.
- 연결 해제·재연결은 [Google 복구 안내](google-calendar.md)를 따른다. 개인 원본·공고 폴더나 인증 파일을 지워 설치 문제를 해결하지 않는다.

## 의존성과 라이선스

사용자 결정에 따라 JobShot 자체 소스는 [MIT 라이선스](../LICENSE)를 적용한다. LICENSE·package.json·잠금 파일의 표기를 일치시켰다. 의존성의 라이선스까지 MIT로 변경되는 것은 아니다.

[잠금 파일 선언 목록](dependency-licenses.md)은 직접·전이·개발·플랫폼별 선택 의존성을 모두 포함한다. 현재 108개 항목, 라이선스 선언 누락 0개다. `node scripts/dependency-inventory.mjs --check`로 최신성을 검사한다. 이 목록은 법적 의무 검토나 전체 저작권 고지 파일을 대체하지 않는다.

직접 런타임 의존성은 MCP server(Apache-2.0), sharp(Apache-2.0), zod(MIT)다. Windows용 `@img/sharp-win32-x64`는 Apache-2.0 AND LGPL-3.0-or-later로 선언하며, 설치된 README의 Licensing 표에는 libvips·glib·librsvg·pango 등의 네이티브 라이브러리와 추가 라이선스가 있다. JS 패키지 선언만으로 이 구성요소를 빠뜨리지 않는다. [sharp Windows 패키지의 공식 라이선스 안내](https://www.npmjs.com/package/@img/sharp-win32-x64)과 설치된 패키지의 LICENSE·README를 함께 확인한다.

소스 배포 준비와 바이너리 묶음 배포 검토를 구분한다. `node_modules`·네이티브 DLL·Node 실행 파일을 묶는다면 포함 파일·버전·저작권/라이선스 고지와 해당 라이선스의 소스 제공 등 의무를 별도로 점검해야 한다. 이번에는 묶음 파일을 만들지 않았다.

2026-11-05 새 설치에서 `npm audit --omit=dev`는 알려진 런타임 취약점 0개를 보고했다. 이 시점의 레지스트리 조회 결과이며 보안 보증이나 개발 의존성 전체 감사는 아니다.

2026-11-08 소스 설치형 의존성 고지 정리를 [제3자 의존성 안내](third-party-notices.md)에 완료했다. MCP SDK의 실제 LICENSE에는 패키지 선언 외에 MIT 전환 고지와 문서 CC-BY-4.0 조건이 있다. 네이티브 라이브러리 29개의 상위 고지·버전도 기록했다. 실행 파일 묶음의 조건 검토는 배포 형태를 바꿀 때 진행한다.

## 첫 미리보기의 Google 제공 방식

2026-11-08 사용자 결정으로 **로컬 달력이 기본, Google은 각자 OAuth 설정으로 선택 연결**한다. 로컬 기능 설치에 OAuth JSON은 필요 없고, 사용자가 선택한 공고만 로컬 등록한다. 이 결정은 기존 인증·전용 캘린더와 Google 실패 시 로컬 대체 동작을 바꾸지 않는다. [연결 안내](google-calendar.md)의 개인 프로젝트 절차를 선택 제공한다.

2026-11-08 공식 문서를 재확인했다. 현재 구현은 Desktop app OAuth와 `calendar.app.created` 권한으로 전용 보조 캘린더를 사용한다. [Calendar 권한 설명](https://developers.google.com/workspace/calendar/api/auth), [Desktop OAuth 안내](https://developers.google.com/identity/protocols/oauth2/native-app)를 따른다. CalDAV API 활성화만으로 이 구현의 Calendar API 설정을 대체하지 않는다.

External/Testing을 사용한다면 연결 계정을 테스트 사용자에 등록하며, 이 캘린더 권한으로 발급된 refresh token은 7일 만료 조건의 대상이다. Production 전환을 무기한 토큰 보장으로 안내하지 않는다. 사용자 철회 등 다른 만료 사유도 있다. [동의 화면·테스트 사용자](https://developers.google.com/workspace/guides/configure-oauth-consent), [토큰 만료 조건](https://developers.google.com/identity/protocols/oauth2/#expiration)을 따른다.

공용 OAuth 앱은 첫 미리보기에서 제공하지 않는다. 향후 공용 앱으로 확대할 때 개발/운영 프로젝트 분리, 브랜드·연락처·홈페이지·개인정보 안내, 실제 요청 권한과 콘솔의 검증 상태를 확인한다. 해당 공개 승인을 받은 것으로 표시하지 않으며 [공개 준비 정책](https://developers.google.com/identity/protocols/oauth2/production-readiness/policy-compliance)을 다시 대조한다.

현재 사용자의 OAuth JSON·인증 파일을 배포물에 포함하지 않는다. 각자 설정하는 개발용 연결과 공용 앱의 공개 승인을 구분한다. Google 연결 없이도 로컬 달력·서류 흐름을 사용할 수 있다. 이번 작업에서 Cloud 설정·권한·기존 연결을 변경하지 않았다.

## 공개 전 남은 항목

- [x] 사용자와 Windows·Codex 미리보기·MIT 소스 라이선스 확정
- [ ] 별도 Windows 사용자 PC에서 문서만 보고 설치·MCP 실제 대화·첫 공고·달력·서류 평가 확인
- [ ] 배포 범위에 포함할 경우 Claude Code·macOS 실사용 확인
- [ ] 휴대전화 실기기의 달력 터치·가로 이동 확인
- [x] 현재 소스 설치 방식의 의존성 고지·출처 정리 (바이너리 묶음 배포 제외)
- [x] 첫 미리보기의 Google 제공 방식 확정: 로컬 기본·개인 OAuth 선택 연결 및 제한 안내
- [ ] 동의한 친구의 수동 피드백 수집·발견 문제 수정·재확인
- [ ] 검증된 커밋에 태그·릴리스 노트와 지원 한계를 연결한 뒤 공개

설치 검증은 [2026-11-05 기록](work-log/2026-11-05.md), 의존성 고지는 [2026-11-08 기록](work-log/2026-11-08.md)을 따른다. 미완료 항목은 #6에서 계속 추적한다.

공용 Google OAuth 앱 운영·검증과 Windows 외 인증 저장소 구현은 지원 확대 때 별도 진행한다. 이번 개인 OAuth 선택 방식 결정으로 완료된 것은 미리보기의 제공 방식과 안내이며, 다른 사용자의 실제 연결 검증이나 Google의 공용 앱 승인이 아니다.
