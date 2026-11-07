import type { CatalogResponse, PlanInput } from "@/contracts/types";
import { formatTerm } from "@/engine";
import { endDateToMonth, startDateToMonth } from "../dates";
import { breakLabel, TRACK_NAME } from "../labels";
import { completedTermsLabel, type Profile } from "../profile";

/** 인쇄·PDF에만 보이는 머리말: 이 계획을 만든 조건과 자료 버전. */
export function PrintHeader({
  input,
  profile,
  catalog,
  printedAt,
}: {
  input: PlanInput;
  profile: Profile | null;
  catalog: CatalogResponse | null;
  printedAt: string;
}) {
  const ds = catalog?.dataset;
  const breaks = input.breaks.length
    ? input.breaks.map((b) => `${breakLabel([b])} ${startDateToMonth(b.startDate)}~${endDateToMonth(b.endDate)}`).join(", ")
    : "없음";
  const rows: Array<[string, string]> = [
    ["진로", TRACK_NAME[input.track]],
    ["마친 학기", completedTermsLabel(input.completedTerms)],
    ["이수학점", `총 ${input.earnedCredits}학점(전공 ${input.earnedMajorCredits}학점 포함)`],
    ["계획 시작", formatTerm(input.startTerm)],
    ["목표 총학점", input.targetCredits === null ? "미입력" : `${input.targetCredits}학점`],
    ["학기당 최대", `${input.creditCap}학점`],
    ["쉬는 기간", breaks],
  ];
  return (
    <div className="mb-6 hidden border-b border-line pb-4 print:block">
      <p className="text-xs text-muted">아 맞다, 인생! · 정보시스템학과 학기 플래너 · {printedAt} 출력</p>
      <h1 className="mt-1 text-[22px] font-semibold">{profile?.name ? `${profile.name}님의 학기 로드맵` : "학기 로드맵"}</h1>
      <dl className="mt-3 grid grid-cols-2 gap-x-8 gap-y-1 text-[12px]">
        {profile?.admissionYear && (
          <div className="flex gap-3">
            <dt className="w-24 shrink-0 whitespace-nowrap text-muted">입학</dt>
            <dd>{profile.admissionYear}년</dd>
          </div>
        )}
        {rows.map(([k, v]) => (
          <div key={k} className="flex gap-3">
            <dt className="w-24 shrink-0 whitespace-nowrap text-muted">{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      {ds && (
        <p className="mt-3 text-[11px] text-muted">
          자료: {ds.department} {ds.curriculum} 교육과정, 버전 {ds.catalogVersion}
          {catalog?.origin === "fixture" ? " (개발용 검토 자료)" : ""}, {ds.collectedAt} 수집
        </p>
      )}
    </div>
  );
}
