"use client";

import type { DatasetV2, MilitaryStrategyCandidate, MilitaryStrategySet, RecruitmentCycle } from "@/contracts/types";
import { BRANCH_LABEL, nextCycle, PROGRAM } from "@/engine";
import { Tag } from "./ui";

const COLUMNS: Array<{ key: MilitaryStrategyCandidate["scenario"]; title: string }> = [
  { key: "katusa_excluded", title: "카투사 제외" },
  { key: "katusa_parallel", title: "카투사 우선 · 동시지원" },
  { key: "katusa_sequential", title: "카투사 우선 · 순차지원" },
];

/**
 * 카투사 여부와 중복지원 규칙에 따라 달라지는 행동·fallback 비교.
 * 표가 아니라 시나리오별 카드(세로 목록)로 그려 좁은 화면에서도 페이지가 가로로 밀리지 않는다.
 * 넓으면 3열, 좁으면 자동으로 세로로 쌓인다. 날짜는 공식 공고일 때만 날짜로 쓴다.
 */
export function MilitaryCompare({ set, dataset, today }: { set: MilitaryStrategySet; dataset: DatasetV2; today: string }) {
  const name = (id: string | null | undefined) => (id ? (dataset.military?.tracks.find((t) => t.id === id)?.officialName ?? id) : "—");
  const cycleText = (c: RecruitmentCycle | null) =>
    !c ? "공고 확인 필요" : c.publicationStatus === "official" && c.applicationStart ? `${c.applicationStart}~${c.applicationEnd}` : c.publicationStatus === "expected" ? "예상·확정 아님 — 공고 확인" : "공식 모집일 미발표 — 공고 확인 필요";
  const katusaCycle = nextCycle(dataset.military, PROGRAM.katusa, today);
  const supp = (dataset.military?.supplementalRules ?? [])[0];

  const pick = (key: MilitaryStrategyCandidate["scenario"]) => set.strategies.find((s) => s.scenario === key && s.applications.some((a) => a.programId !== PROGRAM.general)) ?? set.strategies.find((s) => s.scenario === key);

  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-4">
      {COLUMNS.map(({ key, title }) => {
        const s = pick(key);
        const branch = (cond: string) => s?.branches.find((b) => b.condition === cond);
        const other = s?.applications.find((a) => a.programId !== PROGRAM.katusa && a.role !== "safety_net" && a.role !== "supplemental");
        const rows: Array<[string, string]> = s
          ? [
              ["지금 할 준비", s.eligibility.filter((e) => e.status !== "eligible").map((e) => e.reasons[0]).join(" ") || "지원 회차 공고 확인"],
              ["첫 공식 모집기회", s.applications[0] ? `${name(s.applications[0].programId)} — ${cycleText((dataset.military?.recruitmentCycles ?? []).find((c) => c.id === s.applications[0].cycleId) ?? null)}` : "—"],
              ["카투사 접수", key === "katusa_excluded" ? "해당 없음" : cycleText(katusaCycle)],
              [
                "다른 모집병 지원",
                key === "katusa_excluded"
                  ? other
                    ? `${name(other.programId)} 지원`
                    : "일반 입영만"
                  : key === "katusa_parallel"
                    ? `${name(other?.programId)} 함께 접수 — ${s.concurrency?.relation === "allowed" ? "이 회차 허용" : s.concurrency?.relation === "forbidden" ? "이 회차 불가" : "허용 여부 공고 전"}`
                    : "카투사 결과 전에는 보류",
              ],
              ["카투사 선발", key === "katusa_excluded" ? "해당 없음" : `카투사 일정 채택 · ${branch("katusa_selected") ? BRANCH_LABEL[branch("katusa_selected")!.label] : ""}`],
              ["카투사 미선발", key === "katusa_excluded" ? "해당 없음" : (branch("katusa_not_selected")?.title.replace(/^카투사 미선발 → /, "") ?? "—")],
              ["추가모집", supp ? `${supp.applicationMethod === "first_come" ? "선착순" : "방식 공고 확인"} · 특기 출현 보장 없음 — 공고 확인` : "공고 확인"],
              ["모든 지원 실패", branch("none_selected") ? `${name(branch("none_selected")!.selectedProgramId)} (${branch("none_selected")!.serviceMonths ?? "?"}개월)` : "안전장치 없음"],
              ["학업 영향", s.metrics.worstServiceMonths !== null ? `분기별 최대 ${s.metrics.worstServiceMonths}개월 중단` : "일부 분기 복무기간 미확인 — 조건부"],
              ["장점", s.reasons[0] ?? "—"],
              ["단점·위험", s.risks.slice(0, 2).join(" ") || "눈에 띄는 위험이 없어요."],
            ]
          : [];
        return (
          <section key={key} className={`min-w-0 rounded-[10px] border p-4 ${s?.id === set.bestId ? "border-[1.5px] border-red" : "border-line"}`}>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <h4 className="font-serif text-[16px] font-bold">{title}</h4>
              {s?.id === set.bestId && <Tag tone="red">나에게 1순위</Tag>}
              {s && s.status === "conflict" && <Tag tone="red">이 회차 불가</Tag>}
              {s && s.status === "ineligible" && <Tag tone="red">자격 확인 필요</Tag>}
            </div>
            {!s ? (
              <p className="text-[13px] text-muted">카투사를 고려하지 않는다고 해서 이 경우는 계산하지 않았어요.</p>
            ) : (
              <dl className="grid gap-2 text-[13px]">
                {rows.map(([k, v]) => (
                  <div key={k} className="min-w-0 border-b border-rule pb-1.5">
                    <dt className="text-[11px] text-muted">{k}</dt>
                    <dd className="break-words">{v}</dd>
                  </div>
                ))}
              </dl>
            )}
          </section>
        );
      })}
    </div>
  );
}
