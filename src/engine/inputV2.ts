import type { BreakPeriod, CareerTrack, InputIssue, ISODate, PeriodInput, PlanInput, PlanInputV2 } from "@/contracts/types";
import { isValidDate, overlaps, termRange } from "./terms";

/** [startDate, endDate) 형태로 확정할 수 있는 기간. 길이를 모르면 null(추측하지 않는다). */
export function resolvePeriodRange(p: PeriodInput): { start: ISODate; end: ISODate } | null {
  if (p.timing !== "fixed" || !p.startDate) return null;
  if (p.endDate) return { start: p.startDate, end: p.endDate };
  if (p.durationMonths !== null) return { start: p.startDate, end: addMonths(p.startDate, p.durationMonths) };
  if (p.returnTerm) return { start: p.startDate, end: termRange(p.returnTerm).start };
  return null;
}

/** YYYY-MM-DD에 개월 수를 더한다. 말일을 넘으면 그 달 말일로 맞춘다. */
export function addMonths(date: ISODate, months: number): ISODate {
  const [y, m, d] = date.split("-").map(Number);
  const total = y * 12 + (m - 1) + months;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  const last = new Date(Date.UTC(ny, nm, 0)).getUTCDate();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${ny}-${pad(nm)}-${pad(Math.min(d, last))}`;
}

const KIND_LABEL: Record<PeriodInput["kind"], string> = { military: "군 복무", leave: "휴학", exchange: "교환학생" };
const CAREERS: CareerTrack[] = ["security", "data"];

const isNonNegInt = (n: number) => Number.isInteger(n) && n >= 0;
const isNonNeg = (n: number) => Number.isFinite(n) && n >= 0;

/**
 * v2 입력 검증. error = 입력 오류(계산하지 않음), missing = 정보 부족(부분 결과로 계속).
 * field는 화면이 오류 위치를 표시하는 경로다.
 */
export function validatePlanInputV2(input: PlanInputV2): InputIssue[] {
  const issues: InputIssue[] = [];
  const err = (field: string, message: string) => issues.push({ severity: "error", field, message });
  const miss = (field: string, message: string, impact: string) =>
    issues.push({ severity: "missing", field, message, impact });

  const { startTerm, progress } = input;
  if (startTerm === null) miss("startTerm", "계획 시작 학기가 없습니다.", "학기별 배치와 후보를 만들 수 없습니다.");
  else if (!Number.isInteger(startTerm.year) || (startTerm.season !== 1 && startTerm.season !== 2))
    err("startTerm", "시작 학기를 확인해 주세요.");

  if (progress.completedTerms === null)
    miss("progress.completedTerms", "인정 유효학기 수가 없습니다.", "학년 진행을 계산할 수 없습니다.");
  else if (!isNonNegInt(progress.completedTerms)) err("progress.completedTerms", "인정 유효학기는 0 이상의 정수여야 합니다.");

  if (progress.earnedCredits === null)
    miss("progress.earnedCredits", "총 이수학점이 없습니다.", "남은 학점과 완료 학기를 계산할 수 없습니다.");
  else if (!isNonNeg(progress.earnedCredits)) err("progress.earnedCredits", "이수학점은 0 이상이어야 합니다.");

  if (progress.earnedMajorCredits === null)
    miss("progress.earnedMajorCredits", "전공 이수학점이 없습니다.", "전공 진행을 표시할 수 없습니다.");
  else if (!isNonNeg(progress.earnedMajorCredits)) err("progress.earnedMajorCredits", "전공 이수학점은 0 이상이어야 합니다.");
  else if (progress.earnedCredits !== null && progress.earnedMajorCredits > progress.earnedCredits)
    err("progress.earnedMajorCredits", "전공 이수학점은 총 이수학점 안에 포함되어야 합니다.");

  if (progress.completedCourseCodes === null)
    miss("progress.completedCourseCodes", "이수 과목이 없습니다.", "이미 들은 과목을 다시 배치할 수 있어 후보를 만들지 않습니다.");

  if (input.target === null)
    miss("target", "목표 총학점이 없습니다.", "예상 계획 완료 학기와 '빠른 완료' 비교를 하지 않습니다.");
  else if (!Number.isFinite(input.target.value) || input.target.value <= 0) err("target", "목표학점은 0보다 커야 합니다.");

  if (input.careers.some((c) => !CAREERS.includes(c))) err("careers", "관심 진로를 확인해 주세요.");

  const paces = input.pace.mode === "fixed" ? [input.pace.credits] : (input.pace.options ?? []);
  if (paces.some((c) => !Number.isInteger(c) || c < 1 || c > 30)) err("pace", "학기당 학점은 1~30 사이로 입력해 주세요.");

  input.periods.forEach((p, i) => {
    const f = `periods[${i}]`;
    const label = KIND_LABEL[p.kind];
    if (p.startDate !== null && !isValidDate(p.startDate)) return err(`${f}.startDate`, `${label} 시작일 형식을 확인해 주세요.`);
    if (p.endDate !== null && !isValidDate(p.endDate)) return err(`${f}.endDate`, `${label} 종료일 형식을 확인해 주세요.`);
    if (p.durationMonths !== null && (!Number.isInteger(p.durationMonths) || p.durationMonths < 1))
      return err(`${f}.durationMonths`, `${label} 기간(개월)은 1 이상의 정수여야 합니다.`);
    const range = resolvePeriodRange(p);
    if (range && range.end <= range.start) return err(`${f}.endDate`, `${label} 종료일은 시작일 이후여야 합니다.`);
    if (p.timing === "fixed" && !p.startDate)
      return miss(`${f}.startDate`, `${label} 시작일이 없습니다.`, "이 기간을 반영하지 못해 완료 학기를 계산하지 않습니다.");
    if (!range)
      miss(
        p.timing === "flexible" ? `${f}.startDate` : `${f}.endDate`,
        `${label} 기간 확인이 필요합니다.`,
        "이 기간을 반영하지 못해 완료 학기를 계산하지 않습니다.",
      );
    if (p.kind === "exchange" && (p.exchange?.credits ?? null) === null)
      miss(`${f}.exchange`, "교환학생 인정학점이 미정입니다.", "교환 이후 학점 진행과 완료 학기를 확정하지 않습니다.");
  });
  return issues;
}

/** 고정 기간끼리 서로 양립할 수 없는 겹침(군 복무 ↔ 교환). 휴학 겹침은 중단 구간으로 합친다. */
export function findPeriodConflicts(input: PlanInputV2): Array<{ a: PeriodInput; b: PeriodInput }> {
  const out: Array<{ a: PeriodInput; b: PeriodInput }> = [];
  const ps = input.periods;
  for (let i = 0; i < ps.length; i++)
    for (let j = i + 1; j < ps.length; j++) {
      const kinds = new Set([ps[i].kind, ps[j].kind]);
      if (!(kinds.has("military") && kinds.has("exchange"))) continue;
      const ra = resolvePeriodRange(ps[i]);
      const rb = resolvePeriodRange(ps[j]);
      if (ra && rb && overlaps(ra, rb)) out.push({ a: ps[i], b: ps[j] });
    }
  return out;
}

/**
 * 후보 하나를 현재 엔진(v1) 입력으로 바꾼다. 필수 값이 없으면 null.
 * 교환 기간은 국내 과목을 배치하지 않도록 중단 구간으로 넘기고, 결과에서 exchange로 다시 표시한다.
 */
export function toEngineInput(input: PlanInputV2, career: CareerTrack, paceCredits: number): PlanInput | null {
  const { startTerm, progress } = input;
  if (
    !startTerm ||
    progress.completedTerms === null ||
    progress.earnedCredits === null ||
    progress.earnedMajorCredits === null ||
    progress.completedCourseCodes === null
  )
    return null;
  const breaks: BreakPeriod[] = [];
  for (const p of input.periods) {
    const r = resolvePeriodRange(p);
    if (r) breaks.push({ kind: p.kind === "military" ? "military" : "leave", startDate: r.start, endDate: r.end });
  }
  return {
    startTerm,
    completedCourseCodes: progress.completedCourseCodes,
    earnedCredits: progress.earnedCredits,
    earnedMajorCredits: progress.earnedMajorCredits,
    completedTerms: progress.completedTerms,
    targetCredits: input.target?.value ?? null,
    track: career,
    creditCap: paceCredits,
    breaks,
  };
}
