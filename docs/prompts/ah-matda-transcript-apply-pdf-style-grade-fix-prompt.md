# 수정 지침 — 성적표 가져오기 반영 버그 · PDF를 웹 디자인으로 · 커리어개발 성적 "I" 오인식

> 이 문서는 AI 개발 에이전트가 **그대로 읽고 처리**하도록 쓴 작업 지시서다.
> 프로젝트: 「아 맞다, 인생!」(한양대 정보시스템학과 플래너) — Next.js App Router + TypeScript + Tailwind v4.
> 작업 전 반드시 `CLAUDE.md`, `docs/PLAN.md`를 읽고 그 규칙을 지킨다. 이 문서와 CLAUDE.md가 충돌하면 CLAUDE.md가 우선이다.

---

## 0. 작업 요약 (한눈에)

| # | 증상(사용자 보고) | 확인된 원인(코드 기준) | 고칠 파일 |
|---|---|---|---|
| 1 | 스크린샷을 읽은 뒤 검토 창에서 **‘확인하고 한 번에 반영’ 버튼까지 스크롤이 안 된다.** 반영을 눌러도 **반영이 안 된 것처럼 보이고, 다음으로 가려 하면 다시 스크린샷을 입력하라고 한다.** | (A) 검토 창이 `position: fixed`인데, 조상 `<section className="step-in">`의 transform 애니메이션(`animation-fill-mode: both`) 때문에 **fixed 기준이 화면(viewport)이 아니라 그 section**이 된다 → 창이 속지 안에 갇히고, `body { overflow: hidden }`까지 걸려 하단 버튼에 닿지 못한다. (B) Claude가 과목 목록 화면만 읽으면 **총·전공 이수학점이 null**인데 검토 창은 이를 막지 않고 반영 → 과목만 반영되고 학점은 비어 있음 → `stepProblem("transcript")`가 “성적표를 가져와 총·전공 학점을 확인하거나…”를 띄운다. (C) 반영 결과 안내가 `has &&`(총·전공 둘 다 있을 때) 안에만 있어서 **학점이 비면 반영 메시지도 안 보인다.** (D) 반영 실패 이유(`problem`)는 화면 밖 footer에만 뜬다. | `src/features/planner/components/TranscriptImport.tsx`, (필요 시) `src/features/planner/components/InputSteps.tsx`, `src/features/planner/questions.ts` |
| 2 | 다운로드한 PDF가 웹사이트와 **다른 디자인**(파란 표 양식)이다. **웹과 같은 글꼴·색상·디테일**로 바꿔라. | PR #20에서 `PrintPlan`을 별도 파란색 보고서 양식(`#2d4a85` 머리줄, Pretendard 위주)으로 만들었다. 웹은 크림색 속지·잉크색·파란 펜·빨간 도장·형광펜·명조(Gowun Batang)·손글씨(Nanum Pen Script) 톤이다. | `src/features/planner/components/PrintPlan.tsx`, `src/app/globals.css`(`.print-doc` 블록) |
| 3 | 성적표의 **커리어개발I:취.창업진로로드맵(GEN5029)** 성적이 A+인데 검토 창에 **‘I’**로 나오고 ‘넣지 않음’으로 빠진다. | `statusOf(cells)`가 **모든 셀(과목명 포함)을 공백으로 쪼개 왼쪽부터** 성적처럼 생긴 토큰을 찾는다. Claude가 과목명을 `커리어개발 I :취.창업진로로드맵`처럼 공백을 넣어 돌려주면 과목명 속 로마숫자 **`I`가 `UNKNOWN_GRADE`(`/^(I|IP|N|R|E|AU|T)$/`)에 먼저 걸려** 실제 성적 셀 `A+`에 도달하기 전에 반환된다 → status `unknown` + grade `I` → `ambiguous` 그룹, 기본값 ‘넣지 않음’. | `src/features/planner/transcriptImport.ts`, 테스트 `src/features/planner/transcriptImport.test.ts`(없으면 새로 만든다) |

**작업 순서 권장:** 3(가장 작고 테스트로 고정 가능) → 1 → 2. 각 수정은 별도 커밋.

**브랜치:** 최신 `main`에서 `feat/fe-12-transcript-apply-pdf-style`(이미 `feat/fe-12-pdf-style-transcript`가 있으면 그것을 써도 된다). PR 전 `npm run check && npm run build` 모두 통과.

---

