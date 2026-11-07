"use client";

import { ArrowRight, BarChart3, CalendarCheck2, ChevronLeft, ChevronRight, Code2, Info, ShieldCheck, Store, Target, Workflow, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { useRef, useState } from "react";
import type { CareerTrack } from "@/contracts/types";
import { termIndex } from "@/engine";
import { usePlanner } from "../PlannerApp";
import { QUIZ } from "../recommend";
import type { Track, TrackRow } from "../tracks";
import { Empty, GROUP_COLOR, PageTitle } from "./ui";

export const CAREER_ICON: Record<CareerTrack, LucideIcon> = {
  software: Code2,
  data: BarChart3,
  security: ShieldCheck,
  consulting: Workflow,
  business: Store,
};

const shortTerm = (t: { year: number; season: number } | null) => (t ? `'${String(t.year).slice(2)}-${t.season}` : null);

/** 02 맞 — 추천 순위로 놓인 트랙 목록. 카드를 누르면 트랙 정보 화면으로 간다. */
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
      <Empty title="아직 트랙을 만들 수 없어요" href="/input" cta="내 정보 마저 적기">
        01 아(내 정보)의 질문에 답하면 나에게 맞는 트랙이 추천 순서대로 나타나요.
      </Empty>
    );
  if (tracks.tracks.length === 0)
    return (
      <Empty title="조건에 맞는 트랙을 만들지 못했어요" href="/input" cta="입력 다시 보기">
        입력한 기간이나 학점이 서로 맞지 않는지 확인해 주세요.
      </Empty>
    );

  const byId = new Map(tracks.tracks.map((t) => [t.id, t]));
  const pills = [
    draft.military.mode === "recommend" ? "군대 · 시기 추천" : draft.military.mode === "fixed" ? "군대 · 입영일 확정" : "군대 · 해당 없음",
    draft.exchange.mode === "none" ? "교환학생 · 생각 없음" : "교환학생 · 관심 있음",
    draft.targetCredits ? `목표 ${draft.targetCredits}학점` : "목표 학점 미입력",
  ];

  return (
    <div>
      <PageTitle
        step="02 · 맞 — 맞춰가기"
        title={draft.name ? `${draft.name}님에게 맞춘 트랙` : "나에게 맞춘 트랙"}
        sub="추천 순위대로 놓았어요. 트랙을 누르면 장점과 특징, 학기 흐름을 볼 수 있어요."
      />
      <div className="-mt-3 mb-9 flex flex-wrap gap-2">
        {pills.map((p) => (
          <Link key={p} href="/input" className="rounded-full bg-ink px-4 py-1.5 text-[13px] font-medium text-paper hover:bg-ink-soft">
            {p}
          </Link>
        ))}
      </div>

      <div className="grid gap-12">
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
  const scroll = (dir: number) => scroller.current?.scrollBy({ left: dir * 700, behavior: "smooth" });
  if (tracks.length === 0) return null;

  return (
    <section id={row.id} aria-labelledby={`row-${row.id}`}>
      <div className="mb-4 flex items-end justify-between">
        <h2 id={`row-${row.id}`} className="flex items-center gap-2 font-serif text-[22px] font-bold">
          {row.title}
          <span title={row.desc} className="text-muted">
            <Info size={16} aria-label={row.desc} />
          </span>
        </h2>
        {tracks.length > 5 && (
          <button type="button" onClick={() => setAll((v) => !v)} className="inline-flex cursor-pointer items-center gap-1 text-[14px] text-ink-soft hover:text-ink">
            {all ? "접기" : "전체 보기"} <ArrowRight size={15} aria-hidden />
          </button>
        )}
      </div>
      {all ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-x-5 gap-y-8">
          {tracks.map((t) => (
            <TrackCard key={t.id} track={t} />
          ))}
        </div>
      ) : (
        <div className="relative">
          <div ref={scroller} className="flex snap-x gap-5 overflow-x-auto pb-2 [scrollbar-width:none]">
            {tracks.map((t) => (
              <div key={t.id} className="w-[210px] shrink-0 snap-start">
                <TrackCard track={t} />
              </div>
            ))}
          </div>
          {tracks.length > 5 && (
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
      className={`absolute top-[85px] grid size-10 cursor-pointer place-items-center rounded-full border border-line bg-paper shadow-[0_4px_10px_-4px_rgba(40,30,10,0.4)] hover:bg-paper-2 ${
        side === "left" ? "-left-5" : "-right-5"
      }`}
    >
      <Icon size={20} aria-hidden />
    </button>
  );
}

export function TrackCard({ track }: { track: Track }) {
  const done = shortTerm(track.candidate.result?.expectedCompletion ?? null);
  return (
    <Link href={`/match/${encodeURIComponent(track.id)}`} className="group block">
      <TrackThumb track={track} />
      <p className="mt-2.5 line-clamp-2 min-h-[44px] text-[15px] leading-snug font-semibold group-hover:underline">{track.title}</p>
      <p className="mt-1 flex items-center gap-4 text-[12px] text-ink-soft tabular-nums">
        <span className="flex items-center gap-1" title="질문 답 중 이 진로를 가리킨 개수">
          <Target size={13} aria-hidden /> {track.match.matchedAnswers}/{QUIZ.length}
        </span>
        <span className="flex items-center gap-1" title="예상 계획 완료 학기">
          <CalendarCheck2 size={13} aria-hidden /> {done ? `${done} 완료` : "완료 확인 필요"}
        </span>
      </p>
    </Link>
  );
}

/** 트랙 썸네일: 진로 색 + 아이콘 + 학기 흐름 띠(수강·중단·교환) */
export function TrackThumb({ track, big = false, mini = false }: { track: Track; big?: boolean; mini?: boolean }) {
  const Icon = CAREER_ICON[track.career];
  const terms = track.candidate.result?.terms ?? [];
  const label = track.exchangeTerm ? `${shortTerm(track.exchangeTerm)} 교환` : track.militaryStart ? `${shortTerm(track.militaryStart)} 입대` : `${track.candidate.key.paceCredits}학점`;
  if (mini)
    return (
      <div className="relative grid aspect-square place-items-center rounded-[6px]" style={{ background: GROUP_COLOR[track.career] }}>
        <Icon className="text-paper" size={26} strokeWidth={1.8} aria-hidden />
        <span className="absolute -top-1.5 -left-1.5 rounded-[3px] bg-ink px-1 text-[10px] font-bold text-paper tabular-nums">#{track.rank}</span>
      </div>
    );
  return (
    <div
      className={`relative aspect-square overflow-hidden rounded-[8px] border border-black/10 transition-transform group-hover:-translate-y-0.5 ${big ? "" : "shadow-[0_8px_16px_-12px_rgba(40,30,10,0.6)]"}`}
      style={{ background: GROUP_COLOR[track.career] }}
    >
      <div className="absolute inset-0 opacity-25 [background-image:radial-gradient(rgba(255,255,255,0.9)_1px,transparent_1.4px)] [background-size:14px_14px]" aria-hidden />
      <span className={`absolute top-2.5 left-2.5 rounded-[4px] bg-paper px-2 py-0.5 font-serif font-bold text-ink tabular-nums ${big ? "text-[18px]" : "text-[13px]"}`}>
        #{track.rank}
      </span>
      <Icon className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-[62%] text-paper/95" size={big ? 120 : 64} strokeWidth={1.6} aria-hidden />
      <p className={`absolute inset-x-0 bottom-[30px] text-center font-serif font-bold tracking-tight text-paper drop-shadow-[0_1px_0_rgba(0,0,0,0.25)] ${big ? "text-[34px]" : "text-[21px]"}`}>
        {label}
      </p>
      <div className="absolute inset-x-2.5 bottom-2.5 flex h-[12px] gap-[2px]" aria-hidden>
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
