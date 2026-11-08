"use client";

import { ArrowRight, CircleAlert, CircleHelp, ExternalLink, Shield, Trophy } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";
import { getPopularitySnapshot } from "@/client/popularity";
import { CAREER_LABEL } from "@/contracts/careers";
import type { DatasetV2, MilitaryOutcomeBranch, MilitaryStrategyCandidate, MilitaryStrategySet } from "@/contracts/types";
import { BRANCH_LABEL, formatTerm, GOAL_LABEL } from "@/engine";
import { wantsExchange } from "../exchangePrefs";
import { prefsOf, strategiesFor } from "../militaryPrefs";
import { usePlanner } from "../PlannerApp";
import { type Draft, needsMilitary } from "../plan";
import type { Track } from "../tracks";
import { returnTerm, TrackThumb } from "./TrackGallery";
import { useChooseTrack } from "./TrackDetail";
import { Button, Empty, Hand, PageTitle, Tag } from "./ui";

/** 02 맞 — 최상위 결과 영역은 두 개뿐: 나에게 딱 맞는 트랙 / 전체 트랙 인기 TOP 3 */
export function MatchResults() {
  const { mounted, tracks, draft, dataset, catalog, today } = usePlanner();
  const strategies = useMemo(() => (draft && dataset && needsMilitary(draft) ? strategiesFor(draft, dataset, today) : null), [draft, dataset, today]);
  if (!mounted) return <div className="h-96 animate-pulse rounded bg-paper-2" aria-busy="true" />;
  if (!dataset && draft)
    return (
      <Empty title={catalog ? "학과 자료를 불러오지 못했어요" : "학과 자료를 불러오는 중…"} href="/" cta="표지로">
        {catalog?.warnings.join(" ")}
      </Empty>
    );
  if (!tracks || !draft || !dataset)
    return (
      <Empty title="아직 트랙을 만들 수 없어요" href="/input/review" cta="내 정보 확인하기">
        01 아(내 정보)의 질문에 답하면 나에게 맞는 트랙을 계산해요.
      </Empty>
    );
  if (tracks.tracks.length === 0)
    return (
      <Empty title="조건에 맞는 트랙을 만들지 못했어요" href="/input/review" cta="입력 다시 보기">
        입력한 기간이나 학점이 서로 맞지 않는지 확인해 주세요.
      </Empty>
    );
  const best = tracks.tracks[0];
  return (
    <div>
      <PageTitle
        step="02 · 맞 — 맞춰가기"
        title={draft.name ? `${draft.name}님에게 맞춘 결과` : "나에게 맞춘 결과"}
        sub="개인 최적 트랙 하나와, 다른 사용자들의 선택(데이터가 있을 때만)을 따로 보여 드려요."
      />
      <div className="grid gap-12">
        <BestTrack track={best} all={tracks.tracks} draft={draft} dataset={dataset} strategies={strategies} />
        <PopularTop3 />
      </div>
      <nav aria-label="다른 화면 보기" className="mt-12 border-t border-line pt-6">
        <p className="mb-3 text-[14px] text-ink-soft">다른 전략·조합도 살펴볼 수 있어요.</p>
        <div className="grid grid-cols-2 gap-3">
          {wantsExchange(draft) && (
            <NavCard
              href="/exchange"
              title="교환학생 전략 보기"
              sub={
                draft.exchangeChoice
                  ? `고른 전략: ${draft.exchangeChoice.universityName} · ${formatTerm(draft.exchangeChoice.term)}(학점 인정 미정)`
                  : "1순위 · 백업 · 준비 로드맵"
              }
            />
          )}
          <NavCard href="/match/all" title={`전체 트랙 보기 · ${tracks.tracks.length}개`} sub="다른 진로 · 입대 시기 · 교환 조합 비교" />
        </div>
      </nav>
    </div>
  );
}

/** 보조 화면으로 가는 큰 링크(페이지 이동이라 링크로 둔다) */
function NavCard({ href, title, sub }: { href: string; title: string; sub: string }) {
  return (
    <Link
      href={href}
      className="group flex min-h-[64px] items-center justify-between gap-4 rounded-[10px] border-[1.5px] border-ink/70 bg-paper px-5 py-3 transition-colors hover:border-ink hover:bg-paper-2"
    >
      <span className="min-w-0">
        <span className="block font-serif text-[18px] font-bold text-ink group-hover:underline">{title}</span>
        <span className="block text-[13px] text-ink-soft">{sub}</span>
      </span>
      <ArrowRight size={20} aria-hidden className="shrink-0 text-pen transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" />
    </Link>
  );
}

// ── 영역 A ───────────────────────────────────────────────

