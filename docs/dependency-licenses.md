# 의존성 라이선스 선언 목록

`node scripts/dependency-inventory.mjs`로 package-lock.json에서 재생성한다. `--check`는 저장된 목록의 최신성을 검사한다.

모든 OS의 선택 의존성과 개발 의존성을 포함한 잠금 항목 목록이다. 설치된 패키지 수와 다를 수 있다. 라이선스 선언만으로 배포 의무 검토를 완료했다고 판단하지 않는다. 특히 sharp/libvips에 포함된 네이티브 라이브러리는 별도 확인이 필요하다. [배포 준비 안내](release-readiness.md)를 따른다.

총 108개 항목. 누락 선언 0개.

- 0BSD: 1
- Apache-2.0: 39
- Apache-2.0 AND LGPL-3.0-or-later: 3
- Apache-2.0 AND LGPL-3.0-or-later AND MIT: 1
- BlueOak-1.0.0: 1
- BSD-2-Clause: 2
- BSD-3-Clause: 2
- CC0-1.0: 1
- ISC: 4
- LGPL-3.0-or-later: 10
- MIT: 42
- MIT-0: 2

| 패키지 | 버전 | 선언 라이선스 | 관계 | 용도 | 선택 |
| --- | --- | --- | --- | --- | --- |
| @asamuzakjp/css-color | 5.1.11 | MIT | 전이 | 개발 | 아니요 |
| @asamuzakjp/dom-selector | 7.1.1 | MIT | 전이 | 개발 | 아니요 |
| @asamuzakjp/generational-cache | 1.0.1 | MIT | 전이 | 개발 | 아니요 |
| @asamuzakjp/nwsapi | 2.3.9 | MIT | 전이 | 개발 | 아니요 |
| @bramus/specificity | 2.4.3 | MIT | 전이 | 개발 | 아니요 |
| @csstools/color-helpers | 6.1.2 | MIT-0 | 전이 | 개발 | 아니요 |
| @csstools/css-calc | 3.4.3 | MIT | 전이 | 개발 | 아니요 |
| @csstools/css-color-parser | 4.2.6 | MIT | 전이 | 개발 | 아니요 |
| @csstools/css-parser-algorithms | 4.0.2 | MIT | 전이 | 개발 | 아니요 |
| @csstools/css-syntax-patches-for-csstree | 1.1.15 | MIT-0 | 전이 | 개발 | 아니요 |
| @csstools/css-tokenizer | 4.0.2 | MIT | 전이 | 개발 | 아니요 |
| @emnapi/runtime | 1.11.3 | MIT | 전이 | 런타임 | 예 |
| @exodus/bytes | 1.16.0 | MIT | 전이 | 개발 | 아니요 |
| @img/colour | 1.1.0 | MIT | 전이 | 런타임 | 아니요 |
| @img/sharp-darwin-arm64 | 0.35.5 | Apache-2.0 | 전이 | 런타임 | 예 |
| @img/sharp-darwin-x64 | 0.35.5 | Apache-2.0 | 전이 | 런타임 | 예 |
| @img/sharp-freebsd-wasm32 | 0.35.5 | Apache-2.0 | 전이 | 런타임 | 예 |
| @img/sharp-libvips-darwin-arm64 | 1.3.4 | LGPL-3.0-or-later | 전이 | 런타임 | 예 |
| @img/sharp-libvips-darwin-x64 | 1.3.4 | LGPL-3.0-or-later | 전이 | 런타임 | 예 |
| @img/sharp-libvips-linux-arm | 1.3.4 | LGPL-3.0-or-later | 전이 | 런타임 | 예 |
| @img/sharp-libvips-linux-arm64 | 1.3.4 | LGPL-3.0-or-later | 전이 | 런타임 | 예 |
| @img/sharp-libvips-linux-ppc64 | 1.3.4 | LGPL-3.0-or-later | 전이 | 런타임 | 예 |
| @img/sharp-libvips-linux-riscv64 | 1.3.4 | LGPL-3.0-or-later | 전이 | 런타임 | 예 |
| @img/sharp-libvips-linux-s390x | 1.3.4 | LGPL-3.0-or-later | 전이 | 런타임 | 예 |
| @img/sharp-libvips-linux-x64 | 1.3.4 | LGPL-3.0-or-later | 전이 | 런타임 | 예 |
| @img/sharp-libvips-linuxmusl-arm64 | 1.3.4 | LGPL-3.0-or-later | 전이 | 런타임 | 예 |
| @img/sharp-libvips-linuxmusl-x64 | 1.3.4 | LGPL-3.0-or-later | 전이 | 런타임 | 예 |
| @img/sharp-linux-arm | 0.35.5 | Apache-2.0 | 전이 | 런타임 | 예 |
| @img/sharp-linux-arm64 | 0.35.5 | Apache-2.0 | 전이 | 런타임 | 예 |
| @img/sharp-linux-ppc64 | 0.35.5 | Apache-2.0 | 전이 | 런타임 | 예 |
| @img/sharp-linux-riscv64 | 0.35.5 | Apache-2.0 | 전이 | 런타임 | 예 |
| @img/sharp-linux-s390x | 0.35.5 | Apache-2.0 | 전이 | 런타임 | 예 |
| @img/sharp-linux-x64 | 0.35.5 | Apache-2.0 | 전이 | 런타임 | 예 |
| @img/sharp-linuxmusl-arm64 | 0.35.5 | Apache-2.0 | 전이 | 런타임 | 예 |
| @img/sharp-linuxmusl-x64 | 0.35.5 | Apache-2.0 | 전이 | 런타임 | 예 |
| @img/sharp-wasm32 | 0.35.5 | Apache-2.0 AND LGPL-3.0-or-later AND MIT | 전이 | 런타임 | 예 |
| @img/sharp-webcontainers-wasm32 | 0.35.5 | Apache-2.0 | 전이 | 런타임 | 예 |
| @img/sharp-win32-arm64 | 0.35.5 | Apache-2.0 AND LGPL-3.0-or-later | 전이 | 런타임 | 예 |
| @img/sharp-win32-ia32 | 0.35.5 | Apache-2.0 AND LGPL-3.0-or-later | 전이 | 런타임 | 예 |
| @img/sharp-win32-x64 | 0.35.5 | Apache-2.0 AND LGPL-3.0-or-later | 전이 | 런타임 | 예 |
| @modelcontextprotocol/client | 2.3.1 | Apache-2.0 | 직접 | 개발 | 아니요 |
| @modelcontextprotocol/core | 2.3.1 | Apache-2.0 | 전이 | 런타임 | 아니요 |
| @modelcontextprotocol/server | 2.3.1 | Apache-2.0 | 직접 | 런타임 | 아니요 |
| @types/node | 24.19.2 | MIT | 직접 | 개발 | 아니요 |
| @typescript/typescript-aix-ppc64 | 7.0.2 | Apache-2.0 | 전이 | 개발 | 예 |
| @typescript/typescript-darwin-arm64 | 7.0.2 | Apache-2.0 | 전이 | 개발 | 예 |
| @typescript/typescript-darwin-x64 | 7.0.2 | Apache-2.0 | 전이 | 개발 | 예 |
| @typescript/typescript-freebsd-arm64 | 7.0.2 | Apache-2.0 | 전이 | 개발 | 예 |
| @typescript/typescript-freebsd-x64 | 7.0.2 | Apache-2.0 | 전이 | 개발 | 예 |
| @typescript/typescript-linux-arm | 7.0.2 | Apache-2.0 | 전이 | 개발 | 예 |
| @typescript/typescript-linux-arm64 | 7.0.2 | Apache-2.0 | 전이 | 개발 | 예 |
| @typescript/typescript-linux-loong64 | 7.0.2 | Apache-2.0 | 전이 | 개발 | 예 |
| @typescript/typescript-linux-mips64el | 7.0.2 | Apache-2.0 | 전이 | 개발 | 예 |
| @typescript/typescript-linux-ppc64 | 7.0.2 | Apache-2.0 | 전이 | 개발 | 예 |
| @typescript/typescript-linux-riscv64 | 7.0.2 | Apache-2.0 | 전이 | 개발 | 예 |
| @typescript/typescript-linux-s390x | 7.0.2 | Apache-2.0 | 전이 | 개발 | 예 |
| @typescript/typescript-linux-x64 | 7.0.2 | Apache-2.0 | 전이 | 개발 | 예 |
| @typescript/typescript-netbsd-arm64 | 7.0.2 | Apache-2.0 | 전이 | 개발 | 예 |
| @typescript/typescript-netbsd-x64 | 7.0.2 | Apache-2.0 | 전이 | 개발 | 예 |
| @typescript/typescript-openbsd-arm64 | 7.0.2 | Apache-2.0 | 전이 | 개발 | 예 |
| @typescript/typescript-openbsd-x64 | 7.0.2 | Apache-2.0 | 전이 | 개발 | 예 |
| @typescript/typescript-sunos-x64 | 7.0.2 | Apache-2.0 | 전이 | 개발 | 예 |
| @typescript/typescript-win32-arm64 | 7.0.2 | Apache-2.0 | 전이 | 개발 | 예 |
| @typescript/typescript-win32-x64 | 7.0.2 | Apache-2.0 | 전이 | 개발 | 예 |
| bidi-js | 1.1.0 | MIT | 전이 | 개발 | 아니요 |
| cross-spawn | 7.0.6 | MIT | 전이 | 개발 | 아니요 |
| css-tree | 3.2.1 | MIT | 전이 | 개발 | 아니요 |
| data-urls | 7.0.0 | MIT | 전이 | 개발 | 아니요 |
| decimal.js | 10.6.0 | MIT | 전이 | 개발 | 아니요 |
| detect-libc | 2.1.2 | Apache-2.0 | 전이 | 런타임 | 아니요 |
| entities | 8.1.0 | BSD-2-Clause | 전이 | 개발 | 아니요 |
| eventsource | 3.0.7 | MIT | 전이 | 개발 | 아니요 |
| eventsource-parser | 3.1.1 | MIT | 전이 | 개발 | 아니요 |
| html-encoding-sniffer | 6.0.0 | MIT | 전이 | 개발 | 아니요 |
| is-potential-custom-element-name | 1.0.1 | MIT | 전이 | 개발 | 아니요 |
| isexe | 2.0.0 | ISC | 전이 | 개발 | 아니요 |
| jose | 6.2.12 | MIT | 전이 | 개발 | 아니요 |
| jsdom | 29.0.0 | MIT | 직접 | 개발 | 아니요 |
| lru-cache | 11.5.3 | BlueOak-1.0.0 | 전이 | 개발 | 아니요 |
| mdn-data | 2.27.1 | CC0-1.0 | 전이 | 개발 | 아니요 |
| parse5 | 8.0.1 | MIT | 전이 | 개발 | 아니요 |
| path-key | 3.1.1 | MIT | 전이 | 개발 | 아니요 |
| pkce-challenge | 5.0.1 | MIT | 전이 | 개발 | 아니요 |
| punycode | 2.3.1 | MIT | 전이 | 개발 | 아니요 |
| require-from-string | 2.0.2 | MIT | 전이 | 개발 | 아니요 |
| saxes | 6.0.0 | ISC | 전이 | 개발 | 아니요 |
| semver | 7.8.5 | ISC | 전이 | 런타임 | 아니요 |
| sharp | 0.35.5 | Apache-2.0 | 직접 | 런타임 | 아니요 |
| shebang-command | 2.0.0 | MIT | 전이 | 개발 | 아니요 |
| shebang-regex | 3.0.0 | MIT | 전이 | 개발 | 아니요 |
| source-map-js | 1.2.2 | BSD-3-Clause | 전이 | 개발 | 아니요 |
| symbol-tree | 3.2.4 | MIT | 전이 | 개발 | 아니요 |
| tldts | 7.4.19 | MIT | 전이 | 개발 | 아니요 |
| tldts-core | 7.4.19 | MIT | 전이 | 개발 | 아니요 |
| tough-cookie | 6.0.2 | BSD-3-Clause | 전이 | 개발 | 아니요 |
| tr46 | 6.0.0 | MIT | 전이 | 개발 | 아니요 |
| tslib | 2.8.1 | 0BSD | 전이 | 런타임 | 예 |
| typescript | 7.0.2 | Apache-2.0 | 직접 | 개발 | 아니요 |
| undici | 7.30.1 | MIT | 전이 | 개발 | 아니요 |
| undici-types | 7.24.6 | MIT | 전이 | 개발 | 아니요 |
| w3c-xmlserializer | 5.0.0 | MIT | 전이 | 개발 | 아니요 |
| webidl-conversions | 8.0.1 | BSD-2-Clause | 전이 | 개발 | 아니요 |
| whatwg-mimetype | 5.0.0 | MIT | 전이 | 개발 | 아니요 |
| whatwg-url | 16.0.1 | MIT | 전이 | 개발 | 아니요 |
| which | 2.0.2 | ISC | 전이 | 개발 | 아니요 |
| xml-name-validator | 5.0.0 | Apache-2.0 | 전이 | 개발 | 아니요 |
| xmlchars | 2.2.0 | MIT | 전이 | 개발 | 아니요 |
| zod | 4.6.7 | MIT | 직접 | 런타임 | 아니요 |
