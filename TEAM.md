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

## 1차 작업 (완료)

- 한지석: 샘플 데이터 제거, 내 정보 입력 첫 화면(성적표 붙여넣기 포함), 학기 타임라인, 플랜 A·B 나란히 비교, 확인 항목 묶음, 쉬는 기간 여러 개, 과목 → 로드맵 이동, 로드맵 인쇄·PDF 저장
- 정예준: `diffPlans`·`buildGuidance`·날짜 변환 테스트, `simulatePlan` 경계 상황 보강 (PR #1)
- 정재헌: DB 행 → `Dataset` 변환 분리와 테스트, fixture 검사 스크립트 (PR #2)

## 2차 작업

### 결정 필요 (팀 전체)

- **시연 자료를 DB 게시본으로 할지, fixture로 할지.** DB로 가면 아래 정재헌 1번이 시연 전 필수다. fixture로 가면 화면에 "개발용 자료" 배지가 보이므로, 발표에서 "수집 → 검토 → 게시 구조는 만들었고 지금은 검토 자료"라고 설명한다.

### 정예준: 배포와 안내 개인화

1. **Next.js 보안 업그레이드:** `next@15.5.4`는 보안 경고(CVE-2025-66478)가 있다. 15.5 계열 최신 패치로 올리고 `eslint-config-next`도 같은 버전으로 맞춘다. 이 작업 동안 다른 사람은 `package.json`을 고치지 않는다.
2. **Vercel 배포:** 시연용 URL을 만든다. 환경 변수는 `CATALOG_SOURCE`(DB로 가면 `SUPABASE_URL`·`SUPABASE_ANON_KEY`도)만 넣고, 서비스 키는 넣지 않는다. 배포 주소를 팀에 공유한다.
3. **준비사항 개인화(`buildGuidance`):** 지금은 고정 문구다. 계획 결과의 학기와 과목을 써서 "복학 학기 전 복학 신청 확인", "진로 핵심 과목이 놓인 학기" 같은 안내로 바꾼다. 학교 신청 기간·마감일은 확인된 자료가 없으므로 만들지 않는다.

### 정재헌: 자료

1. **fixture → DB 가져오기·게시 스크립트(1차 3번에서 넘어옴):** draft → reviewed → `publish_catalog_version()` 순서. Supabase 프로젝트를 만들고 `0001_catalog.sql`을 적용한 뒤 실행해, `CATALOG_SOURCE=supabase`에서 화면 상단 배지가 "게시된 자료"로 바뀌는지 확인한다.
2. **과목 자료 보강:** 지금 표본은 17과목이고 선수요건·졸업학점이 모두 미확인이라 계획마다 '가정' 표시가 많다. 공개 교육과정 페이지에서 과목을 더 모으고, 공식 출처로 확인한 선수요건만 `verified`로 바꾼다. 추가 후 `npx tsx scripts/normalize/validate-fixture.ts`로 검사한다.

### 한지석: 시연 준비

1. 실제 한양인 성적 조회 표를 붙여넣어 이수 과목을 잘 찾는지 확인하고, 못 찾는 형식이면 `parseTranscript.ts`를 고친다.
2. 시연 PC 브라우저에서 아래 시나리오를 리허설한다. 입력한 정보는 그 브라우저에 남으므로 리허설한 브라우저로 시연한다.
3. 다른 두 명의 작업이 머지되면 전체 흐름을 다시 눌러 본다.

### 시연 시나리오 (3분)

1. 첫 화면에서 내 정보 입력 → 성적표 붙여넣기로 이수 과목 자동 체크 → 군 복무 예정 입력 → "내 로드맵 만들기"
2. 로드맵: 군 복무 구간 띠, '가정' 표시와 "확인이 필요한 항목"(확인되지 않은 학교 수치는 만들지 않는다는 원칙)
3. "플랜 A로 저장" → 군 복무 기간이나 진로 변경 → 플랜 비교에서 "N학기 늦어짐"과 달라진 학기 확인
4. 전공 과목 → "로드맵에서 보기"로 이동, 마지막으로 "인쇄·PDF 저장"

## 머지 순서

계약 타입 변경 PR이 있으면 먼저 머지한다. 나머지는 끝나는 순서대로 머지한다. DB 작업은 `CATALOG_SOURCE`로 켜고 끄므로 화면 작업과 순서가 얽히지 않는다.
