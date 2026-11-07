# DB 인계

## DB-1 자료 근거 정리

- 기준 브랜치: `feat/db-db-1-sources`
- 기준일: 2026-11-07
- 자료 변경: 없음. 원문 PDF와 기존 fixture는 수정하지 않음
- 추가 산출물:
  - `docs/data-sources.md`
  - `data/candidates/s1-infosys-curriculum-2024-2027.candidate.json`

### 확인 결과

- S1의 표기 행 수는 페이지별 `5·11·14·13·11·5`, 총 59개다.
- HYR0004와 ITE4088의 이수학기는 원문 공란이다.
- S1의 이수구분은 교육과정표 표기이며 개인에게 적용되는 필수 여부와 같다고 단정할 수 없다.
- S2는 2026-2학기의 교육과정 적용과 수강학점 기준을 설명한다. 미래 학기나 모든 사용자에게 그대로 적용하지 않는다.
- 2026학년도 신입생의 3학년 이상 18학점 기준과 핵심교양 총학점 개편은 원문에서 “예정”이다.
- 개인 필수과목과 선수강 교과목은 S2 19~20쪽의 개인별 조회 메뉴에서 확인해야 한다.

## BE-1에 필요한 자료 표현

아래 이름은 계약 확정을 위한 예시이며 DB 담당이 `src/contracts/**`에 추가할 필드명이 아니다.

### 예시 1: 과목 행과 원문 위치

```json
{
  "code": "ITE4088",
  "name": "정보시스템학종합설계",
  "credits": 1,
  "curriculumCategory": "전공심화",
  "recommendedYear": 4,
  "recommendedSemester": null,
  "offeringRange": {
    "start": { "year": 2027, "semester": 1 },
    "end": { "year": 2030, "semester": 2 }
  },
  "evidence": {
    "documentId": "S1",
    "page": 5,
    "checkedAt": "2026-11-07"
  },
  "applicability": "unknown"
}
```

`recommendedSemester: null`은 미확인/공란이다. 1·2학기 공통이라는 뜻으로 바꾸지 않는다. 개설 범위도 미래 실제 개설 확정으로 표현하지 않는다.

### 예시 2: 공식이지만 예정인 상한

```json
{
  "key": "planning.creditCap",
  "value": 18,
  "documentStatus": "planned",
  "scope": {
    "campus": "서울",
    "entryYearFrom": 2026,
    "termNumberFrom": 5,
    "excludedPrograms": ["건축학부"]
  },
  "evidence": {
    "documentId": "S2",
    "pages": [17, 18],
    "checkedAt": "2026-11-07"
  },
  "personalApplicability": "unknown"
}
```

공식 문서 근거, 예정 상태, 개인 적용 상태를 한 상태값으로 합치면 안 된다.

### 예시 3: 개인 조회가 필요한 필수과목

```json
{
  "key": "student.requiredCourses",
  "value": null,
  "status": "unknown",
  "confirmation": {
    "documentId": "S2",
    "page": 19,
    "method": "졸업사정조회 또는 필수과목이수조회"
  }
}
```

S1의 `전공기초(필수)` 표기만으로 개인의 미이수 필수과목 목록을 만들지 않는다.

## BE-1 검토 요청

계약 PR을 머지하기 전에 다음을 표현할 수 있는지 확인해 달라.

1. 한 자료 항목에 문서 ID, 페이지, 검토일, 적용 범위를 연결할 수 있는가.
2. 공식 근거 여부와 `예정`, 개인 적용 `미확인`을 동시에 보존할 수 있는가.
3. 과목 이수학기 공란과 1·2학기 공통을 구분할 수 있는가.
4. 개설 시작·종료의 연도와 학기를 손실 없이 보존할 수 있는가.
5. 교육과정표 이수구분과 개인 필수과목 목록을 별도로 표현하는가.
6. 과거 계획 스냅샷이 사용한 자료·설정 버전을 보존하는가.

## 다음 DB 작업

- BE-1 머지 전: 계약 예시 피드백과 후보 자료 오탈자 검토
- BE-1 머지 후 DB-2: 59행 전체 검토와 fixture 보강
- DB-3: S2 정책과 진로 추천 설정 자료화
- DB-4: 후보/fixture 검증 자동화와 오류 사례

Supabase 연결과 게시 자동화는 기본 MVP 완료 후 `OPT-DB`에서 진행한다.