## 1. 공통 규칙 (CLAUDE.md에서 이 작업과 직접 관련된 것)

- 시연은 **PC 브라우저**(특히 **macOS Safari**와 Chrome)만. 모바일 대응은 하지 않는다.
- 성적표 이미지는 **화면에서 동의를 받은 뒤에만** `/api/transcript-image`(Claude)로 보낸다. **이미지·원문을 저장·로그하지 않는다.** 인식 결과는 **검토 창을 거친 뒤에만** 반영한다. → 이 원칙은 그대로 유지. 고치면서 콘솔 로그로 원문·이미지를 찍지 말 것(디버깅 후 반드시 제거).
- 확인되지 않은 학교 수치(졸업학점, 선수요건 등)를 만들지 않는다. 과목 학점을 더해서 총 이수학점을 **추정해 채우지 않는다**(교양·타과·인정 학점이 빠져 있기 때문 — 검토 창 문구도 이미 그렇게 말한다).
- 전공학점은 총학점에 포함 — 더하지 않는다.
- localStorage는 `useEffect` 안에서만 읽는다.
- 화면에서 외부 사이트·DB SDK를 직접 호출하지 않는다.
- 실제 개인 성적표·이름·학번을 저장소에 커밋하지 않는다. 테스트는 **가상 행**으로만.

---

## 2. 수정 3 — 과목명 속 로마숫자 ‘I’를 성적으로 오인식

### 2.1 재현 데이터 (가상, 실제 화면과 같은 모양)

Claude 이미지 인식 결과(`TranscriptImageReply.rows`)가 아래처럼 올 수 있다.

```json
{ "term": "2026년-1학년-1학기", "category": "교양필수", "code": "GEN5029",
  "name": "커리어개발 I :취.창업진로로드맵", "credits": 1, "grade": "A+" }
```

`rowsFromVision`은 이를 `cells = [term, category, code, name, "1", "A+"]`로 만든다.
`statusOf(cells)`는 `cells.flatMap(c => [c, ...c.split(/[\s/|()]+/)])`로 **과목명까지 토큰화**한다 → 토큰 순서상 `"I"`가 `"A+"`보다 먼저 → `UNKNOWN_GRADE` 매치 → `{ grade: "I", status: "unknown" }`.

같은 문제가 생길 수 있는 다른 과목명: `커리어개발 II`, `기초물리학 I`, `글쓰기 I`, `영어 I`, `미적분학 I`, 이름에 `E`, `N`, `T`, `R`, `S`, `P`가 공백으로 떨어진 경우(예: `C P R`, `A I 시대…`의 `AI`는 매치 안 되지만 단일 글자는 위험). 특히 **`S`와 `P`는 PASS_GRADE**, **`F`·`U`는 FAIL_GRADE**라서 과목명 조각이 “완료/미이수”로 둔갑할 수도 있다.

### 2.2 고치는 방법 (필수)

1. **구조화된 성적이 있으면 그것만 쓴다.**
   - `SourceRow`에 선택 필드 `grade?: string | null`(또는 `fields?: { grade, name, code, credits, term, category }`)를 추가하고, `rowsFromVision`에서 `x.grade`를 그대로 담는다.
   - `parseTranscriptRows` 안에서 `r.grade !== undefined`(이미지 인식 행)이면 `statusOf`에 **성적 셀 하나만** 넘긴다: `statusOf(r.grade ? [r.grade] : [])`.
   - 성적이 null이면 `{ grade: null, status: "unknown" }`(지금과 같음) → 이 경우는 ‘확인 필요’로 보인다.
2. **구조 없는 행(붙여넣기·직접 텍스트)용 `statusOf`도 안전하게 만든다.** (붙여넣기 기능은 지금 화면에서 빠졌지만 함수·테스트는 남아 있으니 같이 고친다.)
   - 과목명 셀(학수번호·이수구분·학기·숫자가 아닌, 한글이 들어간 가장 긴 셀)을 **토큰화 대상에서 제외**한다. 셀 전체가 정확히 성적일 때만 성적으로 본다.
   - 셀은 **오른쪽에서 왼쪽으로** 본다(성적 열은 보통 맨 오른쪽).
   - 우선순위: 셀 **전체가** 성적 표기와 일치(`^A\+$` 등) > 셀 안 토큰(예: `"A+ / 4.5"`) — 토큰 분해는 **숫자·성적 외 글자가 없는 셀**(예: `A+ 4.5`, `4.5/A+`)에서만.
   - **한 글자 성적(`I`, `E`, `N`, `R`, `T`, `S`, `P`, `F`, `U`, `W`)은 셀 전체가 그 글자일 때만** 인정한다. 다른 글자와 붙어 있거나 과목명 셀에서 쪼개 나온 조각이면 무시.
