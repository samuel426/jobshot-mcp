# Google 캘린더 연결과 선택 전송

4단계 개발 버전이다. Windows용 계정 연결 CLI, 로컬 전송 미리보기와 단방향 수동 등록·갱신을 구현했다.
2026-10-31 Windows 실제 계정 동의·전용 캘린더 생성과 가상 이벤트의 등록·중복 방지·갱신·충돌 처리를 확인했다.
실제 권한 철회와 공개 배포 검증은 남아 있다. 검증 경로는 [실사용 기록](client-validation.md)을 따른다.
기존 로컬 달력 등록이나 공고 분석만으로 Google에 전송하지 않는다.

## 첫 버전의 선택

사용자 기획 결정에 따라 JobShot 전용 보조 캘린더를 사용한다. 기존 캘린더 목록을 읽어 선택하는 기능은 없다.
요청하는 권한은 `https://www.googleapis.com/auth/calendar.app.created` 하나다.
이 권한으로 보조 캘린더를 만들고 앱이 만든 캘린더의 이벤트를 다룬다.
Google의 [권한 목록](https://developers.google.com/workspace/calendar/api/auth)과 [보조 캘린더 생성 API](https://developers.google.com/workspace/calendar/api/v3/reference/calendars/insert)를 기준으로 정했다.

Google에 보내는 사용자 내용은 회사·직무·확인된 마감 날짜·원문 링크다.
중복·소유 확인을 위해 공고 기반 이벤트 ID·비공개 공고 ID 표식과 무작위 연결 ID도 사용한다.
개인 자료·지원서류·평가·로컬 경로는 전송하지 않는다. 참석자 추가·자동 초대·자동 삭제·백그라운드 전송은 없다.
날짜만 있는 마감은 종일 이벤트로 표시하고 설명에 마감 시각 미확인을 명시한다. 23:59 같은 시각을 만들지 않는다.
날짜 미정·상시 채용은 Google 전송을 중단하고 로컬 목록에서 관리한다.

## 1. 사용자 OAuth 설정 준비

현재는 각 사용자가 본인 Google Cloud 프로젝트의 Desktop OAuth 클라이언트를 준비하는 개발용 흐름이다.
공용 개발자 서버나 공용 OAuth 자격 증명을 배포하지 않는다.

1. [Google Cloud Console](https://console.cloud.google.com/)에서 사용할 프로젝트를 만들거나 선택하고 **Google Calendar API** (`calendar-json.googleapis.com`)를 활성화한다. 이 구현은 Calendar REST API를 사용하므로 CalDAV API 활성화만으로 준비가 끝나지 않는다.
2. Google Auth Platform의 OAuth 동의 화면에 앱 정보를 설정한다. External/Testing을 사용한다면 실제 연결할 Google 계정을 테스트 사용자에 넣는다.
3. 위 `calendar.app.created` 권한을 확인한다. 전체 캘린더 권한이나 Google Drive 권한을 추가하지 않는다.
4. OAuth 클라이언트 유형을 **Desktop app**으로 만들어 JSON을 내려받는다. 서비스 계정 또는 Web application JSON은 받지 않는다.
5. JSON은 프로젝트·OneDrive 밖의 사용자 전용 폴더에 보관한다. 예: `C:\JobShotAuth\client_secret_jobshot.json`. 파일 내용이나 토큰을 대화·이슈·PR에 붙여넣지 않는다.

자세한 준비 절차는 [OAuth 동의 화면 안내](https://developers.google.com/workspace/guides/configure-oauth-consent)와 [Desktop 앱 인증 안내](https://developers.google.com/identity/protocols/oauth2/native-app)를 따른다.
External/Testing 프로젝트의 이 권한에는 7일 갱신 토큰 만료 조건이 적용될 수 있다. 만료·철회 시 다시 연결한다.
테스트 성공을 공개 배포 심사 완료로 표현하지 않는다. 배포 시 동의 화면·권한 심사와 사용자 제한을 별도로 확인한다.
[Google 토큰 만료 설명](https://developers.google.com/identity/protocols/oauth2#expiration)

## 2. Windows에서 계정 연결

프로젝트를 빌드한 터미널에서 실행한다. 아래 경로는 예시이며 실제 작업 폴더와 사용자가 저장한 JSON 경로로 바꾼다.

```powershell
npm run build
node dist/google-cli.js --workspace "C:\JobShot" --connect "C:\JobShotAuth\client_secret_jobshot.json"
```

출력된 Google 인증 주소를 시스템 브라우저에서 열어 계정을 선택하고 동의한다. 대기 시간은 10분이며 결과가 나올 때까지 터미널을 열어 둔다.
프로그램은 무작위 포트의 `127.0.0.1`에서 이번 인증 응답만 받고 종료한다. PKCE S256·무작위 state를 검사한다.
내장 웹뷰나 인증 코드 복사·붙여넣기 방식은 사용하지 않는다.
터미널의 `connected:true`가 나와야 연결 완료다. 브라우저의 응답 수신 화면만으로 성공했다고 판단하지 않는다.

시간이 지나 `GOOGLE_AUTH_TIMEOUT`이 나오거나 브라우저에서 `127.0.0.1` 연결 거부가 나타나면,
이전 인증 탭을 닫고 같은 `--connect` 명령을 다시 실행해 **새로 출력된 주소**에서 진행한다.
기존 주소 새로고침이나 인증 코드 복사로 복구하지 않는다. 만료된 시도의 기존 연결 정보는 변경하지 않는다.
사용자가 동의를 취소한 경우에는 `GOOGLE_AUTH_CANCELLED`로 구분한다.

첫 연결은 **JobShot 지원 일정** 캘린더 하나를 만든다. 계정 연결만으로 공고 이벤트를 만들지는 않는다.
재연결은 기존 OAuth 클라이언트와 저장된 캘린더 ID를 사용하고 해당 계정의 접근을 확인한 후 인증 정보를 교체한다.
다른 OAuth 클라이언트로의 변경이나 다른 캘린더로 자동 복제는 지원하지 않는다.

```powershell
node dist/google-cli.js --workspace "C:\JobShot" --status
```

status는 로컬 연결 정보다. 실제 Google 권한 유효성은 요청할 때 확인한다.
갱신 실패나 권한 거부가 발생하면 같은 `--connect` 명령으로 브라우저 동의를 다시 진행한다.

## 3. 선택한 공고 전송

```text
이 공고의 전송 내용을 보여주고 JobShot Google 캘린더에 등록해줘.
```

1. `calendar_preview`에 공고 ID를 전달한다. 네트워크 요청 없이 제목·설명·종일 날짜·이벤트 ID·공고 해시를 반환한다.
2. 사용자의 Google 전송 요청이 있으면 `calendar_sync`에 `{id, posting_sha256}`을 전달한다. 명확한 전송 요청을 다시 묻지 않는다.
3. `synced`, `local_record_updated`, `conflict`, `error`를 확인하고 실제 결과를 안내한다.

로컬 달력에 등록하지 않은 imported/analyzed 공고도 Google 전송을 별도로 요청할 수 있다.
Google 전송 성공은 로컬 달력 등록 상태를 바꾸지 않는다. 2026-11-01 사용자 결정으로 연결·전송 실패 또는 충돌 시 해당 공고를 로컬 웹 달력에 자동 등록한다. 저장된 공고의 회사·직무·날짜·링크를 반영하며 이 도구 자체가 공고 메타데이터를 편집하지는 않는다.
현재 별도의 공고 날짜 편집 MCP 도구는 없으며, 테스트는 가상 기록의 변경으로 갱신 동작을 확인한다.

## Google 실패 시 로컬 웹 달력

`calendar_sync`는 Google 미연결·권한·네트워크 실패 또는 원격 충돌 시 같은 공고를 `tracked`로 등록하고 `dashboard/index.html`을 만든다. 별도 서버·Google 연결 없이 브라우저에서 열 수 있다. 재시도해도 같은 공고가 중복 등록되지 않으며 등록 해제 시 이전 imported/analyzed 상태로 돌아간다.

| 응답 | 안내 |
| --- | --- |
| synced:false + local_calendar.tracked:true + dashboard_updated:true | Google 미완료/확인 필요, 로컬 등록·화면 생성 완료. 로컬 path를 열어 관리 |
| synced:false + local_calendar.tracked:true + dashboard_updated:false | 상태만 저장됨. dashboard_build로 HTML을 다시 생성 |
| local_calendar.error | 로컬 대체 등록도 실패. 오류 확인 후 재시도 |
| local_calendar.attempted:false | 로컬 기록 저장을 확인하지 못해 추가 변경 중단 |

`remote_result:unconfirmed`는 Google에 실제로 저장됐는지 확인이 필요한 상태다. 로컬 등록 성공으로 Google 실패/성공 여부를 단정하지 않는다. 충돌의 원격 내용·etag와 원래 Google 오류는 그대로 반환한다. 자동 대체 등록 뒤 `posting_sha256`은 최신 로컬 기록을 가리키며 Google 재시도 전 미리보기를 다시 읽는다.

잘못된 입력·오래된 미리보기·파일 검증 오류는 대체 등록하지 않는다. Google 결과 저장 실패나 등록 직전 해시 불일치도 자동 등록을 중단한다. 날짜 미정·상시는 Google 미리보기 단계에서 중단하므로 원하면 `posting_track`으로 로컬 목록에 등록한다. 개인 자료·지원서류·원본 이미지는 수정하지 않는다.

## 중복과 충돌

- 같은 공고는 고정 이벤트 ID를 먼저 조회한다. 이미 같은 내용이면 새 이벤트나 갱신 요청을 만들지 않는다.
- Google 응답을 놓쳤더라도 재시도 시 같은 ID를 조회해 중복 생성을 피한다. 409 응답도 기존 이벤트의 소유 표식과 내용을 확인한다.
- Google에서 내용을 수정한 경우 이전 내용·현재 Google 내용·보낼 내용을 반환하고 쓰기를 멈춘다.
- 사용자가 로컬 내용으로 덮어쓰기를 요청한 경우에만 응답의 최신 `event_etag`를 `resolve_conflict_etag`로, 최신 `posting_sha256`과 함께 전달한다.
- 갱신 요청에 `If-Match`를 넣는다. 확인 후 다시 바뀌면 412로 중단하고 차이를 다시 확인한다.
- Google에서 삭제한 일정, 참석자·반복이 추가된 일정, 소유 표식이 다른 이벤트는 자동 복구·갱신하지 않는다.

API의 [조건부 갱신](https://developers.google.com/workspace/calendar/api/guides/version-resources)과 [이벤트 ID·종일 종료 날짜 규칙](https://developers.google.com/workspace/calendar/api/v3/reference/events/insert)을 따른다.
PATCH는 제목·설명·날짜만 바꾸고 무관한 속성을 보내지 않는다. 참석자를 추가하지 않으며 신규 이벤트의 기본 알림은 사용하지 않는다.

## 실패와 복구

| 결과 | 의미와 다음 행동 |
| --- | --- |
| STALE_POSTING | 공고가 바뀜. 미리보기를 다시 읽고 내용 확인 |
| GOOGLE_NOT_CONNECTED / GOOGLE_AUTH | 연결·권한·토큰 만료 확인 후 연결 CLI 실행 |
| GOOGLE_AUTH_TIMEOUT | 인증 대기 시간 초과. 이전 탭을 닫고 같은 --connect 명령의 새 주소로 다시 진행 |
| GOOGLE_AUTH_CANCELLED | 인증 취소 또는 인증 주소 표시 실패. 연결하려면 --connect 명령을 다시 실행 |
| DEADLINE_REQUIRED | 날짜 미정/상시. 날짜를 추측하지 않고 로컬에서 관리 |
| conflict:true | Google 변경 내용을 보여주고 덮어쓰기 의사 확인 |
| synced:false | 전송 실패 또는 결과 불명확. 가능하면 calendar.status에 sync_failed를 기록하고 로컬 내용 보존 |
| synced:true, local_record_updated:false | Google 저장은 확인됐으나 로컬 기록 저장 실패. 미리보기와 같은 ID 동기화로 복구 |
| GOOGLE_TARGET_CHANGED | 기존 동기화 대상과 현재 연결이 다름. 자동 복제 중단 |
| GOOGLE_SETUP_UNKNOWN | 캘린더 생성 응답이 불명확. 아래 연결 복구 절차 사용 |

Google 연결이 없거나 로컬 입력 검증에서 실패하면 외부 전송을 시도하지 않는다.
네트워크 요청 중에는 로컬 저장 잠금을 유지한다. 다른 프로그램이 직접 공고 파일을 바꾸면 기존 파일을 덮어쓰지 않고 다시 확인하도록 알린다.
원격 쓰기와 로컬 JSON은 하나의 트랜잭션이 아니며, 쓰기 후 응답 유실·디스크 실패를 별도로 표시한다.

캘린더 생성 응답이 불명확할 때는 자동으로 또 만들지 않는다. Google 캘린더 설정에서 생성된 JobShot 캘린더의 ID를 확인한 후 실행한다.

```powershell
node dist/google-cli.js --workspace "C:\JobShot" --recover-calendar "확인한 캘린더 ID"
```

저장된 무작위 연결 표식이 맞는 캘린더만 복구한다. 생성된 캘린더를 찾지 못하면 확인 없이 연결 파일을 지우거나 재생성하지 않는다.

로컬 인증 파일 자체가 없지만 기존 JobShot 캘린더가 남아 있다면, 일반 `--connect`는 새 캘린더를 만들 수 있다. Google 캘린더 설정에서 기존 전용 캘린더 ID를 확인하고 새 브라우저 동의로 재연결한다.

```powershell
node dist/google-cli.js --workspace "C:\JobShot" --connect-existing "C:\JobShotAuth\client_secret_jobshot.json" "확인한 기존 JobShot 캘린더 ID"
```

이 명령은 지정한 보조 캘린더를 조회하고 ID·JobShot 표식을 확인한 뒤에만 인증을 저장한다. 캘린더나 이벤트를 생성·수정하지 않는다. 기존 연결 파일이 있으면 덮어쓰지 않고 기존 복구 명령을 안내한다. 파일이 없으므로 원래 작업 폴더의 연결 표식을 대조할 수는 없다. 사용자가 지정한 캘린더 ID와 앱 전용 권한·원격 표식을 확인하는 복구이며 일반 개인 캘린더 선택 기능은 아니다.

## 인증 보관과 해제

인증 정보는 기본적으로 `%LOCALAPPDATA%\JobShot\google-auth\<작업폴더 해시>\connection.bin`에 Windows 현재 사용자 DPAPI로 보호해 저장한다.
실행 환경이 `LOCALAPPDATA`를 임시 폴더로 바꾼다면 CLI와 MCP 양쪽에 같은 `JOBSHOT_AUTH_HOME` 절대 경로를 지정한다. 값은 작업폴더 해시의 상위 폴더이며 비밀 값이 아니다. 기존 파일을 자동 검색·이동하지 않으며 상대 경로·링크·정션 저장소는 거부한다.

```powershell
$env:JOBSHOT_AUTH_HOME = 'C:\Users\사용자\AppData\Local\JobShot\google-auth'
node dist/google-cli.js --workspace "C:\JobShot" --status
```

Codex 프로젝트 설정 예시(실제 Windows 사용자 경로로 변경):

```toml
[mcp_servers.jobshot.env]
JOBSHOT_AUTH_HOME = "C:/Users/사용자/AppData/Local/JobShot/google-auth"
```

설정을 바꾼 뒤 MCP 서버를 재시작한다. 서버별 `env`와 재시작은 [공식 MCP 설정 안내](https://learn.chatgpt.com/docs/extend/mcp)를 따른다. 재시작 후 같은 저장소가 선택되는지 확인하며 `--status`만으로 실제 Google 접근 성공을 단정하지 않는다.

OAuth 클라이언트 정보·access/refresh token을 평문 JSON으로 프로젝트에 쓰지 않는다. 별도 인증 저장소로 OneDrive 작업 폴더와 분리한다.
DPAPI는 같은 Windows 사용자로 실행되는 다른 프로그램까지 차단하는 장치가 아니다. Windows 사용자·기기·작업 폴더를 옮긴 경우 재연결이 필요할 수 있다.
macOS/Linux의 인증 저장소는 아직 구현하지 않았다. 해당 환경의 테스트 통과는 실계정 지원을 뜻하지 않는다.

```powershell
node dist/google-cli.js --workspace "C:\JobShot" --disconnect
```

먼저 로컬 토큰을 사용 불가로 만들고 Google 권한 철회를 요청한다. 철회 요청 실패 시 Google 계정의 타사 연결 설정에서 수동 해제한다.
기존 캘린더·이벤트·공고는 삭제하지 않는다. 재연결용 캘린더 ID와 연결 표식은 보호된 파일에 유지한다.

## 검증 범위

자동 검증은 가상 Google 응답 기반 연결·등록·갱신·충돌·실패·복구, Windows DPAPI와 로컬 루프백 콜백,
공식 MCP stdio 및 격리 Codex App Server의 미리보기를 포함한다.
2026-10-31 실제 계정에서 가상 일정 1개의 생성·API 재조회·중복 없는 재전송·날짜 변경·외부 수정 충돌·명시적 충돌 해결을 확인했다.
사용자 승인으로 테스트 일정만 삭제했고 삭제된 일정의 자동 재생성 방지도 확인했다. 제품의 자동 삭제 기능을 추가한 것은 아니다.
정리에는 Google의 [이벤트 삭제 API](https://developers.google.com/workspace/calendar/api/v3/reference/events/delete)를 사용했다.

2026-10-31 대화의 가상 자료용 MCP에서 미리보기 성공·날짜 미정 거부·미연결 오류를 직접 확인했다.
당시 MCP 작업 폴더와 실제 계정을 연결한 작업 폴더는 달랐다. 2026-11-01 프로젝트 MCP 설정을 실사용 폴더로 전환하고 stdio 도구 발견과 기존 Google 캘린더 읽기 접근을 확인했다. 당시 현재 대화의 반영 확인은 재연결 후로 남겼다. 이를 현재 대화의 `calendar_sync` 성공으로 기록하지 않으며,
실사용 MCP는 연결 CLI의 `--workspace`와 같은 작업 폴더를 가리켜야 한다. 인증 파일을 다른 작업 폴더로 복사하지 않는다.
실제 Google 화면의 이벤트 렌더링·권한 철회·공개 배포 심사 및 Windows 외 인증 저장소는 미검증이다.

2026-11-03 현재 대화에서 실사용 MCP 계약과 Google 미연결 시 가상 공고의 로컬 대체 등록·중복 방지를 확인했다. 이후 사용자가 새 동의로 기존 전용 캘린더 연결을 복구했고 생성 없이 GET 접근에 성공했다. 저장 경로를 고정했으며 현재 대화 MCP의 해당 설정 적용을 위한 서버 재시작은 남아 있다. [당일 작업 기록](work-log/2026-11-03.md)을 따른다.
