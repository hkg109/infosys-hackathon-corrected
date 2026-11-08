"use client";

import { ArrowRight, BarChart3, ChevronLeft, ChevronRight, Code2, Info, Landmark, ShieldCheck, Store, Workflow, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { useRef, useState } from "react";
import { CAREER_LABEL } from "@/contracts/careers";
import type { CareerTrack } from "@/contracts/types";
import { formatTerm, KATUSA_STATUS_LABEL, PACE_STYLE_LABEL, termIndex } from "@/engine";
import { usePlanner } from "../PlannerApp";
import { needsMilitary } from "../plan";
import type { Track, TrackRow } from "../tracks";
import { Empty, GROUP_COLOR, PageTitle, Tag } from "./ui";

export const CAREER_ICON: Record<CareerTrack, LucideIcon> = {
  software: Code2,
  data: BarChart3,
  security: ShieldCheck,
  consulting: Workflow,
  business: Store,
  finance: Landmark,
};

const shortTerm = (t: { year: number; season: number } | null) => (t ? `'${String(t.year).slice(2)}-${t.season}` : null);
const fmt = (n: number | null, d = 1) => (n === null ? "—" : Number.isInteger(n) ? String(n) : n.toFixed(d));

/** 02 맞 — 추천 순위로 놓인 트랙 목록. 카드를 누르면 바로 확정하지 않고 트랙 정보 화면으로 간다. */
export function TrackGallery() {
  const { mounted, tracks, draft, dataset, catalog } = usePlanner();
  if (!mounted) return <div className="h-96 animate-pulse rounded bg-paper-2" aria-busy="true" />;
  if (!dataset && draft)
    return (
      <Empty title={catalog ? "학과 자료를 불러오지 못했어요" : "학과 자료를 불러오는 중…"} href="/" cta="표지로">
        {catalog?.warnings.join(" ")}
      </Empty>
    );
  if (!tracks || !draft)
    return (
      <Empty title="아직 트랙을 만들 수 없어요" href="/input/review" cta="내 정보 확인하기">
        01 아(내 정보)의 질문에 답하면 나에게 맞는 트랙이 추천 순서대로 나타나요.
      </Empty>
    );
  if (tracks.tracks.length === 0)
    return (
      <Empty title="조건에 맞는 트랙을 만들지 못했어요" href="/input/review" cta="입력 다시 보기">
        입력한 기간이나 학점이 서로 맞지 않는지 확인해 주세요.
      </Empty>
    );

  const byId = new Map(tracks.tracks.map((t) => [t.id, t]));
  const milNames = draft.military.trackIds.map((id) => dataset?.military?.tracks.find((t) => t.id === id)?.officialName ?? id);
  const pills = [
    needsMilitary(draft) ? `군 복무 · ${milNames.join("·") || "트랙 미정"}` : draft.military.status === "done" ? "군 복무 · 마침" : "군 복무 · 해당 없음",
    ...(needsMilitary(draft) && draft.katusa.priority ? [`카투사 우선 · ${KATUSA_STATUS_LABEL[draft.katusa.status]}`] : []),
    draft.paceStyle === "compare" ? "균형형·후반 여유형 비교" : draft.paceStyle ? PACE_STYLE_LABEL[draft.paceStyle] : "균형형",
    draft.exchange.mode === "none" || !draft.exchange.mode ? "교환학생 · 생각 없음" : "교환학생 · 관심 있음",
    draft.targetCredits ? `목표 ${draft.targetCredits}학점` : "목표 학점 미입력",
  ];

  return (
    <div>
      <PageTitle
        step="02 · 맞 — 맞춰가기"
        title={draft.name ? `${draft.name}님에게 맞춘 트랙` : "나에게 맞춘 트랙"}
        sub="추천 순위대로 놓았어요. 트랙을 누르면 바로 정하지 않고 먼저 장점·주의할 점·학기 흐름을 보여 드려요."
      />
      <div className="-mt-3 mb-6 flex flex-wrap gap-2">
        {pills.map((p) => (
          <Link key={p} href="/input/review" className="rounded-full bg-ink px-4 py-1.5 text-[13px] font-medium text-paper hover:bg-ink-soft">
            {p}
          </Link>
        ))}
      </div>
      {tracks.military && tracks.military.excluded.length > 0 && (
        <p className="mb-6 border-l-[3px] border-red pl-3 text-[14px] text-ink-soft">
          {tracks.military.excluded.map((e) => e.reason).join(" ")} 기존 군 복무 트랙 순서로 비교해요.
        </p>
      )}
      {tracks.military && tracks.military.alternatives.length > 0 && (
        <details className="mb-6 text-[14px] text-ink-soft">
          <summary className="cursor-pointer">카투사 선발됨 — 기본 계획에 쓰지 않는 대안 {tracks.military.alternatives.length}개</summary>
          <p className="mt-1">
            {tracks.military.alternatives.map((id) => dataset?.military?.tracks.find((t) => t.id === id)?.officialName ?? id).join(", ")}은(는) 기본 계획에서 빼고
            대안으로만 남겼어요.
          </p>
        </details>
      )}

      <div className="grid grid-cols-[minmax(0,1fr)] gap-12">
        {tracks.rows.map((row) => (
          <Row key={row.id} row={row} tracks={row.trackIds.flatMap((id) => (byId.get(id) ? [byId.get(id)!] : []))} />
        ))}
      </div>
    </div>
  );
}

function Row({ row, tracks }: { row: TrackRow; tracks: Track[] }) {
  const [all, setAll] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const scroll = (dir: number) => scroller.current?.scrollBy({ left: dir * 760, behavior: "smooth" });
  if (tracks.length === 0) return null;

  return (
    <section id={row.id} aria-labelledby={`row-${row.id}`}>
      <div className="mb-4 flex items-end justify-between">
        <h2 id={`row-${row.id}`} className="flex items-center gap-2 font-serif text-[24px] font-bold">
          {row.title}
          <span title={row.desc} className="text-muted">
            <Info size={16} aria-label={row.desc} />
          </span>
        </h2>
        {tracks.length > 4 && (
          <button type="button" onClick={() => setAll((v) => !v)} className="inline-flex cursor-pointer items-center gap-1 text-[14px] text-ink-soft hover:text-ink">
            {all ? "접기" : `전체 보기 (${tracks.length})`} <ArrowRight size={15} aria-hidden />
          </button>
        )}
      </div>
      <p className="-mt-2 mb-4 text-[13px] text-muted">{row.desc}</p>
      {all ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-5">
          {tracks.map((t) => (
            <TrackCard key={t.id} track={t} />
          ))}
        </div>
      ) : (
        <div className="relative">
          <div ref={scroller} className="flex snap-x gap-5 overflow-x-auto pb-2 [scrollbar-width:none]">
            {tracks.map((t) => (
              <div key={t.id} className="w-[320px] shrink-0 snap-start">
                <TrackCard track={t} />
              </div>
            ))}
          </div>
          {tracks.length > 4 && (
            <>
              <Arrow side="left" onClick={() => scroll(-1)} />
              <Arrow side="right" onClick={() => scroll(1)} />
            </>
          )}
        </div>
      )}
    </section>
  );
}

