# 현재 버전 시작하기

1단계: 로컬 파일 조회와 공고 원본·분할본 저장. AI 분석·일정·서류 자동화는 후속 단계다.

## 설치

Node.js 24와 Git이 필요하다. 저장소 폴더에서 다음을 실행한다.

```sh
npm ci
npm run build
node dist/cli.js --help
```

MCP 클라이언트는 `node`로 `dist/cli.js`를 실행하고 `--workspace`에 기존 작업 폴더의 절대 경로를 넘긴다.
서버는 `개인 자료/`, `공고/`, `inbox/`, `.jobshot/`가 없으면 만든다. 개발자 서버나 AI API 키는 필요 없다.
MCP 연결 명령에는 `npm start`를 쓰지 않는다. npm의 안내 출력이 stdio 프로토콜을 방해할 수 있으므로 `node`를 직접 사용한다.

## Codex 연결 예시

아래 `C:/work/jobshot-mcp`를 실제 clone 경로로 바꾼다. 공백·한글이 있어도 각 인수를 따로 따옴표로 감싼다.
기존 Codex 설정을 덮어쓰지 말고 서버 항목만 추가한다. 프로젝트 설정은 신뢰된 프로젝트에서 사용한다.

```toml
[mcp_servers.jobshot]
command = "node"
args = ["C:/work/jobshot-mcp/dist/cli.js", "--workspace", "C:/work/jobshot-mcp"]
```

CLI를 사용하는 경우 다음과 같이 추가할 수도 있다.

```sh
codex mcp add jobshot -- node "C:/work/jobshot-mcp/dist/cli.js" --workspace "C:/work/jobshot-mcp"
codex mcp list
```

