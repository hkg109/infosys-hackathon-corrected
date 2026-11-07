# 백엔드 인계 — 정예준

## BE-1 공통 계약 (브랜치 `feat/be-1-contracts`)

### 바뀐 것
- `src/contracts/types.ts` 아래쪽에 **v2 계약**을 추가했다. v1 타입(`PlanInput`·`PlanResult`·`SavedPlan`)은 그대로 두었고, 기존 엔진·화면은 바뀌지 않는다.
- `src/contracts/mock-plan.ts`에 v2 예제를 추가했다(모두 가상 입력).
- `src/engine/migrate.ts`: v1 → v2 변환(`planInputFromV1`, `planResultFromV1`, `migrateSavedPlanV1`)과 후보 ID 규칙(`candidateIdOf`).

### 계약 요약
| 항목 | 타입 | 핵심 규칙 |
|---|---|---|
| 입력 v2 | `PlanInputV2` | 미입력 = `null`, 0 = 실제 0. `careers: []` = 진로 미정. `pace`는 fixed/compare. `military`·`leave`·`exchange` 상태와 `periods`를 분리 |
| 기간 | `PeriodInput` | `kind` military/leave/exchange, `timing` fixed/flexible, 길이는 `endDate` > `durationMonths` > `returnTerm`. 셋 다 없으면 "기간 확인 필요" |
| 교환 인정 | `ExchangeRecognition` | `credits`·`countsAsTerm`이 `null`이면 미정 — 0으로 확정 금지 |
| 입력 검증 | `InputIssue` | `severity` error(입력 오류) / missing(정보 부족), `field`는 `progress.earnedMajorCredits`, `periods[0].endDate` 같은 경로 |
| 자료·규칙 | `DatasetV2`, `CreditCapRule`, `SourceRef`, `AppliesTo` | 새 필드는 선택 필드. 적용 범위·쪽수·`ConfirmStatus`(verified/planned/user_assumption/unknown) 보존 |
| 추천 설정 | `RecommendationConfig` | 진로별 핵심 과목·이유, 페이스 비교값, 후보 상한 18, 최초 노출 3, `configVersion` |
| 결과 v2 | `PlanResultV2`, `PlannedTermV2` | 학기 상태 study/break/exchange, `periodIds`, 학기별 `capCredits`·`capRuleId`, `termOrdinal`, `issues`, `assumptions`, `partial` |
| 후보 | `CandidateSet`, `TrackCandidate`, `CandidateKey` | 상태 computable/conditional/conflict/search_limit. ID 형식 `{career}\|m{학기인덱스 또는 -}\|p{페이스}` |
| 순위 | `RankingResult`, `MetricValue`, `RankedEntry` | 사용·제외 지표와 이유, 동률(`tiedWith`), `unrankedReason`, `rankingVersion` |
| 버전 | `PlanVersion`, `PlanVersionStore`, `VersionDiff`, `FeedbackChange` | 스냅샷, `parentVersionId`, `confirmedVersionId`, `maxVersions`(20), 완료 시점 비교 불가 = `deltaTerms: null`, 자료·엔진·순위 버전 차이 표시 |
| 준비사항 | `GuidanceItemV2`, `GuidanceTiming` | 근거 종류 + 확인 상태, 날짜 또는 상대 시점, 관련 기간·과목, `checkKey` |

### 예제(`mock-plan.ts`)
| 이름 | 기대 동작 |
|---|---|
| `sampleInputV2` | 정상 → 계산 가능 |
| `sampleInputV2NoTarget` | 목표 미입력 → 완료 학기 `null`, `fast_completion` 지표 제외 |
| `sampleInputV2Undecided` | 진로·이수 과목 미정 → 두 진로 탐색, 재수강 확정 배치 금지 |
| `sampleInputV2PeriodUnknown` | 병역 시점·길이 미정 → "기간 확인 필요" 조건부 |
| `sampleInputV2MilitaryFlexible` | 길이만 있음 → 병역 시점 후보 최대 3개 |
| `sampleInputV2ExchangeUnknown` | 교환 인정 미정 → 교환 학기 국내 과목 미배치, 이후 진행 보류 |
| `sampleInputV2Conflict` | 고정 군 복무·교환 겹침 → conflict |
| `sampleInputV2Invalid` | 전공학점 > 총학점, 종료일 < 시작일 → error |
| `sampleCreditCapRules` | S2 17~18쪽 상한(PLAN 2.2 대조값). 게시 자료는 DB-3 검토본이 기준 |
| `sampleRecommendationConfig` | 개발용 핵심 과목(fixture careerTags에서 선택) |