function BestTrack({ track, all, draft, dataset, strategies }: { track: Track; all: Track[]; draft: Draft; dataset: DatasetV2; strategies: MilitaryStrategySet | null }) {
  const choose = useChooseTrack();
  const res = track.candidate.result;
  const back = returnTerm(track);
  const strategy = strategies?.strategies.find((s) => s.id === strategies.bestId) ?? null;
  const prefs = prefsOf(draft);
  const used = [
    `진로 · ${CAREER_LABEL[track.career]}${draft.career === "unsure" ? "(질문으로 추천)" : ""}`,
    draft.priority ? `우선순위 · ${{ fast_completion: "빨리 끝내기", career_core: "진로 과목 먼저", light_terms: "여유 있는 학기", exchange: "교환학생" }[draft.priority]}` : null,
    needsMilitary(draft) && prefs.goal ? `군 복무 · ${GOAL_LABEL[prefs.goal]}` : null,
    needsMilitary(draft) && prefs.katusa ? `카투사 · ${{ first_priority: "최우선", consider: "고려", exclude: "제외", unknown: "모름" }[prefs.katusa]}` : null,
    draft.targetCredits ? `목표 ${draft.targetCredits}학점` : "목표학점 미입력",
  ].filter((x): x is string => !!x);

  return (
    <section aria-labelledby="best-title" className="rounded-[14px] border-[1.5px] border-ink bg-paper p-6 shadow-[0_14px_30px_-22px_rgba(40,30,10,0.55)]">
      <p className="font-hand text-[22px] leading-none text-red">나에게 딱 맞는 트랙</p>
      <div className="mt-4 grid grid-cols-1 gap-8 lg:grid-cols-[260px_minmax(0,1fr)]">
        <div className="max-w-[320px]">
          <TrackThumb track={track} big />
        </div>
        <div className="min-w-0">
          <h2 id="best-title" className="font-serif text-[30px] leading-tight font-bold tracking-tight break-keep">
            {track.title}
          </h2>
          <p className="mt-2 text-[16px] text-ink-soft">
            {track.subtitle}
            {res?.expectedCompletion ? ` — ${formatTerm(res.expectedCompletion)}에 계획을 마쳐요.` : " — 완료 학기는 확인이 필요해요."}
          </p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {used.map((u) => (
              <Tag key={u}>{u}</Tag>
            ))}
            {track.militaryRole === "conditional" && <Tag tone="red">선발 결과에 따른 조건부</Tag>}
          </div>
          {track.militaryRole === "fallback" && (
            <p className="mt-2 text-[13px] text-ink-soft">
              일정을 계산할 수 있는 경로로 기본 로드맵을 세웠어요. 카투사 선발 시 로드맵은 아래 분기에서 따로 볼 수 있어요(복무기간 확인 전이라 조건부).
            </p>
          )}

          <h3 className="mt-6 text-[15px] font-semibold">왜 1순위인가요</h3>
          <ul className="mt-2 grid gap-1.5 text-[15px]">
            {[...track.entry.reasons, ...(strategy?.reasons.slice(0, 2) ?? [])].map((r) => (
              <li key={r} className="flex gap-2">
                <span className="font-bold text-red">·</span>
                <span className="min-w-0">{r}</span>
              </li>
            ))}
          </ul>

          <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-3 border-y border-line py-4 text-[14px] md:grid-cols-4">
            <Fact label="예상 계획 완료" strong>
              {res?.expectedCompletion ? formatTerm(res.expectedCompletion) : "확인 필요"}
            </Fact>
            <Fact label="학업 중단 → 복학">{track.militaryStart ? `${formatTerm(track.militaryStart)} → ${back ? formatTerm(back) : "확인 필요"}` : track.militaryLabel ? "기간 확인 필요" : "중단 없음"}</Fact>
            <Fact label="학기 최대 / 평균">
              {track.stats.maxCredits ?? "—"} / {track.stats.avgCredits?.toFixed(1) ?? "—"}학점
            </Fact>
            <Fact label="확인 필요">{track.stats.checkCount}건</Fact>
          </dl>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Button kind="stamp" onClick={() => choose(track, draft, dataset)} className="min-h-[52px] px-7 font-serif text-[17px] font-bold">
              이 트랙으로 계획하기
            </Button>
            <Link href={`/match/${encodeURIComponent(track.id)}`} className="inline-flex min-h-[52px] items-center gap-2 rounded-[6px] border-[1.5px] border-ink/70 px-5 text-[15px] font-medium hover:bg-paper-2">
              이 트랙 자세히 보기 <ArrowRight size={16} aria-hidden />
            </Link>
          </div>
        </div>
      </div>

      {strategy && <StrategyBlock strategy={strategy} set={strategies!} all={all} track={track} />}
    </section>
  );
}

