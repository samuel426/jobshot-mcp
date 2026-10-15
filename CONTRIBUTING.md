# 협업 규칙

## 작업 흐름

1. 이슈에 문제, 범위, 완료 조건을 적는다. 실제 공고나 개인정보 대신 가상 자료로 설명한다.
2. 최신 `main`에서 `codex/<작업명>` 브랜치를 만든다. 예: `codex/posting-import`.
3. 한 PR에서 하나의 검토 가능한 목적을 완성한다. 이후 단계 기능을 함께 넣지 않는다.
4. 관련 확인을 실행하고 결과를 PR에 기록한다. 미실행 항목은 명시한다.
5. PR 검토 후 squash merge를 기본으로 한다. 초기 저장소 생성 커밋 외에는 `main` 직접 작업을 피한다.

GitHub 브랜치 보호는 아직 설정하지 않았다. 아래 규칙은 현재 문서상 협업 규칙이다.
사용자 요청에 따라 병합하며, 이번 단계는 검토할 PR을 만드는 데까지 진행한다.

## 커밋

`<type>: <변경 목적>` 형식으로 작성한다.

| type | 용도 |
| --- | --- |
| feat | 사용자 기능 |
| fix | 오류 수정 |
| docs | 요구사항·사용법·설계 |
| test | 의미 있는 검증 추가·수정 |
| chore | 설정·도구·유지보수 |
| refactor | 동작을 유지하는 구조 변경 |

예: `feat: import posting images without modifying originals`

## 제출 전 확인

```sh
node scripts/check-foundation.mjs
npm run check
git diff --check
git diff --cached --stat
```

개인 자료·공고·생성 달력·인증 정보가 staged 파일에 없는지 확인한다.
`git add -f`로 제외 규칙을 우회하지 않는다. `.gitignore`는 암호화나 접근 통제가 아니다.
개인 자료 조회·공고 저장·stdio 통합 테스트를 포함한다. GitHub Actions는 Windows와 Linux에서 검사한다.
로컬 샌드박스가 Windows 정션 생성을 제한하면 해당 테스트가 EPERM으로 실패할 수 있다.
제한 없는 개발 터미널에서 다시 확인하며 테스트를 건너뛰어 통과로 보고하지 않는다.

## PR 내용

문제와 바뀐 동작, 포함 범위, 확인 결과, 미완료 사항을 적는다.
관련 이슈를 `Closes #번호`로 연결한다. 공개 PR에 로컬 개인 경로나 계정 토큰을 넣지 않는다.
