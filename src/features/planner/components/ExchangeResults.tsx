"use client";

import { ArrowLeft, ArrowRight, CircleAlert, ExternalLink, Plane } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, type ReactNode } from "react";
import type { DatasetV2, EligibilityEvaluation, ExchangeAction, ExchangeCandidateSet, ExchangeCatalog, ExchangeMatchCandidate, PartnerOffering, SourcedValue, TruthState } from "@/contracts/types";
import { formatTerm, PRIORITY_NO_DATA } from "@/engine";
import { exchangeSetFor, exPrefsOf, ordinalForTerm, PRIORITY_LABEL, wantsExchange } from "../exchangePrefs";
import { usePlanner } from "../PlannerApp";
import type { Draft } from "../plan";
import { Button, Empty, Hand, PageTitle, Tag } from "./ui";

// ── 진실 상태 배지(색만으로 구분하지 않고 글자로) ─────────
const TRUTH: Record<TruthState, { label: string; tone: "sage" | "plain" | "marker" | "red" }> = {
  verified_official: { label: "공식 자료", tone: "sage" },
  derived: { label: "공식 값으로 계산", tone: "sage" },
  service_analysis: { label: "서비스 분석", tone: "plain" },
  forecast: { label: "예상", tone: "marker" },
  user_provided: { label: "내 입력", tone: "plain" },
  stale: { label: "이전 회차 자료", tone: "marker" },
  source_conflict: { label: "자료 간 차이", tone: "red" },
  unknown: { label: "확인 필요", tone: "red" },
};
export const TruthTag = ({ t }: { t: TruthState }) => <Tag tone={TRUTH[t].tone}>{TRUTH[t].label}</Tag>;

const STATUS: Record<ExchangeMatchCandidate["status"], { label: string; tone: "sage" | "marker" | "red" }> = {
  eligible: { label: "지원 가능(선발 보장 아님)", tone: "sage" },
  conditional: { label: "조건부", tone: "marker" },
  ineligible: { label: "현재 기준 지원 어려움", tone: "red" },
  deadline_passed: { label: "이 회차 마감", tone: "red" },
  schedule_conflict: { label: "일정 충돌", tone: "red" },
};
const COMMON_STATUS = { eligible: "지원 가능", conditional: "조건부 가능", ineligible: "현재 차수 지원 어려움" } as const;

const resultMark = (r: EligibilityEvaluation["result"]) => (r === "pass" ? "충족" : r === "fail" ? "미충족" : "확인 필요");

function useExchange() {
  const { mounted, draft, dataset, tracks, today, catalog } = usePlanner();
  const set = useMemo(() => (draft && dataset ? exchangeSetFor(draft, dataset, tracks?.tracks ?? null, today) : null), [draft, dataset, tracks, today]);
  return { mounted, draft, dataset, set, catalog };
}

export function ExchangeResults() {
  const { mounted, draft, dataset, set, catalog } = useExchange();
  if (!mounted) return <div className="h-96 animate-pulse rounded bg-paper-2" aria-busy="true" />;
  if (!draft || !dataset)
    return (
      <Empty title={catalog ? "아직 내 정보가 없어요" : "자료를 불러오는 중…"} href="/input" cta="내 정보 입력하기">
        01 아(내 정보)에서 학업 정보를 먼저 알려 주세요.
      </Empty>
    );
  if (!wantsExchange(draft) || !set)
    return (
      <Empty title="교환학생 계획을 아직 시작하지 않았어요" href="/input/exchange" cta="교환학생 계획하기">
        교환 시기와 지원 학교까지 졸업·군 복무 계획에 함께 맞춰 볼 수 있어요.
      </Empty>
    );
  return <Results draft={draft} dataset={dataset} set={set} />;
}