### v1 변환 기준
- v1 숫자 입력은 사용자 값으로 그대로 가져온다. v1에 없던 항목(입학연도, 적용 교육과정, 개인 필수과목)은 `null`/`unknown`.
- 병역 기간이 있으면 `military: "planned"`, 없으면 `"undecided"`(해당 없음으로 단정하지 않음). 학기당 상한 → `pace: fixed`.
- 저장된 플랜 A는 재계산하지 않고 v2 버전 하나(`origin: migrated_v1`)로 옮긴다. 형식이 맞지 않으면 `{ ok: false, reason }`.

### 검증
- `npm run check` 통과(테스트 61개, 신규 7개), `npm run build` 통과, `validate-fixture` 통과.

### 남은 제한·다음 담당자 참고
- 엔진은 아직 v1 입력으로만 계산한다. `PlanInputV2` 검증·계산은 BE-2, 후보 생성·정렬은 BE-3.
- 손으로 만든 `CandidateSet` 예제는 넣지 않았다(입력과 무관한 결과를 만들지 않기 위해). FE-2는 BE-3 전까지 타입 모양만 맞추고, 실제 카드는 BE-3 결과로 연결한다.
- DB(정재헌): `DatasetV2`의 `courseSourceRefs`·`creditCapRules`·`recommendation` 필드명을 검토본에 쓰면 된다. 필드가 더 필요하면 계약 카드로 요청.
- FE(한지석): 입력 화면은 `PlanInputV2` + `InputIssue.field` 경로로 오류 위치를 표시. 저장 스키마 v2는 `PlanVersionStore`.

## BE-2 후보 생성·정렬 (브랜치 `feat/be-2-candidates`)

### 사용법
```ts
import { generateCandidates } from "@/engine";
const set = generateCandidates(inputV2, dataset);            // 설정: dataset.recommendation ?? 기본 설정
const set = generateCandidates(inputV2, dataset, config);    // 설정을 직접 넘길 때(개발: sampleRecommendationConfig)
```
- 결과 `CandidateSet`: `candidates`(중복 제거 후), `ranking.entries`(순위·추천 이유), `dedupedInto`, `exploredCount`, `emptyReason`.
- 카드 표시는 `ranking.entries` 순서대로 앞에서 `config.initialVisible`(3)개. `entries[i].candidateId`로 `candidates`에서 찾는다.

### 규칙(PLAN 5.1)
- 후보 = 관심 진로(빈 배열이면 정보보안·데이터 분석 둘 다) × 학점 페이스(`pace.fixed`면 그 값 하나, `compare`면 `options ?? [15,18,20]`). 각각 `simulatePlan`으로 실제 계산.
- 같은 진로에서 학기·과목·학점·완료 학기가 같으면 하나로 합친다. 대표는 생성 순서(진로 고정 순서 → 페이스 오름차순)의 첫 후보.
- 정렬: 사용자 우선순위 → 빠른 완료 → 진로 과목 → 여유 순서의 사전식 비교, 끝까지 같으면 같은 순위 + ID 순서 + "평가 동률". 교환 경험은 우선순위로 고른 경우만 비교.
- 한 후보라도 계산 못 한 지표는 비교 전체에서 제외하고 `excludedMetrics`에 이유를 남긴다. 모두 미확인이면 순위 없음(`unrankedReason`).
- 지표: 빠른 완료 = 시작 학기부터 완료 학기까지 학기 수, 진로 과목 = 핵심 과목 평균 배치 학기(이수 완료 0, 첫 학기 1, 미배치 25), 여유 = 수강 학기 최대 학점(같으면 평균).

### 후보 상태
| 상태 | 언제 |
|---|---|
| `computable` | 필요한 정보가 모두 있고 배치 완료 |
| `conditional` | 목표학점·기간·교환 인정 미정, 또는 미배치 과목 있음. 기간·교환 미정이면 완료 학기 `null` |
| `search_limit` | 24학기 안에 못 끝냄 |
| `conflict` | 고정 군 복무·교환 기간 겹침. 순위에서 제외, 모두 충돌이면 `emptyReason` |

후보 0개: 입력 오류(`validatePlanInputV2`의 error) 또는 시작 학기·이수 현황 미입력 → `emptyReason.changeableFields`에 화면이 강조할 입력 경로.

### 검증
- `npm run check` 통과(테스트 84개, 신규 23개), `npm run build` 통과.

### 남은 제한·다음 담당자 참고
- 진로 핵심 과목 자료(DB-3)가 없으면 기본 설정(`default-1`)을 쓰고 "진로 과목 먼저"는 제외된다. DB-3가 `dataset.recommendation`을 채우면 그대로 연결된다.
- 목표학점이 없으면 현재 엔진이 과목 학점만 배치해 페이스별 결과가 같아지고, 후보가 1개로 합쳐질 수 있다(정상 동작).
- 병역 시점 펼치기·학기별 학교 상한(`capRuleId`)은 이번 범위 밖(PLAN 9장). `militaryStartTerm`은 항상 `null`.
- FE(한지석): 입력 오류 표시는 `validatePlanInputV2(input)`의 `field` 경로를 쓰면 된다.