3. `UNKNOWN_GRADE`(I 등)는 **PASS/FAIL/W/수강중을 모든 셀에서 먼저 찾아본 뒤** 아무것도 없을 때만 적용한다(지금은 셀 순회 중 먼저 보이는 것을 바로 반환).
4. Claude 프롬프트(`src/app/api/transcript-image/route.ts`의 `PROMPT`)에 한 줄 추가: “`name`은 화면 표기 그대로 쓰되, 과목명 속 로마숫자(Ⅰ, Ⅱ, I, II)는 과목명에 남기고 `grade`에 넣지 마. `grade`는 성적 열의 값만.” — 다만 **프롬프트 수정만으로 끝내지 말 것**(모델 출력은 보장되지 않는다). 1~3의 코드 수정이 본 수정이다.
5. 검토 창 ‘성적’ 열은 `detectedGrade`를 그대로 보여 주므로, 위 수정 뒤에는 `A+`로 나와야 하고 그룹은 `completed`, 기본 반영은 ‘완료로 반영’이어야 한다.

### 2.3 테스트 (vitest, `src/features/planner/transcriptImport.test.ts`)

가상 학과 과목 목록(fixture의 `GEN5029`가 학과 자료에 없으면 테스트용 `Course` 배열을 만들어 넣는다)으로 아래를 고정한다.

- 이미지 행 `name: "커리어개발 I :취.창업진로로드맵", grade: "A+"` → `detectedGrade === "A+"`, `completed`에 포함, `ambiguous`에 없음.
- 이미지 행 `name: "커리어개발I:취.창업진로로드맵"`(공백 없음), `grade: "A+"` → 같은 결과.
- 이미지 행 `name: "기초물리학 II", grade: "B0"` → `B0`, completed.
- 이미지 행 `name: "글쓰기 S", grade: null` → status `unknown`, grade `null`(과목명 속 `S`를 P/S 합격으로 오인하지 않음).
- 이미지 행 `grade: "I"`(실제 성적이 I) → status `unknown`, grade `I`, ambiguous(기존 동작 유지).
- 이미지 행 `grade: "F"` → failed. `grade: "W"` → withdrawn. `grade: "P"` → completed.
- 구조 없는 행 `["2026-1", "GEN5029", "커리어개발 I :취.창업진로로드맵", "1", "A+"]` → `A+`.
- 구조 없는 행 `["CSE1002", "전산학개론", "3", "A+ / 4.5"]` → `A+`(셀 안 토큰 분해 유지).
- 기존 테스트는 모두 통과해야 한다(기대값을 바꿔야 한다면 왜 바뀌는지 커밋 메시지에 적는다).

### 2.4 완료 기준

- 사용자 스크린샷 2와 같은 입력에서 커리어개발 행이 **성적 A+ · 완료로 반영**으로 보인다.
- 과목 순서도 원문 행 순서대로(지금은 ambiguous 그룹이 맨 아래로 간다 — 그룹별 정렬은 유지해도 되지만, 오인식이 없어지면 자연히 제자리로 온다).

---

## 3. 수정 1 — 검토 창 스크롤 불가 + 반영이 안 된 것처럼 보이는 문제

### 3.1 원인 A: 검토 창이 화면이 아니라 속지(section) 안에 갇힘

- `InputSteps.tsx`(약 146행): `<section key={step} className="step-in flex flex-1 flex-col pt-10">`
- `globals.css`: `.step-in { animation: step-in 200ms ease-out both; }` — `transform`을 애니메이션하고 `fill-mode: both`라 **애니메이션이 끝난 뒤에도 transform 애니메이션이 적용된 상태로 남는다.** Safari·Chrome 모두 이런 요소를 `position: fixed` 자손의 **containing block**으로 취급할 수 있다(사용자 스크린샷에서 창이 왼쪽 스프링 제본·속지 테두리 안에 들어가 있는 것이 그 증거).
- 그 결과 `ReviewDialog`의 바깥 `div.fixed.inset-0.overflow-y-auto`가 화면 높이가 아니라 section 높이를 갖고, 내부 스크롤이 생기지 않는다. 동시에 `useEffect`에서 `document.body.style.overflow = "hidden"`이라 페이지 스크롤도 막혀 **하단 sticky footer(반영 버튼)에 닿을 수 없다.**

