# 역할 분담

세 명이 동시에 코딩해도 충돌하지 않도록 **고치는 경로**로 나눈다. 규칙은 [CLAUDE.md](CLAUDE.md)를 따른다.
DB 없이 바로 시작할 수 있다. 기본값 `CATALOG_SOURCE=fixture`로 앱은 `src/data/fixtures`만 읽는다.

**시연 환경:** 해커톤 시연은 PC 브라우저(데스크톱 화면)로만 한다. 모바일 화면 대응·모바일 테스트는 하지 않는다.

| 담당 | 역할 | 도구 | 브랜치 | 고치는 경로 |
|---|---|---|---|---|
| 한지석 | 프론트엔드 | Claude Pro (Claude Code) | `feat/frontend` | `src/features/planner/**`, `src/app/page.tsx`, `src/app/layout.tsx`, `src/app/globals.css` |
| 정예준 | 백엔드 | Claude Pro (Claude Code) | `feat/backend` | `src/engine/**`, `src/features/guidance/**`, `src/contracts/**`, `src/app/api/**`, `src/client/**` |
| 정재헌 | DB | Codex Plus | `feat/db` | `src/server/catalog/**`, `src/data/fixtures/**`, `supabase/**`, `scripts/**` |

## 충돌 방지 규칙

- `src/contracts/types.ts`는 **정예준만** 고친다. 필드가 필요하면 정예준에게 요청하고, 작은 PR로 먼저 머지한다(mock·fixture·테스트도 같은 PR에서 수정).
- `package.json`/`package-lock.json` 변경(의존성 추가·업그레이드)은 한 번에 한 사람만 하고, lock 파일을 함께 커밋한다.
- 자기 경로 밖을 고쳐야 하면 해당 담당자에게 먼저 말한다.
- PR 전에 `npm run check`를 돌린다. `.env.local`과 서비스 키는 커밋하지 않는다.

## 한지석: 프론트엔드

1. 데모 흐름을 PC 화면에서 끝까지 눌러 보고 깨지는 곳을 고친다: 처음 입력 → 로드맵 → 진로 변경 → 군 복무 → 플랜 A 저장 → 비교.
2. 입력 화면(`Controls`)은 중단 기간을 하나만 다룬다. 엔진은 여러 개를 지원하므로 필요하면 화면만 확장한다.
3. 입력 오류(`result.error`)가 화면에 표시되는지 확인하고, 준비사항 체크 상태를 `storage.ts`에 저장한다(읽기는 `useEffect` 안에서만).
4. 화면에서 학점·날짜를 다시 계산하지 않는다. `simulatePlan` 결과만 쓴다.

## 정예준: 백엔드

1. 테스트가 없는 곳부터 채운다: `diffPlans`(`src/engine/diff.ts`), `buildGuidance`, 월 입력 ↔ `[start, end)` 날짜 변환(`src/features/planner/dates.ts`).
2. 엔진 경계 상황: 중단 기간 여러 개, 방학 기간(1–2월·7–8월)에만 걸치는 중단, 목표학점을 이미 채운 경우.
3. 계약 타입 변경 요청을 가장 먼저 처리한다.

## 정재헌: DB

DB 없이 시작한다. Supabase 프로젝트는 실제 DB 연결 단계에서 만든다.

1. `getPublishedCatalog.ts`의 DB 행 → `Dataset` 변환을 순수 함수로 분리하고, 가짜 행 데이터로 테스트를 붙인다.
2. fixture 검사 스크립트를 `scripts/normalize/`에 만든다: 과목 코드 중복, `careerTags`·`sourceId`가 존재하는 과목·출처를 가리키는지.
3. fixture → DB 가져오기 스크립트(draft → reviewed → `publish_catalog_version()`)를 미리 작성한다. 실행은 Supabase 준비 후에 한다.
4. 학교 수치는 공식 출처로 확인한 것만 `verified`로 바꾸고 `sources`에 기록한다. 확인하지 못한 값은 `unknown`으로 둔다.

## 머지 순서

계약 타입 변경 PR이 있으면 먼저 머지한다. 나머지는 끝나는 순서대로 머지한다. DB 작업은 `CATALOG_SOURCE`로 켜고 끄므로 화면 작업과 순서가 얽히지 않는다.
