/**
 * 화면 전용 개인 정보. 계획 계산(PlanInput)에는 들어가지 않고 이 브라우저에만 저장한다.
 * 이름은 화면 인사말에만 쓴다.
 */
export interface Profile {
  schemaVersion: 1;
  name: string;
  /** 입학연도(학번 앞 4자리). 모르면 null */
  admissionYear: number | null;
  military: "planned" | "none";
}

export const blankProfile = (): Profile => ({ schemaVersion: 1, name: "", admissionYear: null, military: "none" });

/** 마친 학기 수 → "2학년 1학기까지" */
export function completedTermsLabel(n: number): string {
  if (n === 0) return "아직 없음(신입생)";
  return `${Math.ceil(n / 2)}학년 ${n % 2 === 1 ? 1 : 2}학기까지`;
}

/** 자료의 교육과정 표기(예: "2024-2027")가 입학연도를 포함하는지. 판단할 수 없으면 null */
export function curriculumCovers(curriculum: string, admissionYear: number | null): boolean | null {
  const m = /^(\d{4})-(\d{4})$/.exec(curriculum);
  if (!m || admissionYear === null) return null;
  return admissionYear >= Number(m[1]) && admissionYear <= Number(m[2]);
}
