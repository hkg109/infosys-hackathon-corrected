import type { PlanInput, SavedPlan } from "@/contracts/types";
import { emptyGenEd, type GenEdState } from "@/engine";
import { blankDraft, type Draft } from "./plan";

const DRAFT_KEY = "infosys:planner:draft:v4";
const PLAN_KEY = "infosys:planner:plan:v4";
const CHECKED_KEY = "infosys:planner:checked:v1";
/** 이전 저장 형식(스키마 3). 읽어서 4로 옮긴 뒤 지운다. */
const LEGACY_DRAFT_KEY = "infosys:planner:draft:v3";
const LEGACY_PLAN_KEY = "infosys:planner:plan:v3";

/**
 * 로드맵 화면의 현재 계획. input은 추천에서 고른(또는 피드백으로 고친) 고정 입력이다.
 * previous는 마지막 피드백 직전 계획(되돌리기·전후 비교용).
 */
export interface PlanState {
  schemaVersion: 4;
  input: PlanInput;
  /** 기본 트랙으로 고른 트랙 ID와 이름 */
  trackId: string;
  trackTitle: string;
  /** 교환학생 학기 구간 [start, end). 엔진 입력(v1)에서는 중단 구간으로만 들어가므로 표시용으로 따로 둔다. */
  exchange: { startDate: string; endDate: string } | null;
  /** 군 복무 트랙 표시(조건부 카투사 등). 없으면 null */
  military: { label: string; conditional: boolean; monthsStatus: string } | null;
  previous: SavedPlan | null;
  /** 마지막 피드백에서 바꾼 것 */
  lastChanges: string[];
  confirmedAt: string | null;
  /** 교양 자리(placeholder). 학기 slotCredits를 구체화할 뿐 총학점에 더하지 않는다 */
  genEd: GenEdState;
  /** 피드백 직전 교양 자리(되돌리기용) */
  previousGenEd: GenEdState | null;
}

/** 브라우저 시작 후(useEffect 안)에서만 호출한다. */
function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // 저장 실패는 화면 동작에 영향을 주지 않는다.
  }
}

/** 스키마 3 입력 → 4. 0으로 저장돼 있던 값은 사용자가 적은 값으로 본다(v3는 미입력과 0을 구분하지 않았다). */
export function migrateDraftV3(old: Record<string, unknown>, today: string): Draft {
  const d = blankDraft(today);
  const num = (k: string) => (typeof old[k] === "number" ? (old[k] as number) : null);
  const mil = (old.military ?? {}) as { mode?: string; months?: number | null; startDate?: string | null };
  const ex = (old.exchange ?? {}) as { mode?: Draft["exchange"]["mode"]; ordinal?: number | null };
  return {
    ...d,
    name: typeof old.name === "string" ? old.name : "",
    admissionYear: num("admissionYear"),
    completedTerms: num("completedTerms"),
    earnedCredits: num("earnedCredits"),
    earnedMajorCredits: num("earnedMajorCredits"),
    completedCourseCodes: Array.isArray(old.completedCourseCodes) ? (old.completedCourseCodes as string[]) : [],
    coursesConfirmed: Array.isArray(old.completedCourseCodes),
    targetCredits: num("targetCredits"),
    targetSource: num("targetCredits") === null ? null : "user_goal",
    startTerm: (old.startTerm as Draft["startTerm"]) ?? d.startTerm,
    answers: (old.answers as Record<string, string>) ?? {},
    career: Object.keys((old.answers as object) ?? {}).length > 0 ? "unsure" : null,
    military: {
      ...d.military,
      status: mil.mode === "none" ? "none" : mil.mode ? "planned" : null,
      timing: mil.mode === "fixed" ? "fixed" : "recommend",
      startDate: mil.startDate ?? null,
      // v3의 기간 선택지(18·20·21)는 확인되지 않은 값이었으므로 가져오지 않는다.
      months: null,
    },
    exchange: { mode: ex.mode ?? null, ordinal: ex.ordinal ?? null },
    priority: (old.priority as Draft["priority"]) ?? null,
  };
}

export function loadDraft(today: string): Draft | null {
  const d = read<Draft>(DRAFT_KEY);
  if (d?.schemaVersion === 4) return d;
  const legacy = read<Record<string, unknown>>(LEGACY_DRAFT_KEY);
  if (legacy?.schemaVersion === 3) {
    const migrated = migrateDraftV3(legacy, today);
    write(DRAFT_KEY, migrated);
    write(LEGACY_DRAFT_KEY, null);
    return migrated;
  }
  return null;
}
export const saveDraft = (d: Draft | null) => write(DRAFT_KEY, d);

export function loadPlan(): PlanState | null {
  const p = read<PlanState>(PLAN_KEY);
  if (p?.schemaVersion === 4) return p;
  const legacy = read<Omit<PlanState, "schemaVersion" | "genEd" | "previousGenEd" | "military"> & { schemaVersion: number }>(LEGACY_PLAN_KEY);
  if (legacy?.schemaVersion === 3) {
    const migrated: PlanState = { ...legacy, schemaVersion: 4, military: null, genEd: emptyGenEd(), previousGenEd: null };
    write(PLAN_KEY, migrated);
    write(LEGACY_PLAN_KEY, null);
    return migrated;
  }
  return null;
}
export const savePlan = (p: PlanState | null) => write(PLAN_KEY, p);

export const loadChecked = () => read<Record<string, boolean>>(CHECKED_KEY) ?? {};
export const saveChecked = (c: Record<string, boolean> | null) => write(CHECKED_KEY, c);