function Results({ draft, dataset, set }: { draft: Draft; dataset: DatasetV2; set: ExchangeCandidateSet }) {
  const cat = dataset.exchange!;
  const off = (c: ExchangeMatchCandidate) => cat.offerings.find((o) => o.id === c.offeringId)!;
  const p = exPrefsOf(draft);
  const noData = p.priorities.flatMap((k) => (PRIORITY_NO_DATA[k] ? [PRIORITY_NO_DATA[k]!] : []));
  const term = set.primary?.exchangeTerm ?? set.all[0]?.exchangeTerm ?? null;
  return (
    <div>
      <PageTitle
        step="교환학생 계획"
        title={draft.name ? `${draft.name}님의 교환학생 전략` : "나의 교환학생 전략"}
        sub={`${term ? `${formatTerm(term)} 파견 기준 · ` : ""}${set.targetCycle?.label ?? ""}`}
        aside={
          <Link href="/match" className="inline-flex items-center gap-2 text-[14px] text-ink-soft hover:text-ink">
            <ArrowLeft size={15} aria-hidden /> 트랙 결과
          </Link>
        }
      />
      <div className="mb-6 flex flex-wrap gap-1.5">
        {[p.intent && { committed: "꼭 가고 싶음", conditional: "조건이 맞으면", considering: "고민 중", none: "" }[p.intent], ...p.priorities.map((k, i) => `${i + 1}순위 · ${PRIORITY_LABEL[k]}`), p.gpa !== null ? `GPA ${p.gpa}/4.5` : "GPA 미입력", p.language?.total ? `어학 ${p.language.total}` : "어학 성적 없음"]
          .filter(Boolean)
          .map((x) => (
            <Link key={x as string} href="/input/exchange" className="rounded-full bg-ink px-3 py-1 text-[12px] text-paper hover:bg-ink-soft">
              {x}
            </Link>
          ))}
      </div>

      <CommonBlock set={set} />

      {set.wholeSetConditional && (
        <p className="my-6 border-l-[3px] border-marker bg-marker/20 px-4 py-2.5 text-[14px]">
          <b>지원 조합 전체가 조건부예요.</b> {set.primary?.staleCycle ? "목표 학기 공고가 아직 없어 2027-1 본모집 자료로 계산했어요. 학교·기준·마감은 다음 공고에서 바뀔 수 있어요." : "세 후보 모두 확인이 필요한 조건이 남아 있어요."}
        </p>
      )}

      {!set.primary ? (
        <section className="my-8 rounded-[12px] border-[1.5px] border-ink p-6">
          <h2 className="font-serif text-[22px] font-bold">아직 추천할 학교가 없어요</h2>
          <p className="mt-2 text-[15px] text-ink-soft">{set.emptyReason}</p>
        </section>
      ) : (
        <div className="mt-8 grid gap-10">
          <section aria-labelledby="ex-primary">
            <h2 id="ex-primary" className="mb-3 font-hand text-[22px] leading-none text-red">
              나에게 맞는 1순위 교환학생 트랙
            </h2>
            <CandidateCard c={set.primary} o={off(set.primary)} draft={draft} set={set} primary />
          </section>
          <section aria-labelledby="ex-backups">
            <h2 id="ex-backups" className="mb-3 font-serif text-[20px] font-bold">
              위험을 나눈 백업 {set.backups.length}개
            </h2>
            {set.backups.length === 0 ? (
              <p className="text-[14px] text-ink-soft">1순위와 다른 위험을 가진 후보가 없어 백업을 만들지 않았어요(가짜 후보를 채우지 않아요).</p>
            ) : (
              <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,380px),1fr))] gap-5">
                {set.backups.map((b, i) => (
                  <CandidateCard key={b.id} c={b} o={off(b)} draft={draft} set={set} note={backupNote(set.primary!, b, i)} />
                ))}
              </div>
            )}
            <p className="mt-3 text-[12px] text-muted">화면의 백업 수는 한양대 지원서의 희망 대학 수(최대 15개, 2027-1 공고)와 달라요.</p>
          </section>
          {noData.length > 0 && <p className="text-[13px] text-ink-soft">· {noData.join(" · ")}</p>}
          <Branches set={set} />
        </div>
      )}

      <Timeline actions={set.actions} catalog={cat} />

      <p className="mt-10 border-t border-dashed border-line pt-4 text-[12px] text-muted">
        공식 합격이나 학점 인정을 보장하지 않아요. TO는 정원 정보이며 합격 확률이 아니에요. 자료: {cat.catalogVersion} · 확인일 {cat.reviewedAt}. 전체 {set.all.length}개 후보 중 추천 대상만 보여 드려요.
      </p>
    </div>
  );
}

