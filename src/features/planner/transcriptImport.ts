import type { Course, TranscriptImageReply } from "@/contracts/types";

/**
 * 성적표·졸업사정 가져오기(검토 전 단계). 순수 함수만 둔다 — DOM·저장 없음.
 *
 * 흐름: 클립보드(HTML/TSV/텍스트) → SourceRow[] → parseTranscriptRows → TranscriptImportDraft
 *       → 사용자가 검토 화면에서 확인 → applyTranscriptImport로 한 번에 반영.
 *
 * 원칙
 * - 원문 행과 셀 위치를 유지한다. 여러 행을 한 줄로 합쳐 과목명을 찾지 않는다.
 * - 글자 혼동(O/0, I/1, S/5)이 의심되는 과목은 자동 확정하지 않는다.
 * - 개별 과목 학점 합계를 공식 총 이수학점으로 쓰지 않는다. 포털 요약값을 사용자가 고른다.
 * - 전공학점은 총학점에 포함된다. 더하지 않는다.
 * - 이름·학번 등 개인정보 행은 계산에 쓰지 않고 결과에도 남기지 않는다.
 */

export type TranscriptImportSource = "clipboard_html" | "clipboard_text" | "image_ai";
export type MatchKind = "exact_code" | "exact_name" | "normalized_name" | "ocr_suggestion" | "unmatched";
export type CourseStatus = "completed" | "in_progress" | "failed" | "withdrawn" | "unknown";
export type Confidence = "high" | "medium" | "low";

/** 원문 한 행. cells는 표의 셀(또는 탭/2칸 이상 공백으로 나눈 조각) */
export interface SourceRow {
  index: number;
  cells: string[];
  raw: string;
}

export interface DetectedValue {
  value: number;
  sourceRow: number;
  rawText: string;
  /** 어느 표·열에서 읽었는지(예: "졸업학점 · 취득") */
  label: string;
  confidence: Confidence;
}

export interface DetectedCourseRow {
  id: string;
  sourceRow: number;
  rawText: string;
  detectedCode: string | null;
  detectedName: string | null;
  detectedCredits: number | null;
  detectedCategory: string | null;
  detectedGrade: string | null;
  detectedStatus: CourseStatus;
  matchedCourseCode: string | null;
  /** 애매한 행의 후보(학수번호). 사용자가 하나를 고른다 */
  candidateCodes: string[];
  matchKind: MatchKind;
  selected: boolean;
}

export interface TranscriptImportDraft {
  source: TranscriptImportSource;
  /** table = 행·셀 구조 그대로, vertical = 한 줄에 셀 하나씩이라 학수번호 기준으로 묶음 */
  layout: "table" | "vertical";
  rowCount: number;
  /** 값 후보. 둘 이상이면 사용자가 고른다. 비어 있으면 찾지 못함 */
  earnedCredits: DetectedValue[];
  earnedMajorCredits: DetectedValue[];
  targetCredits: DetectedValue[];
  /** 학과 자료와 맞춘 완료 과목(재수강 중복은 한 번만) */
  completed: DetectedCourseRow[];
  inProgress: DetectedCourseRow[];
  /** F·W·NP 등 완료로 넣지 않는 행 */
  notCompleted: DetectedCourseRow[];
  /** 확인이 필요한 매칭(OCR 유사 후보, 성적 표기 불명) */
  ambiguous: DetectedCourseRow[];
  /** 학과 자료에 없는 과목·읽지 못한 행(버리지 않는다) */
  unrecognizedLines: string[];
  /** 매칭된 과목 행의 학점 합계(참고용 — 공식 총 이수학점 아님) */
  courseCreditSum: number;
  /** 계산에서 뺀 개인정보 행 수 */
  personalRowsSkipped: number;
  warnings: string[];
}

// ── 원문 → 행 ────────────────────────────────────────────

