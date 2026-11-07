import type { PlanInput, SavedPlan } from "@/contracts/types";
import type { Draft } from "./plan";

const DRAFT_KEY = "infosys:planner:draft:v3";
const PLAN_KEY = "infosys:planner:plan:v3";
const CHECKED_KEY = "infosys:planner:checked:v1";

/**
 * 로드맵 화면의 현재 계획. input은 추천에서 고른(또는 피드백으로 고친) 고정 입력이다.
 * previous는 마지막 피드백 직전 계획(되돌리기·전후 비교용).
 */
export interface PlanState {
  schemaVersion: 3;
  input: PlanInput;
  /** 기본 트랙으로 고른 트랙 ID와 이름 */
  trackId: string;
  trackTitle: string;
  /** 교환학생 학기 구간 [start, end). 엔진 입력(v1)에서는 중단 구간으로만 들어가므로 표시용으로 따로 둔다. */
  exchange: { startDate: string; endDate: string } | null;
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
  return d?.schemaVersion === 3 ? d : null;
}
export const saveDraft = (d: Draft | null) => write(DRAFT_KEY, d);

export function loadPlan(): PlanState | null {
  const p = read<PlanState>(PLAN_KEY);
  return p?.schemaVersion === 3 ? p : null;
}
export const savePlan = (p: PlanState | null) => write(PLAN_KEY, p);

export const loadChecked = () => read<Record<string, boolean>>(CHECKED_KEY) ?? {};
export const saveChecked = (c: Record<string, boolean> | null) => write(CHECKED_KEY, c);
