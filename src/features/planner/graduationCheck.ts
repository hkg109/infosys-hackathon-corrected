/**
 * 개인 졸업사정 조회 결과(붙여넣기) 읽기. 브라우저 안에서만 처리한다.
 * - 열(배당·취득)이 분명한 줄만 값으로 인식한다.
 * - 숫자 개수가 열 수와 맞지 않는 줄은 어느 열 값인지 단정하지 않고 "확인 필요"로 남긴다.
 * - 읽은 값은 이 학생 한 명의 입력값이다. 학교 공통 졸업요건으로 저장하지 않는다.
 */

export type ParsedStatus = "clear" | "ambiguous" | "missing";

export interface ParsedRow {
  label: string;
  raw: string;
  /** 열 이름 → 값. 모호하면 비어 있다 */
  values: Record<string, number>;
  status: ParsedStatus;
  note: string | null;
}

export interface GraduationCheckParse {
  columns: string[];
  rows: ParsedRow[];
  /** 목표 졸업학점(배당) */
  target: { value: number | null; status: ParsedStatus };
  /** 취득학점 */
  earned: { value: number | null; status: ParsedStatus };
  /** 전공 취득학점 */
  majorEarned: { value: number | null; status: ParsedStatus };
}

const COLUMN_WORDS = ["배당", "기준", "취득", "부족"];
const TOTAL_LABEL = /^(졸업학점|총학점|졸업이수학점|총이수학점)$/;
const MAJOR_LABEL = /^(전공|전공학점|전공계)$/;

function columnsOf(lines: string[]): string[] {
  for (const l of lines) {
    const words = l.split(/\s+/).filter(Boolean);
    const cols = words.filter((w) => COLUMN_WORDS.includes(w));
    if (cols.length >= 2) return cols;
  }
  return [];
}

export function parseGraduationCheck(text: string): GraduationCheckParse {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("["));
  const columns = columnsOf(lines);
  const rows: ParsedRow[] = [];
  for (const raw of lines) {
    const cells = raw.split(/\t|\s{2,}|\s+/).filter(Boolean);
    if (cells.length < 2 || COLUMN_WORDS.includes(cells[1]) || COLUMN_WORDS.includes(cells[0])) continue;
    const label = cells[0];
    const nums = cells.slice(1).filter((c) => /^\d+(\.\d+)?$/.test(c)).map(Number);
    if (nums.length === 0) {
      rows.push({ label, raw, values: {}, status: "missing", note: "숫자가 없어 읽지 않았어요." });
      continue;
    }
    if (columns.length > 0 && nums.length === columns.length) {
      rows.push({ label, raw, values: Object.fromEntries(columns.map((c, i) => [c, nums[i]])), status: "clear", note: null });
    } else {
      rows.push({
        label,
        raw,
        values: {},
        status: "ambiguous",
        note:
          columns.length === 0
            ? "열 이름(배당·취득)을 찾지 못해 값을 정하지 않았어요."
            : `숫자 ${nums.length}개가 열 ${columns.length}개(${columns.join("·")})와 맞지 않아 어느 열 값인지 정하지 않았어요.`,
      });
    }
  }

  const pick = (re: RegExp, col: string) => {
    const r = rows.find((x) => re.test(x.label));
    if (!r) return { value: null, status: "missing" as const };
    if (r.status !== "clear" || r.values[col] === undefined) return { value: null, status: "ambiguous" as const };
    return { value: r.values[col], status: "clear" as const };
  };
  const targetCol = columns.find((c) => c === "배당" || c === "기준") ?? "배당";
  return {
    columns,
    rows,
    target: pick(TOTAL_LABEL, targetCol),
    earned: pick(TOTAL_LABEL, "취득"),
    majorEarned: pick(MAJOR_LABEL, "취득"),
  };
}
