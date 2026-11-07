import type { PlanInput, SavedPlan } from "@/contracts/types";
import type { Profile } from "./profile";

const INPUT_KEY = "infosys:planner:input:v1";
const PLAN_A_KEY = "infosys:planner:plan-a:v1";
const CHECKED_KEY = "infosys:planner:checked:v1";
const PROFILE_KEY = "infosys:planner:profile:v1";
const STAGE_KEY = "infosys:planner:stage:v1";

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

export const loadInput = () => read<PlanInput>(INPUT_KEY);
export const saveInput = (input: PlanInput) => write(INPUT_KEY, input);
export const clearInput = () => write(INPUT_KEY, null);

export function loadPlanA(): SavedPlan | null {
  const plan = read<SavedPlan>(PLAN_A_KEY);
  return plan?.schemaVersion === 1 ? plan : null;
}
export const savePlanA = (plan: SavedPlan | null) => write(PLAN_A_KEY, plan);

export const loadChecked = () => read<Record<string, boolean>>(CHECKED_KEY);
export const saveChecked = (checked: Record<string, boolean>) => write(CHECKED_KEY, checked);

export function loadProfile(): Profile | null {
  const p = read<Profile>(PROFILE_KEY);
  return p?.schemaVersion === 1 ? p : null;
}
export const saveProfile = (profile: Profile | null) => write(PROFILE_KEY, profile);

/** 아·맞·다 단계 위치와 "맞다!" 확정 여부. 새로고침 후 같은 단계로 돌아온다. */
export interface StageState {
  view: "mat" | "da" | "courses" | "sources";
  confirmed: boolean;
}
export function loadStage(): StageState | null {
  const v = read<StageState>(STAGE_KEY);
  return v && ["mat", "da", "courses", "sources"].includes(v.view) ? v : null;
}
export const saveStage = (stage: StageState) => write(STAGE_KEY, stage);