설정 위치와 클라이언트 재연결은 [공식 OpenAI MCP 문서](https://learn.chatgpt.com/docs/extend/mcp?surface=cli)를 따른다.
현재 개발 작업은 사용자 전역 설정에 자동 등록하지 않는다.

### 설정했는데 JobShot 도구가 보이지 않을 때

앱 재시작 전에 **설정 적용 → 서버 시작 → 도구 발견 → 실제 호출** 중 어느 단계에서 막혔는지 확인한다.
`jobshot` 대신 다른 서버 이름으로 등록했다면 아래 명령에도 같은 이름을 사용한다.

1. 프로젝트 폴더에서 `codex --version`과 `codex mcp get jobshot --json`을 확인한다. Windows에서는 `Get-Command codex -All`로 실행 파일 위치도 확인한다. PATH의 별도 CLI와 데스크톱 앱에 포함된 CLI는 버전이 다를 수 있으므로 CLI 결과만으로 앱 상태를 단정하지 않는다.
2. 서버를 찾을 수 없다면 설정 위치·서버 이름·현재 프로젝트 경로를 확인한다. 프로젝트 `.codex/config.toml`은 해당 프로젝트가 신뢰된 경우에만 적용된다. 재시작만으로 신뢰 설정이 바뀌지는 않는다.
3. 신뢰 설정 때문에 제외됐다고 확인되면 프로젝트의 `.codex/` 설정·훅·실행 규칙을 먼저 검토한다. 사용자가 해당 폴더를 신뢰하기로 선택한 경우에만 등록한다. 상위 홈 폴더 전체를 신뢰하도록 바꾸거나 설정을 전역으로 옮겨 해결하지 않는다.
4. 서버 설정이 적용됐지만 시작하지 못한다면 `command`의 Node 실행 파일, `args`의 `dist/cli.js`, `--workspace`의 기존 폴더가 실제 존재하는지 확인한다. 빌드가 없으면 `npm run build`를 실행한다. 공백·한글 경로는 각각 하나의 인수로 전달한다.
5. 설정이 적용된 뒤 클라이언트를 재연결하고 `profile_list`, `profile_read`, `posting_import` 세 도구가 노출되는지 확인한다. 개인 자료 없는 테스트 작업 폴더에서 `profile_list`를 먼저 호출하고, [실사용 체크](client-validation.md)에 따라 가상 공고 저장·재입력을 확인한다.

고급 진단에서는 해당 Codex 버전이 제공하는 App Server의 `config/read`에 `cwd`와 `includeLayers: true`를 전달해 프로젝트 계층의 `disabledReason`을 확인할 수 있다. 이 조회는 설정 변경이나 모델 작업을 필요로 하지 않는다. 전체 설정·로그에는 개인 경로나 인증 정보가 있을 수 있으므로 공개 이슈에는 제외 사유만 요약한다.

기준: [OpenAI 설정 계층과 프로젝트 신뢰 안내](https://learn.chatgpt.com/docs/config-file/config-basic?surface=cli), [App Server 문서](https://learn.chatgpt.com/docs/app-server).
서버 등록 조회 성공, SDK 테스트 성공, 앱 대화에서 직접 호출 성공은 각각 별도로 기록한다.

## Claude Code 연결 예시

저장소에서 실행한다. `local` 범위는 해당 프로젝트의 개인 설정이다.

```sh
claude mcp add --transport stdio --scope local jobshot -- node "C:/work/jobshot-mcp/dist/cli.js" --workspace "C:/work/jobshot-mcp"
claude mcp list
```

자세한 옵션은 [Claude Code 공식 MCP 문서](https://code.claude.com/docs/en/mcp)를 따른다.
macOS에서는 두 경로를 `/Users/you/work/jobshot-mcp/...` 형태의 실제 절대 경로로 바꾼다.
macOS 실사용과 클라이언트 UI의 첨부 전달은 아직 확인하지 않았다.

## 개인 자료

`개인 자료/`에 사용자가 파일을 직접 넣는다. 현재는 UTF-8 `.txt`, `.md`, `.json`(파일당 1 MiB 이하)만 본문 읽기를 지원한다.
PDF·DOCX도 목록에는 보이지만 읽기 미지원으로 표시한다. 원본을 바꾸지 않고 텍스트 사본을 추가하면 된다.

예시 요청:

> JobShot으로 개인 자료 목록을 확인하고, 내가 선택한 `경험.md`만 읽어줘.

도구 입력:

```json
{ "path": "경험.md" }
```

`profile_read`는 내용·원본 해시·수정/조회 시각을 반환한다. 매번 디스크의 최신 파일을 읽고 원본에는 쓰지 않는다.
본문은 연결한 AI 클라이언트에 전달되므로 사용할 자료를 선택해서 요청한다.

## 공고 이미지 한 장 저장

1. Windows에서 캡처한 이미지를 파일로 저장해 `inbox/공고.png`에 놓는다.
2. AI 클라이언트가 첨부 파일의 실제 경로를 제공한다면 그 파일을 `inbox/`로 복사하도록 요청할 수 있다.
3. 채팅에서 이미지를 볼 수 있다는 이유만으로 MCP가 파일 경로도 받았다고 가정하지 않는다. 접근할 수 없으면 1번 방식으로 저장한다.
4. 기업·직무·확인한 마감일을 전달하고 `posting_import`를 호출한다.

```json
{
  "image_path": "공고.png",
  "company": "가상기업",
  "role": "백엔드 개발",
  "deadline": { "kind": "date", "date": "2026-11-01" },
  "source_url": "https://example.com/jobs/demo"
}
```

`image_path`는 `inbox/` 기준 상대 경로다. `inbox/` 접두사를 다시 붙이지 않는다.
MCP 도구는 외부 절대 경로, URL 다운로드, OS 클립보드 직접 접근을 제공하지 않는다.
Windows에서는 아래의 별도 캡처 CLI로 `inbox/` 파일을 준비할 수 있다.
날짜를 모르면 `{"kind":"unknown"}`, 상시 채용은 `{"kind":"rolling"}`을 사용한다.
링크를 모르면 `source_url`을 생략하거나 null로 둔다. 이미지에서 URL을 추측하지 않는다.

결과:

```text
공고/2026-11-01_가상기업_백엔드 개발/
  공고정보.json
  사진/
    original-001.png
    crop-001.png                  긴 이미지일 때만 생성
    crop-002.png
    manifest.json
```

원본 바이트를 보존하고 이미지의 해시·크기·형식을 기록한다.
PNG·JPEG·WebP 정지 이미지 한 장, 최대 20 MiB·4천만 픽셀을 지원한다.
EXIF 회전·반전을 적용한 표시 높이가 2,000px를 넘으면 최대 1,600px 높이의 PNG 조각을 160px씩 겹쳐 만든다.
폭과 픽셀 크기는 유지하며 분할본만 올바른 방향으로 저장한다. 문단 경계를 해석하는 분할은 아니다.
`manifest.json`과 도구 응답의 `manifest.crops`에서 순서·좌표·원본 연결·해시를 확인할 수 있다.
좌표는 방향을 바로잡은 이미지의 왼쪽 위를 기준으로 한다. 짧은 이미지는 `crops: []`다.
AI가 이미지를 볼 수 있는 도구를 제공한다면 `folder/사진/` 뒤에 각 `crops[].path`를 붙여 순서대로 읽도록 요청한다.
분할본은 최대 64장, 장당 20 MiB, 합계 100 MiB이며 초과하면 새 공고 전체를 저장하지 않는다.
기업·직무·마감·링크·이미지가 동일하면 `duplicate: true`로 기존 결과를 반환한다.
원본·분할본의 변경이나 누락이 발견되면 덮어쓰지 않고 오류를 반환한다.
이전 원본 전용 버전에서 보관한 공고는 `split_status: legacy_unsplit`로 반환한다. 기존 공고에 분할본을 추가하는 기능은 아직 없다.
이를 우회하려고 원본을 삭제하거나 기업·직무를 바꾸지 않는다. 필요하면 원본을 그대로 읽는다.
다른 이미지나 메타데이터가 같은 폴더명으로 충돌하면 공고 ID 일부를 붙여 구분한다.
기존 공고의 날짜 수정이나 여러 이미지 병합은 아직 지원하지 않는다.

상태는 `imported`다. 이는 **보관 완료**만 뜻한다. 공고 해석·적합도 평가·달력 등록을 마쳤다는 의미가 아니다.
마감 시각은 `null`, Google 캘린더와 평가 값도 `null`로 남긴다.

## Windows 캡처를 inbox에 저장

빌드 후 Windows 터미널에서 사용할 수 있는 별도 명령이다. MCP 연결 설정에 이 명령을 넣지 않는다.

1. `Win+Shift+S`로 원하는 공고 영역을 캡처한다.
2. 현재 클립보드의 이미지를 저장하려면 다음 명령을 실행한다. 경로는 실제 작업 폴더의 절대 경로로 바꾼다.

```powershell
node dist/capture-cli.js --workspace "C:/work/jobshot-mcp"
```

3. 성공 시 출력된 JSON의 `image_path`를 `posting_import`에 전달한다.

```text
JobShot으로 inbox에 저장된 capture-…png를 보관해줘.
기업은 가상기업, 직무는 백엔드 개발이야. 마감일과 링크는 확인하지 못했어.
```

명령은 현재 이미지를 한 번만 읽어 PNG로 저장한다. 클립보드 내용을 지우거나 바꾸지 않으며 감시·자동 실행도 하지 않는다.
해시가 같은 캡처는 재사용하고 같은 이름의 다른 파일은 덮어쓰지 않는다. 저장만으로 공고 분석이나 일정 등록을 하지는 않는다.
클립보드는 원래 파일의 인코딩을 보존하지 않으므로, 파일 바이트·EXIF 보존이 필요하면 원본 파일을 직접 `inbox/`에 복사한다.
지원되지 않는 형식, 권한·클립보드 사용 중 오류가 나면 이미지를 파일로 저장하는 방식으로 진행한다.
2026-10-17 실사용에서는 에이전트 샌드박스의 접근이 실패하고 일반 Windows 실행 환경에서 성공했다.
이 경우 사용자가 연 Windows 터미널에서 캡처 명령을 실행하거나 파일 입력을 사용한다. 프로그램이 자동으로 권한을 높이지 않는다.
macOS/Linux에서는 파일 입력을 사용한다. 이 명령은 AI 대화창 첨부를 자동 연결하는 기능이 아니다.

## 오류와 복구

| 코드 | 다음 행동 |
| --- | --- |
| FILE_NOT_FOUND | `inbox/` 또는 `개인 자료/` 안의 실제 파일명과 상대 경로 확인 |
| INVALID_PATH / LINK_NOT_ALLOWED | 상위 경로·절대 경로·정션 대신 실제 파일을 허용 폴더에 저장 |
| UNSUPPORTED_FORMAT / INVALID_ENCODING | 원본을 보존하고 지원 형식의 사본 추가 |
| FILE_TOO_LARGE / INVALID_IMAGE | 파일 크기·해상도·손상 확인, 필요한 경우 사용자가 별도 사본 준비 |
| INVALID_INPUT | 실제 날짜와 기업·직무·http(s) 링크 확인 |
| IMPORT_BUSY | 다른 저장 작업 완료 후 같은 요청을 다시 실행 |
| INVALID_RECORD / RECORD_CHANGED | 기존 공고를 덮어쓰지 말고 해당 기록과 원본의 변경 여부 확인 |
| PATH_TOO_LONG | 더 짧은 작업 폴더 경로나 기업·직무명 사용 |
| SPLIT_LIMIT | 원본을 유지하고 더 짧거나 작은 별도 이미지 사본 준비 |
| CLIPBOARD_EMPTY | Win+Shift+S로 이미지 캡처 후 다시 실행 |
| CLIPBOARD_UNAVAILABLE | 잠시 후 재실행하거나 파일을 직접 inbox에 저장 |
| UNSUPPORTED_PLATFORM | Windows 외 OS에서는 파일 입력 사용 |

정상 종료 시 잠금은 해제된다. 강제 종료 후 `IMPORT_BUSY`가 계속된다면 모든 JobShot 프로세스를 종료했는지 먼저 확인한다.
그 후 **비어 있는** `.jobshot/import.lock` 디렉터리만 제거한다. PowerShell에서는 작업 폴더에서
`Remove-Item -LiteralPath '.jobshot/import.lock'`을 사용할 수 있다. 다른 파일이나 폴더를 재귀 삭제하지 않는다.
중단된 `.pending-*` 폴더는 최종 공고로 노출되지 않는다. 자동 삭제하지 않으므로 복구가 필요한지 확인한다.

## 검증 범위

`npm run check`는 가상 자료로 원본 보존·분할 좌표/픽셀·중복·날짜·링크/정션·경로·이미지 검증과 실제 stdio 통신을 검사한다.
Windows에서는 실제 PowerShell PNG 변환을 가상 Bitmap으로 검증한다. 테스트가 사용자의 클립보드를 읽거나 바꾸지는 않는다.
프로토콜 통신 확인과 Codex/Claude UI에서 캡처 붙여넣기 확인은 별개다.
2026-10-17에 Windows 실제 클립보드 저장과 Codex 대화창 첨부 2장의 파일 접근·보존을 확인했다.
Codex 앱 자체의 MCP 재연결·직접 도구 호출, Claude Code, macOS는 아직 미검증이다.
[클라이언트 실사용 체크](client-validation.md)에 확인 절차와 결과 범위를 기록한다.
