# 통합 인계 — 자동 학점 가져오기·최소 입력 군 전략·결과 두 영역 (2026-11-08)

브랜치: `feat/fe-5-auto-input-military-results`. FE·BE·DB 변경을 커밋으로 나눴다.

## FE (한지석 경로)
- 01 아 `transcript` 단계: 붙여넣기(HTML 표 → TSV → 텍스트) / 스크린샷(브라우저 OCR) / 직접 수정. 직접 수정일 때만 총·전공학점·과목 단계가 보인다.
- 검토 창에서 확인하기 전에는 입력·localStorage가 바뀌지 않는다. 이미지·OCR 원문은 저장하지 않는다.
- 군 복무 질문: 필요 여부 → 선호 군 → 중요한 것(정해진 입영일은 접힌 선택 입력) → 카투사 → (카투사일 때만) 영어 성적·지난 지원.
- `/match`는 두 영역만: 나에게 딱 맞는 트랙(군 전략·분기·지금 할 일·미확인 조건·출처 포함) / 전체 트랙 인기 TOP 3. 전체 트랙은 `/match/all`.
- 확인 필요: 실제 포털 화면(한양인)에서 Ctrl+A 붙여넣기 형식을 시연 기기로 한 번 확인할 것. 테스트는 가상 자료만 썼다.

## BE (정예준 경로)
- 계약: `RecruitmentCycle`, `ConcurrentApplicationRule`, `SelectionResolutionRule`, `SupplementalRecruitmentRule`, `MilitaryPlanningInput`, `MilitaryStrategyCandidate`, `MilitaryOutcomeBranch`, `PopularitySnapshot`.
- 엔진: `buildMilitaryStrategies`(결정적), `selectBranchPeriod`(선발 결과 입력 뒤에만 확정 기간).
- `src/client/popularity.ts`: 집계 전이라 `available: false`. 집계 API가 생기면 이 함수만 바꾼다.
- 아직 없음: 선발 결과 입력 화면(결과 입력 → `selectBranchPeriod` → 로드맵 확정). 계약·함수는 준비됨.

## DB (정재헌 경로)
- `military-2026-11-08.json`: 공군 기술병 트랙(21개월, 원문), 모집회차 7개, 중복지원 3, 선발 처리 2, 추가모집 1. 모두 출처 URL·확인일.
- `validate-fixture`: 미발표 회차 날짜 금지, 적용 회차 없는 중복지원 규칙 금지.
- 다시 확인할 것
  - 2027년 카투사 모집 공고(2027년 7월경 예상, 확정 아님): 중복지원 문구가 나오면 `concurrentRules`에 `katusa-2027` 회차로 추가.
  - 「2027년도 육군 모집병 연간 모집일정」 첨부 PDF(본문에 표 없음)의 회차별 날짜.
  - 카투사·육군 기술행정병 복무기간: 해당 모집안내 원문에 없음 → null 유지 중.
  - 해군·해병대 모집 자료: 미검토(화면은 공고 확인 안내만).