/** 일반 텍스트·TSV를 행으로 나눈다. 탭이 있으면 탭, 없으면 2칸 이상 공백, 그것도 없으면 공백 하나로 나눈다. */
export function rowsFromText(text: string): SourceRow[] {
  // 전각 문자(Ａ１２)·호환 문자를 일반 문자로, 줄바꿈 없는 공백(nbsp)을 공백으로
  const lines = text.normalize("NFKC").replace(/\u00a0/g, " ").replace(/\r\n?/g, "\n").split("\n");
  const rows: SourceRow[] = [];
  lines.forEach((line) => {
    const raw = line.trim();
    if (!raw) return;
    const cells = (raw.includes("\t") ? raw.split("\t") : /\s{2,}/.test(raw) ? raw.split(/\s{2,}/) : raw.split(/\s+/))
      .map((c) => c.trim())
      .filter((c) => c !== "");
    rows.push({ index: rows.length, cells, raw });
  });
  return rows;
}

/** HTML 표에서 꺼낸 셀 배열을 행으로 만든다(DOM 파싱은 화면 쪽에서) */
export function rowsFromTable(table: string[][]): SourceRow[] {
  return table
    .map((cells) => cells.map((c) => c.normalize("NFKC").replace(/\s+/g, " ").trim()))
    .filter((cells) => cells.some((c) => c !== ""))
    .map((cells, index) => ({ index, cells: cells.filter((c) => c !== ""), raw: cells.filter((c) => c !== "").join("\t") }));
}

/**
 * 스크린샷 인식 결과(여러 장) → 행. 과목은 셀 순서를 고정하고, 요약 학점은 "레이블\t숫자" 행으로 만든다.
 * 그 뒤는 붙여넣기와 같은 파서·검토 창을 거친다(학과 자료 매칭·사용자 확인).
 */
export function rowsFromVision(replies: TranscriptImageReply[]): SourceRow[] {
  const lines: string[][] = [];
  for (const r of replies) {
    for (const x of r.rows) {
      const cells = [x.term, x.category, x.code, x.name, x.credits === null ? null : String(x.credits), x.grade].map((c) => (c ?? "").toString().trim());
      if (cells.some((c) => c)) lines.push(cells);
    }
    const s = r.summary;
    if (s.earnedCredits !== null) lines.push(["총 이수학점", String(s.earnedCredits)]);
    if (s.majorCredits !== null) lines.push(["전공 이수학점", String(s.majorCredits)]);
    if (s.targetCredits !== null) lines.push(["졸업학점", String(s.targetCredits)]);
  }
  return lines.map((cells, index) => ({ index, cells: cells.filter((c) => c !== ""), raw: cells.filter((c) => c !== "").join("\t") }));
}

// ── 정규화 ───────────────────────────────────────────────

