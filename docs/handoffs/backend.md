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