function Fact({ label, strong, children }: { label: string; strong?: boolean; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] text-muted">{label}</dt>
      <dd className={`break-keep ${strong ? "font-serif text-[18px] font-bold text-red" : "font-medium"}`}>{children}</dd>
    </div>
  );
}

const ROLE_LABEL: Record<MilitaryStrategyCandidate["applications"][number]["role"], string> = {
  primary: "먼저 지원",
  parallel_fallback: "같은 시기 함께 지원",
  sequential_fallback: "결과 뒤 지원",
  safety_net: "안전장치",
  supplemental: "추가모집 확인",
};

/** 최적 트랙 안의 군 복무 전략: 지원 순서·분기·fallback·지금 할 일·미확인 조건·출처 */
function StrategyBlock({ strategy, set, all, track }: { strategy: MilitaryStrategyCandidate; set: MilitaryStrategySet; all: Track[]; track: Track }) {
  const { dataset } = usePlanner();
  const name = (id: string | null) => (id ? (dataset?.military?.tracks.find((t) => t.id === id)?.officialName ?? id) : "—");
  const roadmapFor = (b: MilitaryOutcomeBranch) =>
    b.selectedProgramId ? all.find((t) => t.career === track.career && t.militaryTrackId === b.selectedProgramId && (b.condition !== "katusa_selected" || t.militaryRole === "conditional")) : undefined;
  const now = [...new Set(strategy.branches.flatMap((b) => b.nextActions))].slice(0, 6);
  const unknowns = [...new Set([...strategy.risks, ...strategy.warnings])].slice(0, 6);
  return (
    <div className="mt-8 border-t-[1.5px] border-ink pt-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h3 className="flex items-center gap-2 font-serif text-[20px] font-bold">
          <Shield size={19} aria-hidden /> 군 복무 전략 · {strategy.title}
        </h3>
        <StatusTag status={strategy.status} />
      </div>
      <p className="mt-1 text-[14px] text-ink-soft">{strategy.summary}</p>

      <div className="mt-5 grid grid-cols-1 gap-8 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <div className="min-w-0">
          <h4 className="mb-2 text-[13px] font-semibold text-muted">지원 순서</h4>
          <ol className="grid gap-2">
            {strategy.applications.map((a) => (
              <li key={a.id} className="flex gap-3 rounded-[8px] border border-line bg-paper-2/40 px-3 py-2 text-[14px]">
                <span className="grid size-6 shrink-0 place-items-center rounded-full bg-ink font-serif text-[12px] font-bold text-paper">{a.order}</span>
                <span className="min-w-0">
                  <b>{name(a.programId)}</b> <span className="text-[12px] text-muted">{ROLE_LABEL[a.role]}</span>
                  <span className="block text-[12px] break-words text-ink-soft">{a.note}</span>
                </span>
              </li>
            ))}
          </ol>
          {strategy.concurrency && (
            <p className="mt-3 text-[13px] text-ink-soft">
              <b className="text-ink">중복지원</b> ·{" "}
              {{ allowed: "이 회차는 허용", forbidden: "이 회차는 불가", conditional: "조건부", unknown: "공고 전이라 미정" }[strategy.concurrency.relation]} — {strategy.concurrency.note}
            </p>
          )}
        </div>

        <div className="min-w-0">
          <h4 className="mb-2 text-[13px] font-semibold text-muted">결과에 따라 이렇게 갈라져요</h4>
          <ul className="grid gap-2">
            {strategy.branches.map((b) => {
              const road = roadmapFor(b);
              return (
                <li key={b.id} className="rounded-[8px] border border-line px-3 py-2.5 text-[14px]">
                  <div className="flex flex-wrap items-center gap-2">
                    <b className="min-w-0 break-words">{b.title}</b>
                    <Tag tone={b.label === "confirmed" || b.label === "official_schedule" ? "sage" : b.label === "awaiting_result" ? "marker" : "red"}>{BRANCH_LABEL[b.label]}</Tag>
                    <span className="text-[12px] text-muted">{b.selectedProgramId ? (b.serviceMonths !== null ? `복무 ${b.serviceMonths}개월(공식)` : "복무기간 확인 필요") : ""}</span>
                  </div>
                  {b.cancelledApplicationIds.length > 0 && (
                    <p className="mt-0.5 text-[12px] text-ink-soft">
                      정리되는 지원: {b.cancelledApplicationIds.map((id) => name(strategy.applications.find((a) => a.id === id)?.programId ?? null)).join(", ")}
                    </p>
                  )}
                  {road && (
                    <Link href={`/match/${encodeURIComponent(road.id)}`} className="mt-1 inline-flex items-center gap-1 text-[12px] font-semibold text-pen underline-offset-4 hover:underline">
                      이 경우의 학업 로드맵 — {road.candidate.result?.expectedCompletion ? `${formatTerm(road.candidate.result.expectedCompletion)} 완료` : "완료 학기 확인 필요"} <ArrowRight size={12} aria-hidden />
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2">
        <div className="min-w-0">
          <h4 className="mb-2 text-[13px] font-semibold text-muted">지금·나중에 할 일</h4>
          <ul className="grid gap-1.5 text-[13px]">
            {now.map((a) => (
              <li key={a} className="flex gap-2 break-words">
                <span className="text-pen">□</span>
                {a}
              </li>
            ))}
          </ul>
        </div>
        <div className="min-w-0">
          <h4 className="mb-2 flex items-center gap-1 text-[13px] font-semibold text-muted">
            <CircleHelp size={14} aria-hidden /> 주의할 점
          </h4>
          {unknowns.length === 0 ? (
            <p className="text-[13px] text-ink-soft">없어요.</p>
          ) : (
            <ul className="grid gap-1.5 text-[13px] text-ink-soft">
              {unknowns.map((u) => (
                <li key={u} className="flex gap-2 break-words">
                  <CircleAlert size={14} className="mt-0.5 shrink-0 text-red" aria-hidden />
                  {u}
                </li>
              ))}
            </ul>
          )}
          {set.followUpQuestion && (
            <p className="mt-3 rounded-[8px] bg-marker/25 px-3 py-2 text-[13px]">
              한 가지만 더: <b>{set.followUpQuestion}</b>{" "}
              <Link href="/input/katusa-evidence" className="font-semibold text-pen underline-offset-4 hover:underline">
                답하러 가기
              </Link>
            </p>
          )}
        </div>
      </div>

      <details className="mt-6 text-[12px] text-ink-soft">
        <summary className="cursor-pointer font-medium text-ink">공식 출처 {strategy.sources.length}개 · 자료 확인일</summary>
        <ul className="mt-2 grid gap-1">
          {strategy.sources.map((s) => (
            <li key={s.url} className="break-words">
              <a href={s.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-pen underline-offset-4 hover:underline">
                {s.title} <ExternalLink size={11} aria-hidden />
              </a>{" "}
              · {s.locator} · 확인 {s.checkedAt}
              {s.appliesTo ? ` · 적용 ${s.appliesTo}` : ""}
            </li>
          ))}
        </ul>
        <p className="mt-2">합격 가능성과 다른 사람의 선택은 순위에 넣지 않아요. 전략 비교표는 트랙 상세에서 볼 수 있어요.</p>
      </details>
    </div>
  );
}

function StatusTag({ status }: { status: MilitaryStrategyCandidate["status"] }) {
  const map = { computable: ["sage", "계산 가능"], conditional: ["marker", "조건부"], conflict: ["red", "이 회차 불가"], ineligible: ["red", "자격 확인 필요"] } as const;
  const [tone, label] = map[status];
  return <Tag tone={tone}>{label}</Tag>;
}

// ── 영역 B ───────────────────────────────────────────────

function PopularTop3() {
  const snap = getPopularitySnapshot();
  const show = snap.available && (!snap.demo || process.env.NODE_ENV !== "production");
  return (
    <section aria-labelledby="pop-title" className="rounded-[14px] border border-line bg-paper p-6">
      <h2 id="pop-title" className="flex items-center gap-2 font-serif text-[22px] font-bold">
        <Trophy size={20} className="text-red" aria-hidden /> 전체 트랙 인기 TOP 3
        {show && snap.demo && <Tag tone="red">시연용 예시 순위</Tag>}
      </h2>
      {show ? (
        <>
          <ol className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
            {snap.entries.map((e) => (
              <li key={e.trackKey} className="min-w-0 rounded-[10px] border border-line p-4">
                <p className="font-serif text-[26px] font-bold text-red">{e.rank}위</p>
                <p className="mt-1 text-[15px] font-semibold break-words">{e.label}</p>
                <p className="text-[12px] text-muted">{e.value}명 선택</p>
              </li>
            ))}
          </ol>
          <p className="mt-3 text-[12px] text-muted">
            {snap.scope} · {snap.from}~{snap.to} · 표본 {snap.sampleSize ?? "—"}명. 내 추천 순위와 따로 계산해요.
            {snap.demo && " 실제 사용자 통계가 아니에요."}
          </p>
        </>
      ) : (
        <p className="mt-3 max-w-[720px] text-[15px] text-ink-soft">
          <Hand className="mr-2 text-[19px]">아직이에요</Hand>
          {snap.unavailableReason}
        </p>
      )}
    </section>
  );
}
