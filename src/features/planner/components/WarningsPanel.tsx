import { AlertTriangle } from "lucide-react";
import type { PlanResult, PlanWarning, WarningCode } from "@/contracts/types";

type Group = { key: string; title: string; detail: string; items: string[] };

const COURSE_NAME = (result: PlanResult, code?: string) => {
  if (!code) return null;
  for (const t of result.terms) for (const c of t.courses) if (c.code === code) return c.name;
  return result.unplaced.find((u) => u.code === code)?.name ?? code;
};

/**
 * 엔진 경고를 종류별로 묶는다. 경고 문구·판정은 엔진 결과를 그대로 쓰고 다시 계산하지 않는다.
 */
function groupWarnings(result: PlanResult): Group[] {
  const by = (code: WarningCode) => result.warnings.filter((w) => w.code === code);
  const names = (ws: PlanWarning[]) => [...new Set(ws.map((w) => COURSE_NAME(result, w.courseCode)).filter((n): n is string => !!n))];
  const groups: Group[] = [];

  if (result.unplaced.length > 0)
    groups.push({
      key: "unplaced",
      title: `배치하지 못한 과목 ${result.unplaced.length}개`,
      detail: "이 과목이 남아 있어 예상 완료 학기를 추정하지 않았습니다.",
      items: result.unplaced.map((u) => `${u.name}: ${u.reason}`),
    });
  if (by("SEARCH_LIMIT").length > 0)
    groups.push({ key: "limit", title: "계획 기간 안에 끝나지 않음", detail: by("SEARCH_LIMIT")[0].message, items: [] });

  const assumed = names([...by("OFFERING_ASSUMED"), ...by("SEMESTER_UNKNOWN")]);
  if (assumed.length > 0)
    groups.push({
      key: "assumed",
      title: `개설을 가정해 배치한 과목 ${assumed.length}개`,
      detail: "이수학기가 확인되지 않았거나 자료상 종료연도 이후 학기입니다. 로드맵에서 '가정' 표시가 붙은 과목입니다.",
      items: assumed,
    });
  if (by("PREREQ_UNKNOWN").length > 0)
    groups.push({
      key: "prereq",
      title: "공식 선수요건 미확인",
      detail: "선수과목을 확인하지 못한 과목은 선수요건 없이 배치했습니다.",
      items: [],
    });
  if (by("TARGET_UNKNOWN").length > 0)
    groups.push({
      key: "target",
      title: "목표 총학점 미입력",
      detail: "졸업 총학점이 확인되지 않아 예상 완료 학기를 계산하지 않았습니다. 학사안내에서 확인한 값을 입력하세요.",
      items: [],
    });
  return groups;
}

export function WarningsPanel({ result }: { result: PlanResult }) {
  const groups = groupWarnings(result);
  if (groups.length === 0) return null;
  return (
    <section aria-label="확인이 필요한 항목" className="mb-5 rounded-xl border border-warm-line bg-warm/60 px-4 py-3.5">
      <h2 className="mb-2 flex items-center gap-2 text-[13px] font-semibold text-warm-ink">
        <AlertTriangle size={15} aria-hidden /> 확인이 필요한 항목 {groups.length}개
      </h2>
      <ul className="grid gap-1.5">
        {groups.map((g) => (
          <li key={g.key} className="text-[13px]">
            {g.items.length > 0 ? (
              <details>
                <summary className="cursor-pointer">
                  <strong className="font-semibold">{g.title}</strong>
                  <span className="text-muted"> · {g.detail}</span>
                </summary>
                <ul className="mt-1.5 mb-1 list-disc pl-8 text-xs text-muted">
                  {g.items.map((i) => (
                    <li key={i}>{i}</li>
                  ))}
                </ul>
              </details>
            ) : (
              <p className="pl-[15px]">
                <strong className="font-semibold">{g.title}</strong>
                <span className="text-muted"> · {g.detail}</span>
              </p>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