**고치는 방법 (필수):**

1. `ReviewDialog`를 **`createPortal(…, document.body)`로 body 바로 아래에 렌더링**한다(`react-dom`의 `createPortal`). 마운트 전(SSR)에는 렌더링하지 않도록 `useEffect`로 `mounted` 확인 후 포털을 만든다.
2. 오버레이: `fixed inset-0 z-50 overflow-y-auto overscroll-contain`. 대화상자 본문: `max-h-[calc(100dvh-48px)] flex flex-col` + 가운데 내용 영역만 `overflow-y-auto min-h-0 flex-1`, header·footer는 고정(`shrink-0`). 이렇게 하면 **footer(반영 버튼)는 항상 화면 안에 보인다**(sticky에 의존하지 않는다).
3. `body` 스크롤 잠금은 유지하되, 잠금 해제가 cleanup에서 확실히 되게 한다(지금 코드 유지 + 포털 언마운트 시 해제 확인).
4. 추가 안전장치: `.step-in`의 `animation-fill-mode`를 `both` → `backwards`로 바꿔 애니메이션 종료 후 transform이 남지 않게 한다(첫 프레임 깜빡임 방지 효과는 그대로). 단, 이것만으로 끝내지 말고 1번(포털)을 반드시 한다 — 다른 조상(`.paper` 등)에 나중에 transform/filter가 붙어도 깨지지 않게.
5. 열릴 때 포커스는 대화상자로(지금처럼), Esc로 닫기 유지, 닫히면 ‘읽어서 확인하기’ 버튼으로 포커스 복귀.

**확인 방법:** 대화상자를 연 상태에서 브라우저 콘솔로
```js
const o = document.querySelector('[role=dialog]').parentElement;
[o.getBoundingClientRect().top, o.getBoundingClientRect().height, innerHeight]
```
→ `top === 0`, `height === innerHeight`여야 한다. 그리고 `document.querySelector('[role=dialog]').closest('section')`이 `null`(포털로 body 아래)이어야 한다. 1440×900, 1280×720 창에서 반영 버튼이 **스크롤 없이 보이는지** 확인. 과목 행이 20개 이상인 가상 결과로도 확인(가운데 영역만 스크롤).

### 3.2 원인 B·C·D: 총·전공 이수학점이 비어도 반영되고, 결과가 안 보이고, 다음 단계가 “스크린샷을 가져오라”며 막힘

흐름:
1. 과목 목록 화면만 캡처하면 Claude `summary.earnedCredits/majorCredits`가 null → 검토 창의 ‘총 이수학점’, ‘전공 이수학점’이 **‘직접 입력’(빈칸)**.
2. `importProblem`은 빈칸을 막지 않으므로 반영됨 → `draft.earnedCredits === null` 그대로.
3. `TranscriptImport`의 반영 안내(`applied`)는 `has &&` 안에 있어 **표시되지 않음**, `setMode(null)`로 스크린샷 패널도 닫힘 → 사용자 눈에는 “아무 일도 없었다”.
4. ‘다음’을 누르면 `questions.ts`의 `stepProblem("transcript")`가 **“성적표를 가져와 총·전공 학점을 확인하거나 ‘직접 수정하기’를 골라 주세요.”** → 사용자는 “다시 스크린샷을 넣으라고 한다”고 느낌.

**고치는 방법 (필수):**

1. **검토 창에서 총·전공 이수학점을 필수로 받는다.**
   - 반영할 값(`choice.earnedCredits ?? draft.earnedCredits`, `choice.earnedMajorCredits ?? draft.earnedMajorCredits`) 중 하나라도 null이면 반영을 막는다. 이 검사는 `transcriptImport.ts`의 `importProblem`에 넣어 순수 함수로 테스트한다(메시지 예: “총 이수학점과 전공 이수학점을 적어 주세요. 포털 ‘성적 조회’ 맨 아래 취득학점 합계에 있어요.”).
   - 빈 필수 칸은 처음부터 눈에 띄게: 칸 테두리 `border-red`(또는 `border-marker` 배경), 라벨 옆 ‘필수’ 표시, 안내 “성적표에서 찾지 못했어요 — 직접 적어 주세요”.
   - 반영 버튼을 눌렀는데 막히면: **에러 문구를 버튼 옆 + 해당 칸 바로 아래 둘 다** 보여 주고, 첫 번째 빈 칸으로 `scrollIntoView({ block: "center" })` + `focus()`.
   - 목표(졸업 기준) 총학점은 **선택**으로 유지(모르면 비워 둠 — CLAUDE.md 규칙).
   - 절대 과목 학점 합(`courseCreditSum`)으로 자동 채우지 않는다.
