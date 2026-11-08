# 소스 설치형 미리보기의 제3자 의존성 안내

확인일: 2026-11-08. 대상은 Windows·Codex용 JobShot 0.5.0-dev.1의 Git 소스 설치 방식이다. JobShot 자체 코드는 [MIT](../LICENSE), 의존성은 각 상위 프로젝트의 조건을 따른다. 아래 표는 출처와 설치 후 읽을 고지의 위치를 안내하며 상위 라이선스 원문을 대체하지 않는다.

## 배포에 포함하는 것

| 경로/형태 | 제공 내용 | 의존성 처리 |
| --- | --- | --- |
| Git 저장소·GitHub 소스 아카이브 | JobShot 소스·문서·package-lock.json·LICENSE | 사용자가 npm ci로 의존성을 내려받는다. 설치된 LICENSE·NOTICE·README를 보존한다. |
| Vercel 화면 예시 | web-prototype/public의 HTML·CSS·JavaScript | 외부 JavaScript·폰트·이미지 패키지를 포함하거나 CDN에서 읽지 않는다. 로컬 MCP 의존성을 배포하지 않는다. |
| 설치 프로그램·단일 실행 파일·node_modules 포함 ZIP | 이번 미리보기에서 제공하지 않음 | 추가하는 경우 실제 포함 파일을 기준으로 고지·소스 제공·재링크 등 해당 조건을 다시 검토한다. |

기준 소스 `0d1f87c`의 Git 추적 목록에서 node_modules·dist·vendor 폴더와 DLL·EXE·NODE·WASM·ZIP·TGZ 파일은 없었다. 소스의 import는 설치된 패키지를 참조하며 의존성 코드를 번들링하는 빌드 단계는 없다. 소스 설치 방식을 유지하는 동안 배포 파일에 의존성 바이너리를 추가하지 않는다. 이는 다른 형태의 배포까지 허용됐다는 판단이 아니다.

## 직접 의존성의 출처와 고지 위치

아래 경로는 npm ci 후 저장소 루트 기준이다. 온라인 main 브랜치는 바뀔 수 있으므로 설치된 버전의 파일을 우선 대조한다.