function Arrow({ side, onClick }: { side: "left" | "right"; onClick: () => void }) {
  const Icon = side === "left" ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={side === "left" ? "이전 트랙" : "다음 트랙"}
      className={`absolute top-[60px] grid size-11 cursor-pointer place-items-center rounded-full border border-line bg-paper shadow-[0_4px_10px_-4px_rgba(40,30,10,0.4)] hover:bg-paper-2 ${
        side === "left" ? "-left-5" : "-right-5"
      }`}
    >
      <Icon size={20} aria-hidden />
    </button>
  );
}

/** 트랙 카드: 썸네일 띠 + 핵심 지표 + 실제 지표로 만든 추천 이유 한 줄 */
export function TrackCard({ track }: { track: Track }) {
  const c = track.candidate;
  const s = track.stats;
  const done = c.result?.expectedCompletion ?? null;
  const reason = track.entry.reasons[0] ?? track.highlights[0] ?? "";
  return (
    <Link href={`/match/${encodeURIComponent(track.id)}`} className="group block h-full rounded-[10px] border border-line bg-paper p-3 transition-[border-color,transform] hover:-translate-y-0.5 hover:border-ink/40 motion-reduce:transition-none">
      <TrackThumb track={track} />
      <p className="mt-3 line-clamp-2 min-h-[44px] text-[16px] leading-snug font-semibold group-hover:underline">{track.title}</p>
      <div className="mt-1.5 flex flex-wrap gap-1">
        {track.militaryRole === "conditional" && <Tag tone="red">조건부 · 선발 시</Tag>}
        {track.militaryRole === "fallback" && <Tag tone="plain">미선발 시 대체</Tag>}
        {track.paceStyle !== "balanced" && <Tag tone="marker">{PACE_STYLE_LABEL[track.paceStyle]}</Tag>}
        {track.exchangeTerm && <Tag tone="sage">교환 {shortTerm(track.exchangeTerm)}</Tag>}
        {s.checkCount > 0 && <Tag tone="red">확인 필요 {s.checkCount}</Tag>}
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 border-t border-rule pt-2.5 text-[12px]">
        <Metric label="진로">{CAREER_LABEL[track.career]}</Metric>
        <Metric label="학점 페이스">
          {c.key.paceCredits}학점 · {track.paceStyle === "late_light" ? "후반 여유" : track.paceStyle === "custom" ? "직접" : "균형"}
        </Metric>
        <Metric label="군 복무">{track.militaryLabel ?? (track.militaryStart ? "군 복무" : "—")}</Metric>
        <Metric label="입대 → 복학">
          {track.militaryStart ? `${shortTerm(track.militaryStart)} → ${shortTerm(returnTerm(track)) ?? "확인 필요"}` : track.militaryLabel ? "기간 확인 필요" : "—"}
        </Metric>
        <Metric label="예상 완료" strong>
          {done ? formatTerm(done) : "확인 필요"}
        </Metric>
        <Metric label="학기 최대 / 평균">
          {fmt(s.maxCredits)} / {fmt(s.avgCredits)}
        </Metric>
        <Metric label="3학년 / 4학년~ 평균">
          {fmt(s.year3Avg)} / {fmt(s.year4PlusAvg)}
        </Metric>
        <Metric label="핵심 과목 시점">{s.coreTiming === null ? "—" : `평균 ${fmt(s.coreTiming)}번째 학기`}</Metric>
      </dl>
      {reason && <p className="mt-2.5 line-clamp-2 text-[12px] leading-relaxed text-ink-soft">{reason}</p>}
    </Link>
  );
}