2. **반영 결과를 항상 보여 준다.** `applied` 메시지를 `has &&` 밖으로 빼서, 반영 직후에는 학점이 있든 없든 “가져오기 반영 — 과목 +5 · 총 100학점 · 전공 54학점” 같은 확인 줄을 보여 준다(sage 배경 줄, 기존 스타일 재사용). 반영된 과목 수·학점을 숫자로 명시.
3. **반영 뒤 다음 단계로 자연스럽게.** 반영 성공 시 transcript 단계의 ‘다음’ 버튼으로 포커스를 옮기거나 “이제 ‘다음’을 눌러 계속하세요” 안내. 자동으로 다음 단계로 넘기지는 않는다(사용자가 결과를 볼 수 있게).
4. **`stepProblem("transcript")` 문구 개선.** 과목은 반영됐는데 학점만 비어 있는 경우(`progressMode === "import"` && `completedCourseCodes.length > 0` && 학점 null)를 구분해 “과목은 가져왔어요. 총·전공 이수학점만 적어 주세요.”로 안내하고, 그 자리에서 바로 적을 수 있게 transcript 단계 화면에 **총·전공 이수학점 입력 칸 두 개**를 보여 준다(`NumberStep`/`NumberField`와 같은 모양 재사용). “스크린샷을 다시 넣으라”는 인상을 주지 않게.
5. 기존 `draft` 값이 있는 상태(테스트 프로필 등)에서 가져오면 지금처럼 기존 값이 기본값으로 채워진다(사용자 스크린샷 1의 100/54/130). 이 동작은 유지.

### 3.3 테스트 / 확인

- 단위 테스트(`transcriptImport.test.ts`): `importProblem`이 총·전공 null(현재값도 null)일 때 문구를 돌려주고, 현재값이 있으면 null을 돌려주는지.
- 단위 테스트(`questions.test.ts`가 있으면 거기, 없으면 새로): 과목만 있고 학점 null인 import 상태의 `stepProblem` 문구.
- 브라우저 확인(dev 서버, `preview_start {name:"dev"}`; Claude 키 없이도 가능하도록 **검토 창은 `parseTranscriptRows`에 가상 행을 넣어 여는 방식**으로 확인하거나, 키가 있으면 가상 성적표 이미지를 직접 만들어 사용 — 실제 개인 성적표 금지):
  1. 01 아 → 이수 현황 단계 → 스크린샷으로 가져오기 → 읽기 → 검토 창이 **화면 전체를 덮고** 반영 버튼이 보인다.
  2. 총·전공 빈칸 상태로 반영 → 막히고, 빈 칸으로 스크롤·포커스, 빨간 안내가 보인다.
  3. 값을 적고 반영 → 창이 닫히고 “가져오기 반영 — …” 줄이 보인다 → ‘다음’이 막히지 않는다.
  4. 새로고침 후에도 값이 남는다(localStorage — `useEffect`에서 읽기 규칙 확인).
- Safari에서 같은 순서 확인(자동화 불가면 PR 본문에 “Safari 수동 확인 필요”로 명시).

---

## 4. 수정 2 — PDF를 웹사이트와 같은 디자인으로

### 4.1 목표

PDF(브라우저 인쇄 → PDF 저장)가 **03 다(결과) 화면과 같은 “종이 다이어리” 디자인**으로 보이게 한다. 글꼴·색상·선·표식·여백 감각을 화면과 맞춘다. 단, PR #19/#20에서 고친 **인쇄 안정성(검게 찍힘 없음, 블록 잘림 없음, 화면 요소 숨김)은 절대 되돌리지 않는다.** → 기준 문서 `docs/prompts/ah-matda-print-pdf-fix-prompt.md`의 금지 사항 그대로 유지.

### 4.2 웹 디자인 토큰 (그대로 가져다 쓴다 — `src/app/globals.css` `:root`)

