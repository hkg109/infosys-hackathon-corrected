# 아 맞다, 인생! — 정보시스템학과 플래너

Next.js(App Router) + TypeScript + Tailwind v4 + Supabase. 별도 백엔드 서버 없음 — 서버 로직은 `src/app/api/**/route.ts`.

## 명령
- `npm run dev` — 개발 서버 (localhost:3000)
- `npm run check` — typecheck + lint + test (PR 전에 실행)
- `npm run build` — 프로덕션 빌드

## 기준 문서
- 제품·계산·자료 기준: `docs/PLAN.md`
- 작업 카드·담당 경로·시작 순서: `TEAM.md` (자기 담당 경로만 수정)
- 자료 원본: `docs/sources/` (S1 교과과정표, S2 2026-2 수강신청 안내문). 학교 수치는 이 원문 쪽수로 확인된 것만 쓴다.

## 구조와 경계
| 경로 | 역할 |
|---|---|
| `src/contracts/types.ts` | 공통 타입. 바꾸면 mock·fixture·테스트도 같은 PR에서 수정 |
| `src/contracts/mock-plan.ts` | 샘플 입력(정상·목표 미입력·입력 오류) |
| `src/engine/**` | 순수 계산: `simulatePlan`, `diffPlans`. React·fetch·DB 금지 |
| `src/features/planner/**` | 화면. 최상위 export는 `PlannerApp` |
| `src/features/guidance/**` | `buildGuidance` — 결과를 준비사항으로 변환. 학점·날짜 재계산 금지 |
| `src/client/catalog.ts` | 화면이 자료를 받는 유일한 경로 `getCatalog()` |
| `src/app/api/catalog/route.ts` | `GET /api/catalog` |
| `src/server/catalog/**` | fixture/Supabase에서 게시본 조회 |
| `src/data/fixtures/**` | 개발용 검토 자료(공개 교육과정 표본) |
| `scripts/collect/**`, `scripts/normalize/**` | 수집·검사 스크립트(`normalize/validate-fixture.ts`). 사용자 요청 경로에서 실행하지 않음 |
| `data/candidates/**` | 원문에서 추출한 검토 전 자료 |
| `docs/sources/**` | 자료 원본 PDF(개인정보 자료는 넣지 않음) |
| `docs/handoffs/**`, `docs/data-sources.md` | 담당별 인계 기록, 자료 사전 |
| `supabase/migrations/**` | DB 스키마·RLS |

## 규칙
- 새 작업은 최신 main에서 `feat/<fe|be|db>-<카드번호>-<설명>` 브랜치로 시작하고, PR 전 `npm run check && npm run build`를 모두 통과시킨다.
- 시연은 PC 브라우저로만 한다. 모바일 화면 대응·테스트는 하지 않는다.
- 확인되지 않은 학교 수치(졸업학점, 선수요건, 모집일)를 만들지 않는다 → `unknown`/가정으로 표시.
- 중단 기간은 `[startDate, endDate)`, 날짜는 `YYYY-MM-DD` 문자열 비교.
- 전공학점은 총학점에 포함 — 더하지 않는다.
- 화면에서 DB SDK·외부 사이트를 직접 호출하지 않는다.
- 운영에서 DB 실패를 fixture로 몰래 대체하지 않는다(`CATALOG_SOURCE`로 명시 선택).
- localStorage는 `useEffect` 안에서만 읽는다.
- 의존성 추가 시 package-lock.json 포함해 커밋.
- `.env.local`, 서비스 키는 커밋하지 않는다.
