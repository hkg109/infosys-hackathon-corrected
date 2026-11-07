# TEAM — 해커톤 작업 계획

- 기준일: 2026-11-07
- 제품·계산 기준: [docs/PLAN.md](docs/PLAN.md) / 저장소 규칙: [CLAUDE.md](CLAUDE.md)
- 목표: PLAN 2장의 **시연 시나리오 한 줄기가 끝까지 실제로 동작**하는 것. 그 외는 만들지 않는다.

## 1. 이미 있는 것

| 영역 | 상태 |
|---|---|
| 화면 | 아·맞·다 3단계 틀(FE-0), 내 정보 입력, 성적표 인식, 로드맵, A/B 비교, 중단 기간 여러 개, 인쇄·PDF |
| 계산 | `simulatePlan`, `diffPlans`와 테스트 |
| 안내 | `buildGuidance` 준비사항 |
| 자료 | 17과목 fixture, `getCatalog()` 경로, S1·S2 자료 사전([docs/data-sources.md](docs/data-sources.md), DB-1) |
| 계약 | v2 계약(`PlanInputV2`, `CandidateSet`, `RankingResult`, `PlanVersion` 등)과 예제·v1 변환(BE-1, [docs/handoffs/backend.md](docs/handoffs/backend.md)) |

즉 남은 핵심은 **후보 여러 개를 계산해 비교하는 것**과 **수정 전후 비교 → 확정 흐름 연결**이다.

v2 계약에는 교환학생·버전 이력·162개 조합 같은 필드도 들어 있다. 계약은 그대로 두되, 이번 구현은 PLAN에 적힌 범위만 채운다(교환은 입력값이 있어도 국내 과목 미배치 표시까지, 버전은 직전↔현재 비교만).

## 2. 역할과 수정 경로

| 담당 | 책임 | 수정 경로 |
|---|---|---|
| 한지석 | 화면·브라우저 저장·시연 | `src/features/planner/**`, `src/app/page.tsx`, `src/app/layout.tsx`, `src/app/globals.css` |
| 정예준 | 계약·계산·안내·API·통합 | `src/contracts/**`, `src/engine/**`, `src/features/guidance/**`, `src/app/api/**`, `src/client/**` |
| 정재헌 | 자료 fixture·검사 | `src/data/fixtures/**`, `src/server/catalog/**`, `scripts/**`, `data/candidates/**` |

`src/contracts/**`는 정예준만 수정한다. 경로 밖 수정은 담당자와 먼저 말한다.

## 3. 작업 카드

| 카드 | 담당 | 작업 | 완료 기준 |
|---|---|---|---|
| FE-0 화면 틀 (완료: 4b9c7cb) | 한지석 | 아·맞·다 단계 이동, 확정 상태 저장 | — |
| DB-1 자료 근거 정리 (완료: c919802) | 정재헌 | S1·S2 자료 사전 | — |
| BE-1 공통 계약 (완료: 35572ba) | 정예준 | v2 계약·예제·v1 변환 | — |
| DB-2 과목 fixture 보강 (완료: caad3bb) | 정재헌 | S1에서 과목·학점·이수구분·권장 학년/학기 추출해 fixture 보강 | `validate-fixture` 통과. 공란 학기는 `null`, 과목을 지어내지 않음 |
| DB-3 진로 핵심 과목 (완료: 66593a8) | 정재헌 | 정보보안·데이터 분석 핵심 과목 목록과 추천 이유 한 줄씩(`RecommendationConfig`) | 두 진로 모두 fixture의 과목 코드를 정확히 참조 |
| BE-2 후보 생성·정렬 (완료: bae57ef) | 정예준 | 진로 × 학점 페이스 조합을 엔진으로 계산해 `CandidateSet`·`RankingResult` 생성, 중복 제거, PLAN 5.1 정렬, 추천 이유 | 같은 입력 → 같은 결과. 후보 0/1/2개와 목표학점 미입력 처리 테스트 |
| BE-3 수정 비교·준비사항 (완료: b335147) | 정예준 | 수정 전후 비교(`diffPlans`/`VersionDiff`)를 화면에 넘기는 형태 정리, 준비사항에 복학 후 재확인 추가 | 입대 시점·학점 페이스 변경 시 차이가 나옴 |
| FE-1 맞 후보 카드 (완료: 36eede4) | 한지석 | BE-2 결과로 후보 카드 최대 3개·지표·추천 이유·선택 버튼 | 입력을 바꾸면 카드가 바뀜. 가짜 후보 없음 |
| FE-2 수정·확정 (완료: bff1480) | 한지석 | 선택한 후보에서 입대 시점/학점 페이스/진로 수정, 전후 비교, “맞다!” → 로드맵·PDF | 새로고침 후에도 확정 계획 복구 |
| FE-3 시연 점검 | 한지석 + 전원 | PLAN 2장 시나리오를 PC에서 처음부터 끝까지 | 깨진 버튼·잘린 내용 없음, 3분 안에 시연 가능 |

FE-1은 BE-1의 `mock-plan.ts` v2 예제로 바로 시작하고, BE-2가 머지되면 실제 결과로 연결한다.

## 4. 순서

| 순서 | 정예준 | 정재헌 | 한지석 |
|---|---|---|---|
| 1 | BE-2 | DB-2 | FE-1 (v2 예제로) |
| 2 | BE-3 | DB-3 | FE-1 실제 연동, FE-2 |
| 3 | 통합 확인 | 시연 입력 데이터 준비 | FE-3 |

시간이 모자라면 줄이는 순서: 진로 조합 생략(사용자가 고른 진로 1개 × 학점 페이스만) → 준비사항은 기존 `buildGuidance` 그대로.

## 5. 브랜치·검증

- 최신 main에서 `feat/<fe|be|db>-<카드번호>-<설명>` 브랜치, 카드 하나 = PR 하나.
- PR 전 `npm run check && npm run build` 통과. fixture를 바꿨으면 `npx tsx scripts/normalize/validate-fixture.ts`도 실행.
- `.env.local`, 키, 성적표 원문은 커밋하지 않는다.

## 6. 3분 시연 순서

1. 아: 성적표 붙여넣기 → 이수 현황 확인, 입대 예정·학점 페이스·우선순위 입력
2. 맞: 계산된 후보 3개와 추천 이유 비교 → 하나 선택
3. 입대 시점 또는 학점 페이스 변경 → 전후 차이 확인 → “맞다!”
4. 다: 로드맵·준비사항 → PDF
5. 마무리: 확인된 자료만 쓰고 모르는 건 “확인 필요”로 표시한다는 점, 확장 가능성 한 줄