| 용도 | 토큰 | 값 |
|---|---|---|
| 속지 배경 | `--paper` | `#fdfbf5` |
| 속지 2(표 머리·연한 칸) | `--paper-2` | `#f6f1e5` |
| 본문 글자(잉크) | `--ink` | `#26241f` |
| 보조 글자 | `--ink-soft` | `#4a463e` |
| 흐린 글자 | `--muted` | `#8a8478` |
| 테두리 | `--line` | `#e2dbc9` |
| 줄 노트 선 | `--rule` | `#ebe4d3` |
| 파란 펜(강조·교양 자리·링크) | `--pen` | `#2d4a85` |
| 빨간 도장(완료 학기·주의) | `--red` / `--red-soft` | `#c4473a` / `#f6dcd6` |
| 형광펜 | `--marker` | `#fbe382` |
| 충족(초록) | `--sage` / `--sage-ink` | `#dbe8d6` / `#3f6a45` |
| 03 다 탭 색 | `--tab-out` | `#a9c6e2` |
| 진로 그룹 색 | `--g-software` 등 | 화면 범례와 같음 |

글꼴(화면과 동일, `layout.tsx`에서 이미 로드됨):
- 본문: `var(--font-sans)` = Pretendard Variable(jsdelivr CSS로 로드).
- 제목·학기 이름·큰 숫자·도장: `var(--font-serif)` = **Gowun Batang**(화면의 `font-serif` 제목과 같음).
- 손글씨 머리말(“학기별 로드맵”, “가져온 내용 확인” 같은 작은 파란 손글씨): `var(--font-hand)` = **Nanum Pen Script**, 색 `--pen`.
- **인쇄 전에 웹 글꼴이 다 받아졌는지 보장**: 인쇄 버튼(`OutputScreen.tsx` 약 280행 `window.print()`)을 `await document.fonts.ready; window.print();`로 바꾼다. (Cmd+P로 직접 인쇄하는 경우는 이미 화면에서 글꼴이 로드돼 있으므로 괜찮다.)

### 4.3 화면 요소 → PDF 대응 (무엇을 어떻게 닮게 할지)

화면 `OutputScreen` / `Roadmap.tsx`의 실제 구성을 보고 같은 모양으로 그린다. 아래는 최소 요구사항.

1. **머리(첫 쪽 위)**
   - 화면 03 다 머리처럼: 작은 파란 손글씨 라벨(예: “03 다 — 다했다”) + Gowun Batang 굵은 제목(트랙 이름 `plan.trackTitle`) + 흐린 부제(학과·교육과정·확정일·생성일·“계획·추정이며 졸업 판정이 아니에요”).
   - 오른쪽에는 화면의 **도장** 모양 “확정” 표시(확정된 경우 `plan.confirmedAt`) — `.stamp`처럼 테두리 2.5px·둥근 모서리·Gowun Batang·자간 0.12em·빨간색·약간 회전(−8deg). **`mix-blend-mode: multiply`는 인쇄에서 쓰지 말 것**(Safari 검정 원인) → 단색 테두리 + 투명 배경만.
   - 요약 숫자(예상 완료 학기, 계획 총학점, 학기 수, 목표학점)는 화면 요약 카드처럼 Gowun Batang 큰 숫자 + 작은 라벨.