const squash = (s: string) => s.replace(/\s+/g, "").toUpperCase();
/** 공백·가운뎃점·괄호·하이픈 등 기호를 뺀 이름 비교용 */
const looseName = (s: string) => squash(s).replace(/[·・.,:;()[\]{}<>\-_/'"“”‘’~]/g, "");
/** 학수번호 비교용: 대문자, 공백·하이픈 제거 */
export const normalizeCode = (s: string) => s.toUpperCase().replace(/[\s-]/g, "");

/** 학수번호처럼 보이는가(영문 1~4자 + 숫자 4자리, 하이픈·공백 허용) */
const CODE_LIKE = /^[A-Z][A-Z0-9]{0,3}\d{4}$/;
/** OCR로 숫자 자리에 O·I·S 등이 섞인 학수번호(뒤 4자리 중 숫자 1개 이상) */
const CODE_LIKE_OCR = /^[A-Z0-9][A-Z0-9]{0,3}[0-9OISLB]{4}$/;
const ocrCodeLike = (c: string) => CODE_LIKE_OCR.test(c) && /[A-Z]/.test(c.slice(0, -4) || "X") && (c.slice(-4).match(/\d/g)?.length ?? 0) >= 1;
/** 한 셀 안에서 학수번호 조각 찾기(OCR로 공백·하이픈이 끼어든 경우 포함) */
const CODE_IN_TEXT = /\b[A-Za-z0-9](?:[\s-]?[A-Za-z0-9]){1,3}[\s-]?\d{4}\b/g;

const LETTERS_FROM_DIGITS: Record<string, string> = { "0": "O", "1": "I", "5": "S", "8": "B" };
const DIGITS_FROM_LETTERS: Record<string, string> = { O: "0", I: "1", L: "1", S: "5", B: "8" };

/** OCR 혼동을 바로잡은 학수번호 후보(자동 확정하지 않는다) */
function ocrVariants(code: string): string[] {
  const m = code.match(/^(.*?)(.{4})$/);
  if (!m) return [];
  const head = [...m[1]].map((c) => LETTERS_FROM_DIGITS[c] ?? c).join("");
  const tail = [...m[2]].map((c) => DIGITS_FROM_LETTERS[c] ?? c).join("");
  const fixed = head + tail;
  return fixed !== code ? [fixed] : [];
}

// ── 성적·상태 ────────────────────────────────────────────

const PASS_GRADE = /^(A\+|A0|A|A-|B\+|B0|B|B-|C\+|C0|C|C-|D\+|D0|D|D-|P|S)$/i;
const FAIL_GRADE = /^(F|NP|U)$/i;
const WITHDRAWN = /^(W|철회|수강철회|드랍|DROP)$/i;
const IN_PROGRESS = /^(수강중|수강 중|이수중|진행중|성적미입력|미입력|신청|수강신청)$/;
/** 성적처럼 보이지만 이 학교 규칙을 확인하지 못한 표기 */
const UNKNOWN_GRADE = /^(I|IP|N|R|E|AU|T)$/i;
const CATEGORY = /^(전공(기초|핵심|심화|필수|선택)?(\(필수\))?|교양(필수|선택|핵심)?|핵심교양|기초필수|일반선택|일반교양|타전공|복수전공|부전공|교직)$/;

function statusOf(cells: string[]): { grade: string | null; status: CourseStatus } {
  // "A+ / 4.5"처럼 한 셀에 성적과 다른 값이 같이 있으면 조각으로 나눠 본다
  const tokens = cells.flatMap((c) => [c, ...c.split(/[\s/|()]+/)]).filter(Boolean);
  for (const c of tokens) {
    const t = c.trim();
    if (IN_PROGRESS.test(t)) return { grade: t, status: "in_progress" };
    if (WITHDRAWN.test(t)) return { grade: t, status: "withdrawn" };
    if (FAIL_GRADE.test(t)) return { grade: t.toUpperCase(), status: "failed" };
    if (PASS_GRADE.test(t)) return { grade: t.toUpperCase(), status: "completed" };
    if (UNKNOWN_GRADE.test(t)) return { grade: t.toUpperCase(), status: "unknown" };
  }
  return { grade: null, status: "unknown" };
}

// ── 학점 요약 ────────────────────────────────────────────

const PERSONAL = /(성명|이름|학번|생년월일|주민|주소|연락처|전화|휴대폰|이메일|e-?mail)/i;
/** 학점 요약으로 착각하면 안 되는 행 */
const NOT_CREDIT = /(GPA|평점|평균|백분위|석차|신청학점|수강학점|이번\s*학기|학년|영어\s*(전용|강좌)|횟수|과목\s*수|번호)/i;
const TOTAL_EARNED = /^(총\s*이수\s*학점|총\s*취득\s*학점|취득\s*학점(\s*계)?|이수\s*학점(\s*계|\s*합계)?|총\s*학점|누계\s*취득)$/;
const MAJOR_EARNED = /^(전공\s*(이수|취득)?\s*학점(\s*계)?|전공\s*계|전공)$/;
const GRAD_TOTAL = /^(졸업\s*학점|졸업\s*이수\s*학점|졸업\s*기준\s*학점|졸업\s*요건\s*학점)$/;
const COLUMN_WORDS = /^(배당|기준|요건|필요|취득|이수|부족|잔여)$/;
const isNum = (s: string) => /^\d{1,3}(\.\d)?$/.test(s.trim());

interface Header {
  row: number;
  cols: Array<{ index: number; word: string }>;
}

function findHeader(rows: SourceRow[], before: number): Header | null {
  for (let i = before - 1; i >= 0 && i >= before - 30; i--) {
    const cols = rows[i].cells.flatMap((c, index) => (COLUMN_WORDS.test(c.trim()) ? [{ index, word: c.trim() }] : []));
    if (cols.length >= 2) return { row: i, cols };
  }
  return null;
}

function summaryValues(rows: SourceRow[]) {
  const earned: DetectedValue[] = [];
  const major: DetectedValue[] = [];
  const target: DetectedValue[] = [];
  for (const r of rows) {
    const label = r.cells[0]?.trim() ?? "";
    if (!label || NOT_CREDIT.test(label)) continue;
    const isGrad = GRAD_TOTAL.test(label);
    const isTotal = TOTAL_EARNED.test(label);
    const isMajor = MAJOR_EARNED.test(label);
    if (!isGrad && !isTotal && !isMajor) {
      // "총 이수학점 : 36" 처럼 한 셀 안에 레이블과 숫자가 같이 있는 경우
      const m = r.raw.match(/^(.*?)[\s:：=]+(\d{1,3})\s*(학점)?$/);
      if (m && !NOT_CREDIT.test(m[1])) {
        const l = m[1].trim();
        const v = Number(m[2]);
        if (TOTAL_EARNED.test(l)) earned.push({ value: v, sourceRow: r.index, rawText: r.raw, label: l, confidence: "high" });
        else if (MAJOR_EARNED.test(l)) major.push({ value: v, sourceRow: r.index, rawText: r.raw, label: l, confidence: "high" });
        else if (GRAD_TOTAL.test(l)) target.push({ value: v, sourceRow: r.index, rawText: r.raw, label: l, confidence: "medium" });
      }
      continue;
    }
    const nums = r.cells.slice(1).map((c, i) => ({ c: c.trim(), i: i + 1 })).filter((x) => isNum(x.c));
    if (nums.length === 0) continue;
    const header = findHeader(rows, r.index);
    // 열 머리(배당·취득 등)와 셀 위치가 맞으면 열 이름으로 읽는다
    const byCol = (words: RegExp) => {
      const col = header?.cols.find((c) => words.test(c.word));
      if (!col) return null;
      const cell = r.cells[col.index]?.trim();
      return cell && isNum(cell) ? Number(cell) : null;
    };
    const earnedCol = byCol(/^(취득|이수)$/);
    const requiredCol = byCol(/^(배당|기준|요건|필요)$/);
    const mk = (value: number, col: string, confidence: Confidence): DetectedValue => ({ value, sourceRow: r.index, rawText: r.raw, label: col ? `${label} · ${col}` : label, confidence });

    if (isGrad || (isMajor && header)) {
      // 졸업사정 표: 배당(기준) = 목표, 취득 = 이수
      if (isGrad && requiredCol !== null) target.push(mk(requiredCol, "기준", "high"));
      if (earnedCol !== null) (isMajor ? major : earned).push(mk(earnedCol, "취득", "high"));
      if (header === null || (requiredCol === null && earnedCol === null)) {
        // 열을 모르면 숫자를 어느 값으로 단정하지 않는다 — 모두 낮은 신뢰 후보로
        for (const n of nums) (isGrad ? target : isMajor ? major : earned).push(mk(Number(n.c), "열 확인 필요", "low"));
      }
      continue;
    }
    if (nums.length === 1) (isMajor ? major : earned).push(mk(Number(nums[0].c), "", "high"));
    else for (const n of nums) (isMajor ? major : earned).push(mk(Number(n.c), "열 확인 필요", "low"));
  }
  const dedupe = (xs: DetectedValue[]) => xs.filter((x, i) => xs.findIndex((y) => y.value === x.value && y.sourceRow === x.sourceRow) === i);
  return { earned: dedupe(earned), major: dedupe(major), target: dedupe(target) };
}

// ── 과목 행 ──────────────────────────────────────────────

function findCode(cells: string[], byCode: Map<string, Course>) {
  for (let i = 0; i < cells.length; i++) {
    const c = normalizeCode(cells[i]);
    if (CODE_LIKE.test(c)) return { code: c, cell: i, course: byCode.get(c) ?? null };
  }
  for (let i = 0; i < cells.length; i++) {
    for (const m of cells[i].matchAll(CODE_IN_TEXT)) {
      const c = normalizeCode(m[0]);
      if (CODE_LIKE.test(c)) return { code: c, cell: i, course: byCode.get(c) ?? null };
    }
  }
  for (let i = 0; i < cells.length; i++) {
    const c = normalizeCode(cells[i]);
    if (ocrCodeLike(c)) return { code: c, cell: i, course: null };
  }
  return null;
}

function findName(cells: string[], byName: Map<string, Course>, byLoose: Map<string, Course>) {
  // 같은 행 안에서 이웃한 셀(최대 5개)만 이어 붙여 본다 — 다른 행과 합치지 않는다
  for (let len = Math.min(5, cells.length); len >= 1; len--) {
    for (let i = 0; i + len <= cells.length; i++) {
      const joined = cells.slice(i, i + len).join("");
      const exact = byName.get(squash(joined));
      if (exact) return { course: exact, cell: i, len, kind: "exact_name" as const };
      const loose = byLoose.get(looseName(joined));
      if (loose) return { course: loose, cell: i, len, kind: "normalized_name" as const };
    }
  }
  return null;
}

function creditsNear(cells: string[], from: number): number | null {
  for (let i = from + 1; i < cells.length; i++) {
    const t = cells[i].trim();
    // "3", "3.0", "2.00" 모두 학점으로(평점 "4.50"·점수 "96.7"은 범위·형식이 달라 제외)
    if (/^[1-4](\.0+)?$/.test(t)) return Number(t);
  }
  return null;
}

const looksLikeCourseRow = (r: SourceRow) => r.cells.some((c) => CODE_LIKE.test(normalizeCode(c))) || r.cells.some((c) => PASS_GRADE.test(c) || FAIL_GRADE.test(c) || WITHDRAWN.test(c));
const isTermHeader = (raw: string) => /^\d{4}\s*(학년도|년)?\s*[-.]?\s*(1|2|여름|겨울|하계|동계)\s*(학기|계절)?/.test(raw.trim()) && raw.trim().length < 30;

/**
 * 한 줄에 셀 하나씩 붙어 나온 경우(포털 표가 div 격자라 Ctrl+A 복사 시 셀마다 줄바꿈)
 * 학수번호처럼 보이는 줄에서 새 행을 시작해 다음 학수번호 줄 전까지 묶는다.
 * 학수번호 줄이 거의 없으면 원래 행을 그대로 쓴다.
 */
/** 이름·학번 등 개인정보 행(계산·입력칸에 쓰지 않는다) */
export const isPersonalRow = (r: SourceRow) => PERSONAL.test(r.cells[0] ?? "") || (PERSONAL.test(r.raw) && !looksLikeCourseRow(r));

export function regroupVertical(rows: SourceRow[]): { rows: SourceRow[]; layout: "table" | "vertical" } {
  if (rows.length < 6) return { rows, layout: "table" };
  // 한 줄에 셀 하나(공백이 든 과목명·레이블은 공백 하나로 나뉘어도 탭·2칸 공백이 없으면 한 셀로 본다)
  const single = rows.filter((r) => r.cells.length <= 1 || !/\t|\s{2,}/.test(r.raw)).length;
  const isCode = (r: SourceRow) => r.cells.length === 1 && CODE_LIKE.test(normalizeCode(r.cells[0]));
  const codes = rows.filter(isCode).length;
  if (single / rows.length < 0.7 || codes < 2) return { rows, layout: "table" };
  // 학점 요약 레이블 줄 + 다음 숫자 줄은 한 행으로 붙이고, 과목 묶음에 섞이지 않게 한다
  const paired: SourceRow[] = [];
  const summary = new Set<SourceRow>();
  const isLabel = (t: string) => TOTAL_EARNED.test(t) || MAJOR_EARNED.test(t) || GRAD_TOTAL.test(t) || NOT_CREDIT.test(t) || COLUMN_WORDS.test(t);
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const n = rows[i + 1];
    const label = r.raw.trim();
    if (label.length <= 20 && /(학점|평점|GPA|졸업)/i.test(label) && isLabel(label) && n && isNum(n.raw)) {
      const row = { index: r.index, cells: [label, n.raw.trim()], raw: `${r.raw}\t${n.raw}` };
      summary.add(row);
      paired.push(row);
      i++;
    } else paired.push(r);
  }
  const out: SourceRow[] = [];
  let cur: SourceRow | null = null;
  const MAX_CELLS = 10;
  for (const r of paired) {
    if (summary.has(r)) {
      if (cur) out.push(cur);
      cur = null;
      out.push(r);
      continue;
    }
    if (isCode(r)) {
      if (cur) out.push(cur);
      // 바로 앞 줄이 연도·학기면 같은 행으로 본다
      cur = { index: r.index, cells: [...r.cells], raw: r.raw };
      continue;
    }
    if (cur && cur.cells.length < MAX_CELLS && !PERSONAL.test(r.raw)) {
      cur.cells.push(...r.cells);
      cur.raw += "\t" + r.raw;
    } else {
      if (cur) {
        out.push(cur);
        cur = null;
      }
      out.push(r);
    }
  }
  if (cur) out.push(cur);
  return { rows: out.map((r, i) => ({ ...r, index: i })), layout: "vertical" };
}

export function parseTranscriptRows(rawRows: SourceRow[], courses: Course[], source: TranscriptImportSource): TranscriptImportDraft {
  const { rows, layout } = regroupVertical(rawRows);
  const byCode = new Map(courses.map((c) => [normalizeCode(c.code), c]));
  const byName = new Map(courses.map((c) => [squash(c.name), c]));
  const byLoose = new Map(courses.map((c) => [looseName(c.name), c]));

  let personal = 0;
  const safeRows = rows.filter((r) => {
    if (PERSONAL.test(r.cells[0] ?? "") || (PERSONAL.test(r.raw) && !looksLikeCourseRow(r))) {
      personal++;
      return false;
    }
    return true;
  });
  const summary = summaryValues(safeRows);
  const summaryRows = new Set([...summary.earned, ...summary.major, ...summary.target].map((v) => v.sourceRow));
  const header = (r: SourceRow) => r.cells.filter((c) => /^(학수번호|과목명|교과목명|과목코드|학점|성적|등급|이수구분|구분|년도|학기)$/.test(c.trim())).length >= 2;

  const detected: DetectedCourseRow[] = [];
  const unrecognized: string[] = [];
  const warnings: string[] = [];
  for (const r of safeRows) {
    if (summaryRows.has(r.index) || header(r) || (isTermHeader(r.raw) && r.cells.length <= 2 && !looksLikeCourseRow(r))) continue;
    if (r.cells.some((c) => COLUMN_WORDS.test(c.trim())) && !looksLikeCourseRow(r)) continue;
    const code = findCode(r.cells, byCode);
    const name = code?.course ? null : findName(r.cells, byName, byLoose);
    const { grade, status } = statusOf(r.cells);
    const category = r.cells.find((c) => CATEGORY.test(c.trim()))?.trim() ?? null;
    const base = {
      id: `row-${r.index}`,
      sourceRow: r.index,
      rawText: r.raw,
      detectedGrade: grade,
      detectedStatus: status,
      detectedCategory: category,
    };

    if (code?.course || name) {
      const course = (code?.course ?? name!.course)!;
      if (code?.course) {
        const other = findName(r.cells.filter((_, i) => i !== code.cell), byName, byLoose);
        if (other && other.course.code !== course.code)
          warnings.push(`행 ${r.index + 1}: 학수번호(${course.code} ${course.name})와 과목명(${other.course.name})이 달라요. 학수번호 기준으로 넣었어요 — 확인해 주세요.`);
      }
      const at = code?.course ? code.cell : name!.cell + name!.len - 1;
      detected.push({
        ...base,
        detectedCode: code?.code ?? null,
        detectedName: code?.course ? r.cells.find((c, i) => i !== code.cell && /[가-힣A-Za-z]{2,}/.test(c) && !CATEGORY.test(c) && !PASS_GRADE.test(c)) ?? null : r.cells.slice(name!.cell, name!.cell + name!.len).join(" "),
        detectedCredits: creditsNear(r.cells, at),
        matchedCourseCode: course.code,
        candidateCodes: [course.code],
        matchKind: code?.course ? "exact_code" : name!.kind,
        selected: status === "completed" || status === "in_progress",
      });
      continue;
    }

    // 학수번호처럼 보이지만 자료에 없음 → OCR 혼동이면 후보만 제안
    if (code) {
      const variants = /[0OIl15S]/.test(code.code) ? ocrVariants(code.code).filter((v) => byCode.has(v)) : [];
      if (variants.length > 0) {
        detected.push({
          ...base,
          detectedCode: code.code,
          detectedName: null,
          detectedCredits: creditsNear(r.cells, code.cell),
          matchedCourseCode: null,
          candidateCodes: variants.map((v) => byCode.get(v)!.code),
          matchKind: "ocr_suggestion",
          selected: false,
        });
        continue;
      }
    }
    // 자료에 없는 과목(교양·타과·편입 인정 등)과 읽지 못한 행은 버리지 않는다
    if (r.raw.replace(/[\s\-–—|]/g, "").length > 1) unrecognized.push(r.raw);
  }

  // 같은 과목이 여러 행에 나오면 완료는 한 번만, 재수강 가능성 경고
  const seen = new Map<string, DetectedCourseRow>();
  const completed: DetectedCourseRow[] = [];
  const inProgress: DetectedCourseRow[] = [];
  const notCompleted: DetectedCourseRow[] = [];
  const ambiguous: DetectedCourseRow[] = [];
  const name = (code: string) => courses.find((c) => c.code === code)?.name ?? code;
  for (const d of detected) {
    if (d.matchKind === "ocr_suggestion") {
      ambiguous.push(d);
      continue;
    }
    const code = d.matchedCourseCode!;
    if (d.detectedStatus === "failed" || d.detectedStatus === "withdrawn") {
      notCompleted.push({ ...d, selected: false });
      continue;
    }
    if (d.detectedStatus === "in_progress") {
      inProgress.push(d);
      continue;
    }
    if (d.detectedStatus === "unknown" && d.detectedGrade !== null) {
      // 성적 표기가 이 학교 규칙으로 확인되지 않음 → 완료로 단정하지 않는다
      ambiguous.push({ ...d, selected: false });
      continue;
    }
    const prev = seen.get(code);
    if (prev) {
      warnings.push(`${name(code)}이(가) 여러 번 나와요(행 ${prev.sourceRow + 1}, ${d.sourceRow + 1}). 재수강일 수 있어 한 번만 넣었어요.`);
      continue;
    }
    seen.set(code, d);
    completed.push(d.detectedStatus === "unknown" ? { ...d, selected: true } : d);
  }
  // 이미 완료된 과목이 F·W로 다시 나오면 미완료 쪽은 정보로만
  const failedButPassed = notCompleted.filter((d) => seen.has(d.matchedCourseCode!));
  if (failedButPassed.length > 0) warnings.push(`F·W 기록이 있지만 다른 학기에 통과한 과목: ${failedButPassed.map((d) => name(d.matchedCourseCode!)).join(", ")}`);

  const courseCreditSum = completed.reduce((s, d) => s + (d.detectedCredits ?? courses.find((c) => c.code === d.matchedCourseCode)?.credits ?? 0), 0);
  if (summary.earned.length > 1) warnings.push("총 이수학점 후보가 여러 개예요. 포털 요약값을 골라 주세요.");
  if (summary.earned.length === 1 && summary.earned[0].value !== courseCreditSum && completed.length > 0)
    warnings.push(`포털 총 이수학점(${summary.earned[0].value})과 찾은 학과 과목 학점 합(${courseCreditSum})이 달라요. 교양·타과·인정 학점 때문일 수 있어요 — 포털 값을 확인해 주세요.`);
  const maxMajor = Math.max(0, ...summary.major.map((v) => v.value));
  const maxEarned = Math.max(0, ...summary.earned.map((v) => v.value));
  if (summary.major.length > 0 && summary.earned.length > 0 && Math.min(...summary.major.map((v) => v.value)) > maxEarned)
    warnings.push(`전공학점(${maxMajor})이 총 이수학점보다 커요. 전공학점은 총학점 안에 포함돼요 — 값을 확인해 주세요.`);

  return {
    source,
    layout,
    rowCount: rawRows.length,
    earnedCredits: summary.earned,
    earnedMajorCredits: summary.major,
    targetCredits: summary.target,
    completed,
    inProgress,
    notCompleted,
    ambiguous,
    unrecognizedLines: unrecognized,
    courseCreditSum,
    personalRowsSkipped: personal,
    warnings,
  };
}

// ── 반영 ─────────────────────────────────────────────────

export interface ImportChoice {
  /** 사용자가 고르거나 고친 값. null = 기존값 유지 */
  earnedCredits: number | null;
  earnedMajorCredits: number | null;
  targetCredits: number | null;
  /** 완료로 반영할 학수번호 */
  completedCodes: string[];
  mode: "merge" | "replace";
}

export interface ProgressFields {
  earnedCredits: number | null;
  earnedMajorCredits: number | null;
  targetCredits: number | null;
  completedCourseCodes: string[];
}

/** 반영 전에 막을 문제. 없으면 null */
export function importProblem(choice: ImportChoice, current: ProgressFields): string | null {
  const total = choice.earnedCredits ?? current.earnedCredits;
  const major = choice.earnedMajorCredits ?? current.earnedMajorCredits;
  for (const v of [choice.earnedCredits, choice.earnedMajorCredits, choice.targetCredits]) if (v !== null && (!Number.isFinite(v) || v < 0)) return "학점은 0 이상이어야 해요.";
  if (total !== null && major !== null && major > total) return "전공학점은 총 이수학점 안에 포함돼요. 총학점보다 클 수 없어요.";
  if (choice.targetCredits !== null && choice.targetCredits <= 0) return "목표학점은 0보다 커야 해요.";
  return null;
}

/** 확인한 값만 한 번에 반영. merge = 과목 합치기(중복 제거), replace = 과목 목록 교체. 숫자는 고른 값만 바꾼다 */
export function applyTranscriptImport(current: ProgressFields, choice: ImportChoice): ProgressFields {
  const codes = choice.mode === "replace" ? choice.completedCodes : [...current.completedCourseCodes, ...choice.completedCodes];
  return {
    earnedCredits: choice.earnedCredits ?? current.earnedCredits,
    earnedMajorCredits: choice.earnedMajorCredits ?? current.earnedMajorCredits,
    targetCredits: choice.targetCredits ?? current.targetCredits,
    completedCourseCodes: [...new Set(codes)],
  };
}

/** 검토 화면 첫 줄 */
export function importSummary(d: TranscriptImportDraft): string {
  const nums = [d.earnedCredits.length > 0 && "총 이수학점", d.earnedMajorCredits.length > 0 && "전공학점", d.targetCredits.length > 0 && "졸업 기준학점"].filter(Boolean);
  const check = d.ambiguous.length + (d.earnedCredits.length > 1 ? 1 : 0) + (d.earnedMajorCredits.length > 1 ? 1 : 0);
  return (
    `${d.rowCount}개 행을 읽었고, 학과 과목 ${d.completed.length + d.inProgress.length}개` +
    (nums.length > 0 ? `와 ${nums.join("·")} 후보를 찾았어요.` : "를 찾았어요.") +
    (check > 0 ? ` 애매한 항목 ${check}개만 확인하면 한 번에 반영할 수 있어요.` : " 확인하고 한 번에 반영하세요.")
  );
}
