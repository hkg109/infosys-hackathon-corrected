import type { PlanInput, SavedPlan } from "@/contracts/types";
import type { Draft } from "./plan";

const DRAFT_KEY = "infosys:planner:draft:v2";
const PLAN_KEY = "infosys:planner:plan:v2";
const CHECKED_KEY = "infosys:planner:checked:v1";

/**
 * 로드맵 화면의 현재 계획. input은 추천에서 고른(또는 피드백으로 고친) 고정 입력이다.
 * previous는 마지막 피드백 직전 계획(되돌리기·전후 비교용).
 */
export interface PlanState {
  schemaVersion: 2;
  input: PlanInput;
  /** 처음 고른 후보 ID(엔진 형식) */
  candidateId: string | null;
  previous: SavedPlan | null;
  /** 마지막 피드백에서 바꾼 것 */
  lastChanges: string[];
  confirmedAt: string | null;
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

export function loadDraft(): Draft | null {
  const d = read<Draft>(DRAFT_KEY);
  return d?.schemaVersion === 2 ? d : null;
}
export const saveDraft = (d: Draft | null) => write(DRAFT_KEY, d);

export function loadPlan(): PlanState | null {
  const p = read<PlanState>(PLAN_KEY);
  return p?.schemaVersion === 2 ? p : null;
}
export const savePlan = (p: PlanState | null) => write(PLAN_KEY, p);

export const loadChecked = () => read<Record<string, boolean>>(CHECKED_KEY) ?? {};
export const saveChecked = (c: Record<string, boolean> | null) => write(CHECKED_KEY, c);