/** 결과 학기 배치에서 군 복무 다음 첫 수강 학기(다시 계산하지 않는다) */
export function returnTerm(track: Track) {
  const terms = track.candidate.result?.terms ?? [];
  const blocked = terms.filter((t) => t.status === "break");
  if (blocked.length === 0) return null;
  const last = termIndex(blocked[blocked.length - 1].term);
  return terms.find((t) => t.status === "study" && termIndex(t.term) > last)?.term ?? null;
}

function Metric({ label, strong, children }: { label: string; strong?: boolean; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10.5px] text-muted">{label}</dt>
      <dd className={`truncate tabular-nums ${strong ? "font-serif text-[14px] font-bold text-red" : "font-medium"}`}>{children}</dd>
    </div>
  );
}

/** 트랙 썸네일: 진로 색 + 아이콘 + 학기 흐름 띠(수강·중단·교환) */
export function TrackThumb({ track, big = false, mini = false }: { track: Track; big?: boolean; mini?: boolean }) {
  const Icon = CAREER_ICON[track.career];
  const terms = track.candidate.result?.terms ?? [];
  const label = track.exchangeTerm
    ? `${shortTerm(track.exchangeTerm)} 교환`
    : track.militaryStart
      ? `${shortTerm(track.militaryStart)} 입대`
      : track.militaryRole === "conditional"
        ? "카투사?"
        : track.paceStyle === "late_light"
          ? "후반 여유"
          : `${track.candidate.key.paceCredits}학점`;
  if (mini)
    return (
      <div className="relative grid aspect-square place-items-center rounded-[6px]" style={{ background: GROUP_COLOR[track.career] }}>
        <Icon className="text-paper" size={26} strokeWidth={1.8} aria-hidden />
        <span className="absolute -top-1.5 -left-1.5 rounded-[3px] bg-ink px-1 text-[10px] font-bold text-paper tabular-nums">#{track.rank}</span>
      </div>
    );
  return (
    <div
      className={`relative overflow-hidden rounded-[8px] border border-black/10 ${big ? "aspect-square" : "h-[132px]"}`}
      style={{ background: GROUP_COLOR[track.career] }}
    >
      <div className="absolute inset-0 opacity-25 [background-image:radial-gradient(rgba(255,255,255,0.9)_1px,transparent_1.4px)] [background-size:14px_14px]" aria-hidden />
      <span className={`absolute top-2.5 left-2.5 rounded-[4px] bg-paper px-2 py-0.5 font-serif font-bold text-ink tabular-nums ${big ? "text-[18px]" : "text-[14px]"}`}>
        추천 #{track.rank}
      </span>
      <Icon className={`absolute text-paper/90 ${big ? "top-1/2 left-1/2 -translate-x-1/2 -translate-y-[62%]" : "top-3 right-3"}`} size={big ? 120 : 40} strokeWidth={1.6} aria-hidden />
      <p className={`absolute inset-x-0 text-center font-serif font-bold tracking-tight text-paper drop-shadow-[0_1px_0_rgba(0,0,0,0.25)] ${big ? "bottom-[34px] text-[34px]" : "bottom-[28px] text-[24px]"}`}>
        {label}
      </p>
      <div className="absolute inset-x-2.5 bottom-2.5 flex h-[10px] gap-[2px]" aria-hidden>
        {terms.map((t) => (
          <span
            key={termIndex(t.term)}
            className={`flex-1 rounded-[2px] ${t.status === "study" ? "bg-paper/90" : t.status === "exchange" ? "bg-marker" : "bg-ink/55"}`}
          />
        ))}
      </div>
    </div>
  );
}