function backupNote(p: ExchangeMatchCandidate, b: ExchangeMatchCandidate, i: number): string {
  const label: Record<string, string> = { course_access: "전공 과목 제한", language: "어학 기준 부담", housing: "기숙사 없음", gpa: "GPA 비교 불가·미달", schedule: "군 복무 일정" };
  const top = p.riskKeys.find((k) => label[k]);
  if (top && !b.riskKeys.includes(top)) return `백업 ${i + 1} · 1순위의 ‘${label[top]}’ 위험을 줄여요`;
  return `백업 ${i + 1} · 1순위와 다른 국가·조건으로 나눴어요`;
}

function CommonBlock({ set }: { set: ExchangeCandidateSet }) {
  const s = set.common.status;
  return (
    <section aria-labelledby="ex-common" className="rounded-[12px] border border-line bg-paper p-5">
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="ex-common" className="font-serif text-[18px] font-bold">
          한양대 공통 지원 자격
        </h2>
        <Tag tone={s === "eligible" ? "sage" : s === "conditional" ? "marker" : "red"}>{COMMON_STATUS[s]}</Tag>
      </div>
      <p className="mt-1 text-[12px] text-muted">최소 자격 충족은 선발을 뜻하지 않아요. 선발은 누적 GPA·어학성적 서류 종합평가예요(2027-1 공고).</p>
      <ul className="mt-3 grid gap-1.5 text-[13px] md:grid-cols-2">
        {set.common.evaluations.map((e) => (
          <li key={e.ruleId} className="flex min-w-0 items-start gap-2">
            <span className={`shrink-0 font-semibold ${e.result === "fail" ? "text-red" : e.result === "pass" ? "text-sage-ink" : "text-ink-soft"}`}>{resultMark(e.result)}</span>
            <span className="min-w-0 break-words">
              {e.reason} <TruthTag t={e.truth} />
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function CandidateCard({ c, o, draft, set, primary, note }: { c: ExchangeMatchCandidate; o: PartnerOffering; draft: Draft; set: ExchangeCandidateSet; primary?: boolean; note?: string }) {
  const { updateDraft, dataset } = usePlanner();
  const cat = dataset!.exchange!;
  const router = useRouter();
  const choose = () => {
    const ord = ordinalForTerm(draft, c.exchangeTerm);
    updateDraft((x) => ({
      ...x,
      exchange: ord !== null ? { mode: "pick", ordinal: ord } : x.exchange,
      exchangeChoice: {
        candidateId: c.id,
        offeringId: o.id,
        universityName: o.universityName,
        country: o.country,
        term: c.exchangeTerm,
        duration: c.duration,
        status: c.status,
        staleCycle: c.staleCycle,
        backupNames: [set.primary, ...set.backups].filter((b): b is ExchangeMatchCandidate => !!b && b.id !== c.id).map((b) => cat.offerings.find((x) => x.id === b.offeringId)?.universityName ?? b.offeringId),
        catalogVersion: set.catalogVersion,
        inputFingerprint: set.inputFingerprint,
        recognition: { credits: null, countsAsTerm: null, status: "unknown" },
        selectedAt: new Date().toISOString(),
      },
    }));
    router.push("/match");
  };
  const chosen = draft.exchangeChoice?.candidateId === c.id;
  const biggest = c.risks[0];
  return (
    <article className={`min-w-0 rounded-[12px] border bg-paper p-5 ${primary ? "border-[1.5px] border-ink shadow-[0_14px_30px_-22px_rgba(40,30,10,0.55)]" : "border-line"}`}>
      {note && <p className="mb-2 text-[12px] font-semibold text-pen">{note}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <Plane size={18} className="text-pen" aria-hidden />
        <h3 className={`min-w-0 font-serif font-bold break-words ${primary ? "text-[26px]" : "text-[19px]"}`}>{o.universityName}</h3>
        <span className="text-[13px] text-muted">{o.country}</span>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <Tag tone={STATUS[c.status].tone}>{STATUS[c.status].label}</Tag>
        {c.staleCycle && <TruthTag t="stale" />}
        <Tag>
          {formatTerm(c.exchangeTerm)} · {c.duration === "one_year" ? "1년" : "한 학기"} · {o.academicSystem.value ?? "학제 확인"}
        </Tag>
        <Tag tone={c.courseAccess.status === "limited" ? "red" : "plain"}>{c.courseAccess.status === "limited" ? "전공 과목 제한 있음" : "전공 과목 확인 필요"}</Tag>
        <Tag>학점 인정 미정</Tag>
      </div>
      <ul className="mt-3 grid gap-1 text-[14px]">
        {c.reasons.slice(0, 3).map((r) => (
          <li key={r} className="flex gap-2">
            <span className="font-bold text-sage-ink">+</span>
            <span className="min-w-0">{r}</span>
          </li>
        ))}
      </ul>
      {biggest && (
        <p className="mt-2 flex gap-2 text-[13px] text-ink-soft">
          <CircleAlert size={15} className="mt-0.5 shrink-0 text-red" aria-hidden />
          <span className="min-w-0">가장 큰 위험: {biggest}</span>
        </p>
      )}
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 border-t border-rule pt-3 text-[12px] md:grid-cols-4">
        <Mini label="졸업 영향">교환 학기 국내 과목 없음 · 인정학점 미정 → 완료 학기 미정</Mini>
        <Mini label="군 복무">{c.militaryConflicts.length === 0 ? "겹침 없음" : c.militaryConflicts.map((m) => (m.kind === "hard" ? "확정 일정과 겹침" : "일부 분기에서 겹침")).join(", ")}</Mini>
        <Mini label="TO(정원)">{o.quota.value ?? "확인 필요"}명 · 확률 아님</Mini>
        <Mini label="기숙사">{o.housing.onCampus === "available_not_guaranteed" ? "신청 가능(보장 아님)" : o.housing.onCampus === "unavailable" ? "교내 없음" : "확인 필요"}</Mini>
      </dl>
      <p className="mt-3 text-[13px]">
        <b>다음 행동</b> · {c.staleCycle ? "다음 회차 공고에서 이 학교가 열리는지 확인" : "공고 마감 전 지원서 준비"}
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Link href={`/exchange/${encodeURIComponent(c.id)}`} className="inline-flex min-h-[44px] items-center gap-2 rounded-[6px] border-[1.5px] border-ink/70 px-4 text-[14px] font-medium hover:bg-paper-2">
          학교 상세·근거 <ArrowRight size={15} aria-hidden />
        </Link>
        <Button kind={primary ? "stamp" : "line"} onClick={choose} className="min-h-[44px]">
          {chosen ? "선택됨 · 트랙에 반영" : "이 전략으로 계획하기"}
        </Button>
      </div>
    </article>
  );
}

const Mini = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="min-w-0">
    <dt className="text-[10.5px] text-muted">{label}</dt>
    <dd className="break-words">{children}</dd>
  </div>
);

function Branches({ set }: { set: ExchangeCandidateSet }) {
  const stages = [
    { title: "한양대 선발 결과", note: "한양대가 먼저 선발·배정해요", events: ["hanyang_selected", "hanyang_not_selected"] },
    { title: "파견교 심사 결과", note: "한양대 선발 이후 파견교에 따로 지원해요", events: ["host_accepted", "host_rejected"] },
    { title: "수강·주거 준비", note: "파견교 수락 후 상황별로 확인해요", events: ["primary_courses_approved", "backup_courses_required", "housing_secured", "housing_not_secured"] },
    { title: "귀국 후 학점 인정", note: "인정 결과가 나올 때까지 완료 학기는 미정이에요", events: ["credit_fully_recognized", "credit_partially_recognized", "credit_pending"] },
  ] as const;
  const cancelled = set.branches.filter((b) => b.event === "user_cancelled");
  const shown = new Set<string>([...stages.flatMap((s) => [...s.events]), "user_cancelled"]);
  const other = set.branches.filter((b) => !shown.has(b.event));
  return (
    <section aria-labelledby="ex-branches">
      <h2 id="ex-branches" className="mb-1 font-serif text-[22px] font-bold">
        결과에 따라 이렇게 갈라져요
      </h2>
      <p className="mb-6 text-[13px] text-ink-soft">한양대 선발 → 파견교 수락 → 수강 준비 → 귀국 후 학점 인정 순서로 확인하세요. 합격 확률은 계산하지 않아요.</p>
      <ol className="grid gap-5">
        {stages.map((stage, index) => {
          const branches = set.branches.filter((b) => (stage.events as readonly string[]).includes(b.event));
          if (branches.length === 0) return null;
          return (
            <li key={stage.title} className="min-w-0 rounded-[12px] border border-line bg-paper p-5">
              <div className="mb-4 flex items-start gap-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-full bg-pen font-serif text-[17px] font-bold text-paper" aria-hidden>{index + 1}</span>
                <div className="min-w-0">
                  <h3 className="font-serif text-[19px] font-bold">{stage.title}</h3>
                  <p className="text-[12px] text-muted">{stage.note}</p>
                </div>
              </div>
              <ul className="grid gap-3 md:grid-cols-2">
                {branches.map((branch) => (
                  <li key={branch.id} className={`min-w-0 rounded-[8px] border p-4 ${branch.event === "hanyang_not_selected" || branch.event === "host_rejected" || branch.event === "housing_not_secured" ? "border-red/40 bg-red-soft/20" : "border-line bg-paper-2/60"}`}>
                    <p className="text-[15px] font-semibold break-words">{branch.title}</p>
                    <p className="mt-1 text-[11px] text-muted">{branch.parentId ? `앞 단계: ${set.branches.find((b) => b.id === branch.parentId)?.title ?? "결과 확인"}` : "지원 결과에 따라 선택"}</p>
                    <ul className="mt-3 grid gap-2 border-t border-line pt-3 text-[13px] text-ink-soft">
                      {branch.nextActions.map((action, i) => (
                        <li key={`${branch.id}-${i}`} className="flex items-start gap-2 break-words">
                          <span className="shrink-0 font-bold text-pen" aria-hidden>→</span>
                          <span className="min-w-0">{action}</span>
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            </li>
          );
        })}
      </ol>
      {(cancelled.length > 0 || other.length > 0) && (
        <div className="mt-5 rounded-[10px] border border-dashed border-line bg-paper px-5 py-4">
          <h3 className="font-serif text-[17px] font-bold">그 밖의 상황</h3>
          <ul className="mt-3 grid gap-3 md:grid-cols-2">
            {[...cancelled, ...other].map((branch) => (
              <li key={branch.id} className="min-w-0">
                <p className="text-[14px] font-semibold">{branch.title}</p>
                <ul className="mt-1 grid gap-1 text-[12px] text-ink-soft">
                  {branch.nextActions.map((action, i) => <li key={`${branch.id}-${i}`}>· {action}</li>)}
                </ul>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

const TIMING: Record<ExchangeAction["timing"], string> = {
  before_application: "지원 전",
  after_home_selection: "한양대 선발 후",
  before_exchange: "출국 전",
  during_exchange: "파견 중",
  after_exchange: "귀국 후",
};

function Timeline({ actions, catalog }: { actions: ExchangeAction[]; catalog: ExchangeCatalog }) {
  const { checked, toggleChecked } = usePlanner();
  if (actions.length === 0) return null;
  const groups = Object.keys(TIMING) as Array<ExchangeAction["timing"]>;
  return (
    <section aria-labelledby="ex-timeline" className="mt-12">
      <h2 id="ex-timeline" className="font-serif text-[22px] font-bold">
        지원부터 귀국까지 준비 로드맵
      </h2>
      <p className="mb-4 text-[12px] text-muted">공식 날짜만 날짜로 보여요. 공고가 없는 단계는 ‘공고 확인 필요’로 남겨요.</p>
      <ol className="grid gap-5">
        {groups.map((g) => {
          const items = actions.filter((a) => a.timing === g);
          if (items.length === 0) return null;
          return (
            <li key={g} className="grid grid-cols-1 gap-2 md:grid-cols-[120px_minmax(0,1fr)]">
              <p className="font-serif text-[15px] font-bold text-red">{TIMING[g]}</p>
              <ul className="grid gap-2">
                {items.map((a) => (
                  <li key={a.id} className="min-w-0 rounded-[8px] border border-line px-3 py-2">
                    <label className="flex cursor-pointer items-start gap-2.5">
                      <input type="checkbox" className="mt-1 shrink-0" checked={!!checked[a.checkKey]} onChange={() => toggleChecked(a.checkKey)} />
                      <span className="min-w-0">
                        <span className={`block text-[14px] font-medium ${checked[a.checkKey] ? "text-muted line-through" : ""}`}>{a.title}</span>
                        <span className="block text-[12px] break-words text-ink-soft">{a.detail}</span>
                        <span className="mt-1 flex flex-wrap items-center gap-1.5 text-[12px]">
                          <DueBadge v={a.dueAt} catalog={catalog} />
                        </span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function DueBadge({ v }: { v: SourcedValue<string>; catalog: ExchangeCatalog }) {
  return (
    <>
      <TruthTag t={v.truth} />
      <span className="break-words">{v.value ?? v.note ?? "공고 확인 필요"}</span>
    </>
  );
}

// ── 학교 상세 ───────────────────────────────────────────

export function ExchangeDetail({ id }: { id: string }) {
  const { mounted, draft, dataset, set } = useExchange();
  if (!mounted) return <div className="h-96 animate-pulse rounded bg-paper-2" aria-busy="true" />;
  const c = set?.all.find((x) => x.id === id);
  const o = c ? dataset?.exchange?.offerings.find((x) => x.id === c.offeringId) : null;
  if (!draft || !dataset?.exchange || !set || !c || !o)
    return (
      <Empty title="이 교환 후보를 찾을 수 없어요" href="/exchange" cta="교환학생 결과로">
        입력을 바꾸면 후보가 새로 계산돼요.
      </Empty>
    );
  const cat = dataset.exchange;
  const src = (ids: string[]) => cat.sources.filter((s) => ids.includes(s.id));
  const cycle = cat.cycles.find((x) => x.id === o.applicationCycleId)!;
  return (
    <div>
      <Link href="/exchange" className="mb-6 inline-flex items-center gap-2 text-[14px] text-ink-soft hover:text-ink">
        <ArrowLeft size={15} aria-hidden /> 교환학생 결과
      </Link>
      <h1 className="font-serif text-[32px] leading-tight font-bold break-words">{o.universityName}</h1>
      <p className="mt-1 text-[15px] text-ink-soft">
        {o.country} · {formatTerm(c.exchangeTerm)} 파견 · {c.duration === "one_year" ? "1년" : "한 학기"} · 자료: {cycle.label}
      </p>
      <div className="mt-3 flex flex-wrap gap-1.5">
        <Tag tone={STATUS[c.status].tone}>{STATUS[c.status].label}</Tag>
        {c.staleCycle && <TruthTag t="stale" />}
        <Tag>학점 인정 미정</Tag>
      </div>
      {c.risks[0] && <p className="mt-3 text-[14px] text-red">가장 큰 확인 필요: {c.risks[0]}</p>}

      <div className="mt-8 grid grid-cols-1 gap-10 xl:grid-cols-[minmax(0,1fr)_minmax(0,360px)]">
        <div className="grid min-w-0 content-start gap-10">
          <Block title="자격 — 한양대와 파견교를 나눠서">
            <ul className="grid gap-2">
              {c.eligibility.map((e) => (
                <li key={e.ruleId} className="grid min-w-0 grid-cols-1 gap-1 rounded-[8px] border border-line px-3 py-2 text-[13px] md:grid-cols-[80px_minmax(0,1fr)_90px]">
                  <span className="text-muted">{e.owner === "hanyang" ? "한양대" : "파견교"}</span>
                  <span className="min-w-0 break-words">
                    <b className="font-medium">{e.label}</b>
                    <span className="block text-ink-soft">{e.reason}</span>
                  </span>
                  <span className="flex flex-wrap items-start gap-1">
                    <span className={e.result === "fail" ? "font-semibold text-red" : e.result === "pass" ? "font-semibold text-sage-ink" : "text-ink-soft"}>{resultMark(e.result)}</span>
                    <TruthTag t={e.truth} />
                  </span>
                </li>
              ))}
            </ul>
            <Raw label="파견교 GPA 원문" value={o.gpaRaw} />
            {o.language.map((l) => (
              <Raw key={l.test} label={`${l.test === "IELTS_ACADEMIC" ? "IELTS" : "TOEFL iBT"} 원문(${l.scaleVersion})`} value={l.raw} />
            ))}
          </Block>

          <Block title="전공과목">
            <p className="text-[14px]">
              <Tag tone={c.courseAccess.status === "limited" ? "red" : "plain"}>{c.courseAccess.status === "limited" ? "교환학생 수강 제한" : "수강 가능 여부 확인 필요"}</Tag> <TruthTag t="service_analysis" />
            </p>
            <ul className="mt-2 grid gap-1 text-[13px] text-ink-soft">
              {c.courseAccess.reasons.map((r) => (
                <li key={r}>· {r}</li>
              ))}
              <li>· 현재 학기 개설·선수과목·정원·한양대 인정은 모두 확인 필요예요. 1순위와 백업 과목을 함께 준비하세요.</li>
            </ul>
            <Raw label="엑셀 ‘수강불가 학과’ 원문" value={o.closedDepartments.value ?? "—"} />
            <Raw label="최소·최대 수강학점(엑셀)" value={o.creditLoad.value ? `${o.creditLoad.value.min} / ${o.creditLoad.value.max}` : "—"} />
            {o.links.courses && <ExtLink href={o.links.courses}>교환학생 수업 안내(파견교)</ExtLink>}
          </Block>

          <Block title="일정">
            <ul className="grid gap-1.5 text-[13px]">
              <Row label="한양대 지원" v={cycle.applicationWindow.value ? `${cycle.applicationWindow.value.start}~${cycle.applicationWindow.value.end}` : null} t={c.staleCycle ? "stale" : cycle.applicationWindow.truth} note={cycle.applicationWindow.note} />
              <Row label="노미네이션 마감" v={o.deadlines.nomination.value} t={c.staleCycle ? "stale" : o.deadlines.nomination.truth} note={c.staleCycle ? "2027-1 기준 — 다음 회차 확인 필요" : undefined} />
              <Row label="파견교 지원 마감" v={o.deadlines.application.value} t={c.staleCycle ? "stale" : o.deadlines.application.truth} note={c.staleCycle ? "2027-1 기준 — 다음 회차 확인 필요" : undefined} />
              <Row label="개강·종강" v={o.calendar.value ? `${o.calendar.value.start} ~ ${o.calendar.value.end}` : null} t={c.staleCycle ? "stale" : o.calendar.truth} note={o.calendar.note} />
              <Row label="비자·보험·기숙사 신청" v={null} t="unknown" note="파견교 안내 확인" />
              <Row label="귀국 후 학점 인정 신청" v={null} t="verified_official" note="다음 학기 말까지(봄 파견 2월 말, 가을 파견 8월 말 — 2027-1 공고)" />
            </ul>
          </Block>

          <Block title="비용·주거">
            <p className="text-[13px]">
              {cycle.tuition.value} <TruthTag t={cycle.tuition.truth} />
            </p>
            <p className="mt-1 text-[13px] text-ink-soft">생활비·주거비·보험·비자·항공 비용은 공식 자료가 없어 금액으로 보여 주지 않아요(확인 필요).</p>
            <p className="mt-2 text-[13px]">
              기숙사: {o.housing.onCampus === "available_not_guaranteed" ? "교내 기숙사 신청 가능 — 배정 보장 아님" : o.housing.onCampus === "unavailable" ? "교내 기숙사 없음 — 교외 숙소 준비" : "확인 필요"} <TruthTag t={c.staleCycle ? "stale" : o.housing.source.truth} />
            </p>
          </Block>
        </div>

        <aside className="grid min-w-0 content-start gap-6">
          <Block title="학점 인정(안내)">
            <ul className="grid gap-1 text-[12px] text-ink-soft">
              {(cycle.creditRecognition.value ?? []).map((x) => (
                <li key={x} className="break-words">
                  · {x}
                </li>
              ))}
            </ul>
            <p className="mt-2 text-[12px]">
              <Hand className="mr-1 text-[16px]">미정</Hand>이번 계획은 인정학점을 계산하지 않아요. 교환 학기에는 국내 과목을 넣지 않고, 완료 학기는 인정학점이 정해진 뒤 계산해요.
            </p>
          </Block>
          <Block title="근거 보기">
            <ul className="grid gap-2 text-[12px]">
              {src([...o.sourceRefs, ...cycle.sourceRefs, ...(c.eligibility.flatMap((e) => e.sourceRefs) ?? [])].filter((x, i, a) => a.indexOf(x) === i)).map((s) => (
                <li key={s.id} className="min-w-0 break-words">
                  {s.url ? <ExtLink href={s.url}>{s.title}</ExtLink> : <b>{s.title}</b>}
                  <span className="block text-muted">
                    {s.sheet ? `시트 ‘${s.sheet}’ ${s.cellRange} · ` : ""}
                    {s.page ? `${s.page}쪽 · ` : ""}
                    게시 {s.publishedAt ?? "—"} · 확인 {s.checkedAt} · {s.reviewer ? `검토 ${s.reviewer}` : "사람 검토 전"}
                  </span>
                  <span className="block text-ink-soft">{s.excerptSummary}</span>
                </li>
              ))}
            </ul>
          </Block>
        </aside>
      </div>
    </div>
  );
}

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="min-w-0">
      <h2 className="mb-3 border-b-[1.5px] border-ink pb-1.5 font-serif text-[19px] font-bold">{title}</h2>
      {children}
    </section>
  );
}
const Raw = ({ label, value }: { label: string; value: string }) => (
  <p className="mt-2 text-[12px] break-words text-ink-soft">
    <span className="text-muted">{label}: </span>“{value}”
  </p>
);
const Row = ({ label, v, t, note }: { label: string; v: string | null; t: TruthState; note?: string }) => (
  <li className="flex min-w-0 flex-wrap items-center gap-2 border-b border-rule pb-1.5">
    <span className="w-[130px] shrink-0 text-muted">{label}</span>
    <span className="min-w-0 break-words">{v ?? "공고 확인 필요"}</span>
    <TruthTag t={t} />
    {note && <span className="text-[11px] break-words text-muted">{note}</span>}
  </li>
);
const ExtLink = ({ href, children }: { href: string; children: ReactNode }) => (
  <a href={href} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 break-all text-pen underline-offset-4 hover:underline">
    {children} <ExternalLink size={11} aria-hidden className="shrink-0" />
  </a>
);
