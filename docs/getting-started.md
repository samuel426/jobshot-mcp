# 현재 버전 시작하기

1단계 첫 구현: 로컬 파일 조회와 공고 원본 저장. AI 분석·일정·서류 자동화는 후속 단계다.

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
외부 절대 경로, URL 다운로드, OS 클립보드 직접 접근은 제공하지 않는다.
날짜를 모르면 `{"kind":"unknown"}`, 상시 채용은 `{"kind":"rolling"}`을 사용한다.
링크를 모르면 `source_url`을 생략하거나 null로 둔다. 이미지에서 URL을 추측하지 않는다.

결과:

```text
공고/2026-11-01_가상기업_백엔드 개발/
  공고정보.json
  사진/
    original-001.png
    manifest.json
```

원본 바이트를 보존하고 이미지의 해시·크기·형식을 기록한다. `manifest.json`의 `crops`는 아직 빈 배열이다.
PNG·JPEG·WebP 정지 이미지 한 장, 최대 20 MiB·4천만 픽셀을 지원한다.
파일이 길어도 이 제한 안에서는 원본을 보관하지만 자동 분할은 하지 않는다.
기업·직무·마감·링크·이미지가 동일하면 `duplicate: true`로 기존 결과를 반환한다.
다른 이미지나 메타데이터가 같은 폴더명으로 충돌하면 공고 ID 일부를 붙여 구분한다.
기존 공고의 날짜 수정이나 여러 이미지 병합은 아직 지원하지 않는다.

상태는 `imported`다. 이는 **보관 완료**만 뜻한다. 공고 해석·적합도 평가·달력 등록을 마쳤다는 의미가 아니다.
마감 시각은 `null`, Google 캘린더와 평가 값도 `null`로 남긴다.

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

정상 종료 시 잠금은 해제된다. 강제 종료 후 `IMPORT_BUSY`가 계속된다면 모든 JobShot 프로세스를 종료했는지 먼저 확인한다.
그 후 **비어 있는** `.jobshot/import.lock` 디렉터리만 제거한다. PowerShell에서는 작업 폴더에서
`Remove-Item -LiteralPath '.jobshot/import.lock'`을 사용할 수 있다. 다른 파일이나 폴더를 재귀 삭제하지 않는다.
중단된 `.pending-*` 폴더는 최종 공고로 노출되지 않는다. 자동 삭제하지 않으므로 복구가 필요한지 확인한다.

## 검증 범위

`npm run check`는 가상 자료로 원본 보존·중복·날짜·링크/정션·경로·이미지 검증과 실제 stdio 통신을 검사한다.
프로토콜 통신 확인과 Codex/Claude UI에서 캡처 붙여넣기 확인은 별개다.
후자는 현재 검증되지 않았으며 파일 입력 경로를 우선 제공한다.