2. **학기별 로드맵** — 화면 `Roadmap`과 같은 구조:
   - 연도 줄: 왼쪽에 Gowun Batang 큰 연도(화면 `text-[22px] font-bold text-ink-soft`), 오른쪽에 1학기·2학기 카드 두 칸. 인쇄는 grid 대신 **inline-block 2칸**(기존 PR #20 규칙 유지 — Safari는 grid 안 break-inside를 무시).
   - 학기 카드: 흰 속지(`--paper`) + `--line` 테두리 + 둥근 6px. 머리줄은 Gowun Batang “1학기” + 흐린 개월 표시, 아래 **잉크색 1.5px 밑줄**(화면 `border-b-[1.5px] border-ink/70`), 오른쪽에 학기 학점.
   - 과목 줄: 화면의 **줄 노트**(`.ruled`) 느낌 — 각 줄 아래 `--rule` 색 1px 실선(인쇄에서는 반복 그라디언트 대신 `border-bottom`으로 구현), 과목명 / 이수구분(흐린 작은 글자) / 학점(오른쪽 정렬 tabular-nums).
   - 가정 배치 과목: 화면처럼 빨간 작은 표시(`*` 또는 “가정”).
   - **교양은 자세히 쓰지 않는다**(사용자 이전 요청 유지): 학기 카드 안에 **“교양·선택 N학점” 한 줄**만, 화면의 교양 자리 표식(파란 점선 네모 9px + `--pen` 글자)으로. 개별 교양 자리(“교양 A”)·“미지정 … 직접 고르기”는 나열하지 않는다.
   - 전공 선택 자리(majorSlot)는 화면처럼 잉크색 점선 네모 + “전공 선택 N학점(400단위 M 포함)”.
   - **완료 학기 카드**: 화면처럼 테두리 `--red` + 카드 아래 “여기서 계획 완료” 빨간 도장 글씨.
   - **군 복무·휴학·교환 학기**: 화면은 빗금(`.hatch`, 반복 그라디언트) + 도장. 인쇄에서 반복 그라디언트는 **금지**(Safari 검정·패턴 문제) → `--paper-2` 단색 배경 + 가운데 회전된 도장 글씨(“군 복무”, “교환학생”, 테두리만)로 대체. 이 대체는 의도된 차이다.
   - 범례(화면 상단 범례와 같은 문구): 진로 그룹 색 점, 교양 자리, 중단 학기.
3. **학점 요약 · 졸업 요건** — PR #20의 ②·③ 내용(전공 100~300 / 400 / 교양·기타 / 총학점 / 누적, 졸업 요건 기준·계획·결과)은 **정보는 유지**하되 모양을 웹 톤으로:
   - 표 머리: `--paper-2` 배경 + `--ink-soft` 글자(파란 채움 머리줄 `#2d4a85` 제거).
   - 표 선: `--line`. 합계 줄: 위 1.5px 잉크 선 + 굵게.
   - 충족: `--sage` 배경 + `--sage-ink` 글자. 부족: `--red-soft` 배경 + `--red` 글자. 확인 필요: `--paper-2` + `--muted`.
   - 큰 “136 / 130 학점”은 Gowun Batang 큰 숫자, 충족이면 sage 동그라미 체크, 부족이면 빨간 도장 느낌.
   - 기준값이 없으면 지금처럼 “기준 확인 필요” — 숫자를 만들지 않는다.
4. **최종 검토 · 준비할 것 · 3줄 요약**
   - 화면의 **메모지**(`.memo-note`, `#fff4b8`) 또는 **형광펜**(`--marker` 밑줄) 느낌을 쓴다. 단 인쇄에서는 그림자 없이 단색 배경만. 형광펜은 `linear-gradient` 대신 **`background: var(--marker)` 단색 + 좁은 padding** 또는 `box-shadow: inset 0 -0.45em var(--marker)`(인쇄 시 box-shadow는 막혀 있으니 **단색 배경 방식만** 사용).
   - 체크리스트는 화면과 같은 체크 표시(☐/☑ 또는 같은 아이콘 모양), 사용자가 체크한 상태(`checked`) 반영.
   - 3줄 요약 번호는 파란 펜 동그라미(테두리만 또는 `--pen` 채움).
5. **쪽 바닥(footer)**: 화면 하단 문구와 같은 흐린 작은 글씨. 쪽마다 반복은 필요 없음.
6. **속지 질감**: 화면의 점 격자(`.paper` radial-gradient)는 인쇄에서 **쓰지 않는다**(그라디언트 금지). 배경은 흰색 또는 `--paper` 단색(`print-color-adjust: exact`를 `.print-doc` 루트에만 걸지 말고, 색 칸에만 — PR #20 규칙). 크림색 전체 배경을 넣을지 여부: **넣지 않는 것을 기본**으로(잉크 절약·Safari 안정성), 카드·표 머리 같은 작은 영역만 `--paper`/`--paper-2`.

### 4.4 구현 방법

- `PrintPlan.tsx`의 **데이터 계산 부분(rows, 학점 합계, reqs, review, summary3 등)은 재사용**하고 마크업·클래스만 웹 톤으로 바꾼다. 화면이 계산한 결과만 읽는다(재계산 금지, `simulatePlan` 다시 부르지 않음).
- 색은 하드코딩하지 말고 **`var(--paper)`, `var(--ink)` 등 CSS 변수**를 쓴다(화면과 자동으로 같아지게).
- 글꼴 크기는 pt로(본문 9~9.5pt, 과목 줄 8.5~9pt, 학기 이름 10.5~11pt Gowun Batang, 연도 14pt, 제목 18~20pt, 손글씨 라벨 12~13pt Nanum Pen Script — 손글씨는 같은 pt에서 작아 보이니 1.3배 정도 크게).
- 인쇄 금지 목록(유지): `mix-blend-mode`, 반투명 배경(`rgba`, `bg-*/10` 같은 Tailwind 불투명도), `linear/radial/repeating-gradient`, `box-shadow`, `filter`, `transform`(도장 회전은 예외로 `rotate`만 허용하되 Safari에서 검정 박스가 생기지 않는지 확인 — 문제가 있으면 회전 없이), 전역 `print-color-adjust: exact`.
  - 화면에서 `bg-pen/10`처럼 반투명으로 칠한 것(교양 자리 네모 등)은 인쇄용 **불투명 대체색**을 직접 계산해 쓴다(예: `--pen` 10% on white ≈ `#eaedf3`).
- 쪽 나눔 규칙(유지): 학기 카드·요약 표 한 묶음·검토 상자는 `break-inside: avoid`, 연도 줄 사이에서만 쪽이 넘어간다. 표 머리 반복(`thead { display: table-header-group }`).
- `@page { size: A4 portrait; margin: 14mm 12mm 16mm; }` 유지.

### 4.5 확인 (필수)

- headless Chrome(CDP `Page.printToPDF`, `printBackground: true`)으로 테스트 프로필 A–D와 “긴 계획”(학기당 9학점)을 PDF로 저장 → 쪽별 PNG로 변환해 **화면 03 다 스크린샷과 나란히 비교**. 이전 작업의 스크립트 방식(`print.mjs`)을 다시 써도 된다.
- 체크 항목:
  - 제목·학기 이름·큰 숫자가 **Gowun Batang**, 라벨 손글씨가 **Nanum Pen Script**로 찍혔는지(PDF 글꼴 목록: `pdffonts` 또는 `strings file.pdf | grep FontName`).
  - 색이 화면 토큰과 같은지(파란 채움 머리줄이 남아 있지 않은지).
  - 반투명·혼합·그라디언트 요소 0개(이전 스크립트의 `blends` 측정 = 0).
  - 화면 요소(버튼·탭·제본·채팅) 0개.
  - 학기 카드·표 묶음이 쪽 경계에서 잘리지 않음.
  - 교양은 학기마다 “교양·선택 N학점” 한 줄만.
  - `printBackground: false`(배경 그래픽 끔)로 저장해도 글자·선이 읽히는지(색 칸에 의존한 정보는 글자로도 표시: 충족/부족 문구).
- macOS Safari 수동 확인(파일 → PDF로 내보내기, ‘배경 프린트’ 켬/끔 둘 다)은 PR 본문에 결과 또는 “미확인”을 적는다.

---

## 5. 커밋 · PR

- 커밋 3개(역할별):
  1. `fix(transcript): 과목명 속 로마숫자를 성적으로 읽지 않기(구조화 성적 우선)` — transcriptImport.ts, route.ts 프롬프트 한 줄, 테스트.
  2. `fix(transcript): 검토 창을 body 포털로 띄워 반영 버튼이 항상 보이게, 총·전공 학점 필수 확인` — TranscriptImport.tsx, globals.css(`.step-in`), questions.ts, InputSteps.tsx, 테스트.
  3. `feat(print): PDF를 웹 화면과 같은 종이 다이어리 디자인으로` — PrintPlan.tsx, globals.css(`.print-doc`), OutputScreen.tsx(인쇄 전 `document.fonts.ready`).
- 커밋 메시지 끝: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`
- PR 본문: 증상·원인·수정·확인(Chrome 자동 / Safari 수동 여부)·남은 위험. 끝에 `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
- `npm run check && npm run build` 통과 후 PR. dev 서버를 띄운 채 `npm run build`를 하면 `.next`가 덮여 dev CSS가 깨지니 **build 전에 dev 서버를 멈춘다.**

## 6. 하지 말 것

- 총 이수학점을 과목 학점 합으로 채우기.
- 검토 창을 건너뛰고 인식 결과를 바로 반영하기.
- 성적표 이미지·인식 원문을 localStorage·서버·콘솔에 남기기.
- PDF에서 그라디언트·반투명·블렌드·그림자 다시 쓰기.
- PDF에서 교양 과목을 하나하나 나열하기.
- 확인되지 않은 졸업 기준 숫자 만들어 넣기.
- 실제 개인 성적표 스크린샷을 저장소에 커밋하기.