| 패키지·버전 | 용도 | 선언 | 설치된 고지 | 상위 프로젝트 |
| --- | --- | --- | --- | --- |
| @modelcontextprotocol/server 2.3.1 | 런타임 | Apache-2.0 | node_modules/@modelcontextprotocol/server/LICENSE | [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk) |
| sharp 0.35.5 | 런타임 | Apache-2.0 | node_modules/sharp/LICENSE 및 README.md의 Licensing | [sharp](https://github.com/lovell/sharp) |
| zod 4.6.7 | 런타임 | MIT | node_modules/zod/LICENSE | [Zod](https://github.com/colinhacks/zod) |
| @modelcontextprotocol/client 2.3.1 | 개발·검증 | Apache-2.0 | node_modules/@modelcontextprotocol/client/LICENSE | [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk) |
| @types/node 24.19.2 | 빌드 | MIT | node_modules/@types/node/LICENSE | [DefinitelyTyped](https://github.com/DefinitelyTyped/DefinitelyTyped) |
| jsdom 29.0.0 | 검증 | MIT | node_modules/jsdom/LICENSE.txt | [jsdom](https://github.com/jsdom/jsdom) |
| typescript 7.0.2 | 빌드 | Apache-2.0 | node_modules/typescript/LICENSE 및 NOTICE.txt | [TypeScript](https://github.com/microsoft/TypeScript) |

잠금 파일의 모든 OS·개발·선택 의존성 108개는 [선언 목록](dependency-licenses.md)에 있다. 패키지 메타데이터의 한 줄 선언과 실제 고지 파일의 내용을 구분한다.

### MCP SDK의 추가 고지

설치된 server·core·client 2.3.1의 LICENSE에는 Apache-2.0으로의 전환 설명, 재라이선스 동의가 없는 기존 기여의 MIT 유지, 명세를 제외한 문서의 CC-BY-4.0 안내가 함께 있다. 패키지 선언만 보고 전체를 Apache 단일 조건으로 설명하지 않는다. 세 파일은 동일한 SHA-256을 가졌다. [상위 LICENSE](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/LICENSE)와도 내용을 대조했다.

MCP 문서나 코드를 복사해 재배포하는 경우 해당 부분의 실제 조건과 고지를 확인한다. 현재 JobShot의 의존성 안내는 원문 문서를 복제하지 않고 출처를 연결한다.

## Windows 이미지 처리 패키지

`@img/sharp-win32-x64` 0.35.5의 선언은 Apache-2.0 AND LGPL-3.0-or-later다. 설치된 README.md의 Licensing 표에는 29개 라이브러리가 있으며 versions.json은 28개 버전을 제공한다. libnsgif의 버전은 해당 파일에 없어 추정하지 않았다.

| README 이름 | versions.json 버전 | README에 표시된 조건 |
| --- | --- | --- |
| aom | 3.15.1 | BSD 2-Clause + Alliance for Open Media Patent License 1.0 |
| cairo | 1.18.6 | MPL 1.1 |
| cgif | 0.5.4 | MIT |
| expat | 2.8.5 | MIT |
| fontconfig | 2.18.3 | fontconfig License |
| freetype | 2.14.3 | FreeType License |
| fribidi | 1.0.17 | LGPLv3 |
| glib | 2.90.0 | LGPLv3 |
| harfbuzz | 14.5.0 | MIT |
| highway | 1.4.0 | BSD 3-Clause |
| lcms | 2.19.1 | MIT |
| libarchive | 3.8.9 | BSD 2-Clause |
| libexif | 0.6.26 | LGPLv3 |
| libffi | 3.8.0 | MIT |
| libheif | 1.23.5 | LGPLv3 |
| libimagequant | 2.4.1 | BSD 2-Clause |
| libnsgif | 버전 파일에 없음 | MIT |
| libpng | 1.6.58 | libpng License |
| librsvg | 2.63.2 | LGPLv3 |
| libtiff | 4.7.2 | libtiff License |
| libultrahdr | 2.0.2 | MIT |
| libvips | 8.18.7 | LGPLv3 |
| libwebp | 1.6.0 | New BSD |
| libxml2 | 2.15.4 | MIT |
| mozjpeg | 0826579 | zlib / IJG / BSD 3-Clause |
| pango | 1.58.2 | LGPLv3 |
| pixman | 0.46.4 | MIT |
| proxy-libintl | 0.5 | LGPLv3 |
| zlib-ng | 2.3.3 | zlib |

이 표는 설치된 패키지의 고지를 옮겨 정리한 것이며 각 바이너리의 코드·링크 방식을 독립적으로 감사한 결과가 아니다. README는 LGPLv2 또는 LGPLv2.1의 이후 버전 조항을 통해 LGPLv3를 사용한다고 설명한다. [sharp 설치 안내](https://sharp.pixelplumbing.com/install/)와 [네이티브 패키징 프로젝트](https://github.com/lovell/sharp-libvips)에서 상위 출처를 확인할 수 있다. 바이너리를 직접 묶어 배포하려면 포함 버전의 전체 고지와 대응 소스·빌드 방법 등 필요한 자료를 별도로 확보해야 한다.

## 설치 환경 대조 기록

Windows x64 개발 환경에서 잠금 파일상 런타임 항목 중 실제 설치된 11개를 확인했다. 모든 버전이 잠금 파일과 같았고 각각 고지 파일이 있었다. 이 수는 모든 OS의 설치 개수나 실제 실행 중 로드된 패키지 수를 뜻하지 않는다.

| 설치 패키지 | 버전 | 패키지 안의 고지 파일 |
| --- | --- | --- |
| @emnapi/runtime | 1.11.3 | LICENSE |
| @img/colour | 1.1.0 | LICENSE.md |
| @img/sharp-wasm32 | 0.35.5 | LICENSE, README.md의 Licensing |
| @img/sharp-win32-x64 | 0.35.5 | LICENSE, README.md의 Licensing, versions.json |
| @modelcontextprotocol/core | 2.3.1 | LICENSE |
| @modelcontextprotocol/server | 2.3.1 | LICENSE |
| detect-libc | 2.1.2 | LICENSE |
| semver | 7.8.5 | LICENSE |
| sharp | 0.35.5 | LICENSE, README.md의 Licensing |
| tslib | 2.8.1 | CopyrightNotice.txt, LICENSE.txt |
| zod | 4.6.7 | LICENSE |

원문 파일 식별용 SHA-256:

| 파일 | SHA-256 |
| --- | --- |
| @modelcontextprotocol/{server,core,client}/LICENSE | 0382b0057770ca05e9c350a50aa3b1c1fea84da0bc81d723bf00b9aa841be58a |
| @img/sharp-win32-x64/README.md | 3d083ada5ebafe1e6c227daa7b061d4254b61df4a3901c359ffdeac817ce5866 |
| @img/sharp-win32-x64/versions.json | e2611d5d854815a8b33c8a3d2ec649511a9596ccf16844e8eae7cf81e79881c4 |

## 업데이트할 때

1. package-lock.json을 변경하면 `node scripts/dependency-inventory.mjs`로 선언 목록을 갱신하고 `--check`로 확인한다.
2. 변경된 패키지의 설치 버전·LICENSE·NOTICE·COPYING·CopyrightNotice와 README의 추가 고지를 읽는다. 메타데이터와 원문의 차이를 이 문서에 기록한다.
3. sharp나 플랫폼 패키지가 바뀌면 README·versions.json을 다시 대조하고 표·해시를 갱신한다. 이 문서의 수치는 자동으로 갱신되지 않는다.
4. Git 추적 파일과 실제 배포 파일을 확인한다. 의존성 코드·폰트·이미지·실행 파일을 새로 복사하거나 번들링하면 기존 소스 설치 범위의 검토를 재사용하지 않는다.

현재 소스 설치형 고지 정리는 완료했다. 실행 파일 묶음의 재배포 조건 검토, Google OAuth 공개 조건, 다른 사용자 PC의 첫 사용과 릴리스 공개는 [배포 준비](release-readiness.md)에서 별도로 추적한다.
