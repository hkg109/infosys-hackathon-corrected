"use client";

import { ArrowLeft, BadgeCheck, Check, CircleAlert, CircleHelp, ExternalLink, Lightbulb, Plane, Shield, UserPen } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { CAREER_LABEL } from "@/contracts/careers";
import type { DatasetV2 } from "@/contracts/types";
import { emptyGenEd, formatTerm, matchCertificates, PACE_STYLE_LABEL, simulatePlan, termBreakdown, termIndex, termRange } from "@/engine";
import { CAREER_INFO } from "../careerInfo";
import { demoGenEd, evidenceFor } from "../evidence";
import { usePlanner } from "../PlannerApp";
import { candidatePlanInput, type Draft, gradeLabel, termMonths } from "../plan";
import type { Track } from "../tracks";
import { returnTerm, TrackCard, TrackThumb } from "./TrackGallery";
import { Button, Empty, GroupDot, Hand, LinkButton, Tag } from "./ui";

export function TrackDetail({ trackId }: { trackId: string }) {
  const { mounted, tracks, draft, dataset } = usePlanner();
  if (!mounted) return <div className="h-96 animate-pulse rounded bg-paper-2" aria-busy="true" />;
  const track = tracks?.tracks.find((t) => t.id === trackId);
  if (!tracks || !track || !draft || !dataset)
    return (
      <Empty title="이 트랙을 찾을 수 없어요" href="/match" cta="트랙 목록으로">
        입력을 바꾸면 트랙 목록도 새로 계산돼요. 목록에서 다시 골라 주세요.
      </Empty>
    );
  return <Detail track={track} all={tracks.tracks} draft={draft} dataset={dataset} />;
}

function Detail({ track, all, draft, dataset }: { track: Track; all: Track[]; draft: Draft; dataset: DatasetV2 }) {
  const { plan, setPlan } = usePlanner();
  const router = useRouter();
  const c = track.candidate;
  const res = c.result;
  const info = CAREER_INFO[track.career];
  const core = dataset.recommendation?.careers.find((x) => x.track === track.career)?.coreCourses ?? [];
  const placedAt = new Map<string, string>();
  for (const t of res?.terms ?? []) for (const x of t.courses) placedAt.set(x.code, formatTerm(t.term));
  const done = new Set(draft.completedCourseCodes);
  const similar = all.filter((t) => t.career === track.career && t.id !== track.id);
  const isBase = plan?.trackId === track.id;
  const s = track.stats;
  const evidence = evidenceFor(track, draft, dataset);
  const mil = track.militaryTrackId ? dataset.military?.tracks.find((t) => t.id === track.militaryTrackId) : null;
  const back = returnTerm(track);

  // 학점 구성(엔진 결과에서 읽기만)
  const totals = (res?.terms ?? []).reduce(
    (acc, t) => {
      const b = termBreakdown(t, emptyGenEd(), dataset);
      return { major: acc.major + b.major, ge: acc.ge + b.generalEducation, slot: acc.slot + b.unassigned, total: acc.total + b.total };
    },
    { major: 0, ge: 0, slot: 0, total: 0 },
  );

  const careerCerts = (dataset.military?.careerCertificates ?? []).filter((x) => x.career === track.career);
  const certName = (id: string) => dataset.military?.certificates.find((x) => x.id === id)?.officialName ?? id;
  const myCertMatches = track.militaryTrackId ? matchCertificates(track.militaryTrackId, draft.military.certificateIds, dataset.military) : [];
  const scoring = (dataset.military?.scoringRules ?? []).filter((r) => r.militaryTrackId === track.militaryTrackId);

  const decide = () => {
    const input = candidatePlanInput(c);
    if (!input) return;
    const result = simulatePlan(input, dataset);
    setPlan({
      schemaVersion: 4,
      input,
      trackId: track.id,
      trackTitle: track.title,
      exchange: track.exchangeTerm ? { startDate: termRange(track.exchangeTerm).start, endDate: termRange(track.exchangeTerm).end } : null,
      military: track.militaryLabel
        ? { label: track.militaryLabel, conditional: track.militaryRole === "conditional", monthsStatus: mil?.serviceMonthsStatus ?? "unknown" }
        : null,
      previous: null,
      lastChanges: [],
      confirmedAt: null,
      genEd: demoGenEd(result, draft.demo),
      previousGenEd: null,
    });
    router.push("/output");
  };

  let ord = draft.completedTerms ?? 0;

  return (
    <div>
      <Link href="/match" className="mb-6 inline-flex items-center gap-2 text-[14px] text-ink-soft hover:text-ink">
        <ArrowLeft size={15} aria-hidden /> 트랙 목록
      </Link>

      <section className="grid grid-cols-[320px_minmax(0,1fr)] gap-12">
        <TrackThumb track={track} big />
        <div className="flex flex-col">
          <p className="flex items-center gap-2 text-[13px] text-muted">
            <span className="font-serif text-[18px] font-bold text-red">추천 #{track.rank}</span>
            <span>·</span>
            <GroupDot group={track.career} /> {CAREER_LABEL[track.career]}
          </p>
          <h1 className="mt-2 font-serif text-[38px] leading-tight font-bold tracking-tight">{track.title}</h1>
          <p className="mt-2 text-[17px] text-ink-soft">
            {/* 한 줄 요약 */}
            {info.tagline}을 위한 트랙 — {track.subtitle}
            {res?.expectedCompletion ? `, ${formatTerm(res.expectedCompletion)}에 계획을 마쳐요.` : ", 완료 학기는 확인이 필요해요."}
          </p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {track.tags.map((t) => (
              <Tag key={t}>{t}</Tag>
            ))}
            {track.militaryRole === "conditional" && <Tag tone="red">선발 결과에 따라 달라지는 조건부 계획</Tag>}
            {c.status !== "computable" && track.militaryRole !== "conditional" && <Tag tone="red">확인 필요 있음</Tag>}
          </div>

          <dl className="mt-6 grid grid-cols-5 border-y-[1.5px] border-ink">
            <Stat label="예상 계획 완료" strong>
              {res?.expectedCompletion ? formatTerm(res.expectedCompletion) : "확인 필요"}
            </Stat>
            <Stat label="다닐 학기">{s.studyTerms}학기</Stat>
            <Stat label="학기 최대 / 평균">
              {s.maxCredits ?? "—"} / {s.avgCredits?.toFixed(1) ?? "—"}
            </Stat>
            <Stat label="3학년 / 4학년~ 평균">
              {s.year3Avg?.toFixed(1) ?? "—"} / {s.year4PlusAvg?.toFixed(1) ?? "—"}
            </Stat>
            <Stat label="확인 필요">{s.checkCount}건</Stat>
          </dl>

          <div className="mt-auto flex items-center gap-3 pt-7">
            <Button kind="stamp" onClick={decide} className="min-h-[56px] px-8 font-serif text-[18px] font-bold">
              {isBase ? "이 트랙으로 다시 시작" : "이 트랙을 기본으로 선택"}
            </Button>
            <LinkButton href="/match" kind="line" className="min-h-[56px] px-6">
              다른 트랙 보기
            </LinkButton>
            <Hand>고른 트랙이 기본 트랙이 되고, 다음 장에서 다듬어요.</Hand>
          </div>
        </div>
      </section>

      <div className="mt-12 grid grid-cols-[minmax(0,1fr)_400px] gap-12">
        <div className="grid content-start gap-10">
          <Block title="이 트랙이 추천된 이유">
            <ul className="grid gap-2 text-[15px]">
              {track.entry.reasons.map((r) => (
                <li key={r} className="flex gap-3">
                  <span className="mt-0.5 w-[18px] shrink-0 text-center font-bold text-red">·</span>
                  {r}
                </li>
              ))}
              {track.entry.reasons.length === 0 && <li className="text-ink-soft">비교할 수 있는 지표가 부족해 순위 이유를 만들지 못했어요.</li>}
            </ul>
          </Block>

          <Block title="장점">
            <ul className="grid gap-2.5">
              {track.highlights.map((h) => (
                <li key={h} className="flex gap-3 text-[15px]">
                  <Check size={18} className="mt-0.5 shrink-0 text-sage-ink" strokeWidth={2.5} aria-hidden />
                  {h}
                </li>
              ))}
            </ul>
          </Block>

          <Block title="주의할 점">
            {track.cautions.length === 0 ? (
              <p className="text-[14px] text-ink-soft">특별히 확인할 점이 없어요.</p>
            ) : (
              <ul className="grid gap-2 text-[14px] text-ink-soft">
                {track.cautions.map((x) => (
                  <li key={x} className="flex gap-2">
                    <CircleAlert size={16} className="mt-0.5 shrink-0 text-red" aria-hidden />
                    {x}
                  </li>
                ))}
              </ul>
            )}
          </Block>

          <Block title="군대·교환학생 일정">
            <div className="grid gap-2 text-[15px]">
              {track.militaryLabel || track.militaryStart ? (
                <p className="flex items-start gap-2">
                  <Shield size={17} className="mt-1 shrink-0 text-ink-soft" aria-hidden />
                  <span>
                    <b>{track.militaryLabel ?? "군 복무"}</b>
                    {track.militaryStart
                      ? ` — ${formatTerm(track.militaryStart)} 입대, ${back ? `${formatTerm(back)} 복학 계획` : "복학 학기는 계획 범위 밖"}`
                      : " — 입대 시점·복무기간을 확인하지 못해 로드맵에 군 복무 학기를 넣지 않았어요(확인 필요)."}
                    {mil && (
                      <Link href="/info/military" className="ml-2 text-pen underline-offset-4 hover:underline">
                        군대 트랙 정보
                      </Link>
                    )}
                  </span>
                </p>
              ) : (
                <p className="text-ink-soft">군 복무 기간이 없는 트랙이에요.</p>
              )}
              {track.exchangeTerm && (
                <p className="flex items-center gap-2">
                  <Plane size={17} className="text-ink-soft" aria-hidden /> {formatTerm(track.exchangeTerm)} 교환학생(인정 학점 미정 · 더하지 않음){" "}
                  <Link href="/info/exchange" className="text-pen underline-offset-4 hover:underline">
                    교환학생 정보
                  </Link>
                </p>
              )}
            </div>
          </Block>

          <Block title="전공·교양 학점 구성">
            <div className="grid grid-cols-4 border-y border-line text-center">
              <Mini label="배치한 전공 과목">{totals.major}학점</Mini>
              <Mini label="배치한 교양 과목">{totals.ge}학점</Mini>
              <Mini label="미지정 자리">{totals.slot}학점</Mini>
              <Mini label="계획 합계">{totals.total}학점</Mini>
            </div>
            <p className="mt-2 text-[12px] text-muted">미지정 자리는 다음 단계에서 2·3학점 교양 자리로 구체화할 수 있어요. 구체화해도 합계는 바뀌지 않아요.</p>
          </Block>

          <Block title="핵심 과목은 언제 듣나요">
            <ul className="border-t border-rule">
              {core.map((x) => {
                const name = dataset.courses.find((cc) => cc.code === x.courseCode)?.name ?? x.courseCode;
                return (
                  <li key={x.courseCode} className="grid grid-cols-[minmax(0,1fr)_130px] gap-4 border-b border-rule py-2.5">
                    <span>
                      <span className="text-[14px] font-semibold">{name}</span>
                      <span className="block text-[12px] text-muted">{x.reason}</span>
                    </span>
                    <span className="self-center text-right text-[13px] tabular-nums text-ink-soft">
                      {done.has(x.courseCode) ? "이미 들음" : (placedAt.get(x.courseCode) ?? "미배치")}
                    </span>
                  </li>
                );
              })}
            </ul>
          </Block>

          <Block title="준비할 자격증">
            {careerCerts.length > 0 && (
              <div>
                <p className="mb-1.5 text-[13px] font-medium text-muted">
                  진로 준비 <Tag tone="marker">서비스 추천</Tag>
                </p>
                <ul className="grid gap-1 text-[14px]">
                  {careerCerts.map((x) => (
                    <li key={x.certificateId}>
                      · <b className="font-medium">{certName(x.certificateId)}</b> — <span className="text-ink-soft">{x.reason}</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-1 text-[12px] text-muted">공식 필수 자격이 아니에요. 군 모집 분야의 공식 인정과도 별개예요.</p>
              </div>
            )}
            {mil && (
              <div className="mt-4">
                <p className="mb-1.5 text-[13px] font-medium text-muted">
                  {mil.officialName} 선발과의 관계 <Tag tone="sage">공식 자료 기준</Tag>
                </p>
                {mil.certificatesConsidered === "no" && <p className="text-[14px]">원문에서 자격증 반영(가산점)을 확인하지 못했어요. 자격증으로 유리해진다고 보지 않아요.</p>}
                {scoring.map((r) => (
                  <div key={r.id} className="text-[13px]">
                    <p className="font-medium">{r.title}</p>
                    <p className="text-ink-soft">{r.rows.map((x) => `${x.label} ${x.value}`).join(" · ")}</p>
                    <p className="text-muted">{r.note}</p>
                  </div>
                ))}
                {myCertMatches.length > 0 && (
                  <ul className="mt-2 grid gap-1 text-[13px]">
                    {myCertMatches.map((m) => (
                      <li key={m.certificate.id}>
                        · 보유 {m.certificate.officialName}: <span className={m.officialRelations.length ? "text-sage-ink" : "text-red"}>{m.note}</span>
                      </li>
                    ))}
                  </ul>
                )}
                <p className="mt-1 text-[12px] text-muted">합격 가능성이나 합산 점수를 계산하지 않아요.</p>
              </div>
            )}
          </Block>
        </div>

        <aside className="grid content-start gap-10">
          <Block title="학기별 미리보기">
            <ol className="relative border-l-2 border-line pl-5">
              {res?.terms.map((t) => {
                const label = t.status === "study" ? gradeLabel(ord++) : t.status === "exchange" ? "교환학생" : "군 복무·휴학";
                return (
                  <li key={termIndex(t.term)} className="relative pb-2.5">
                    <span
                      aria-hidden
                      className={`absolute top-1.5 -left-[27px] size-3 rounded-full border-2 border-paper ${
                        t.status === "study" ? "bg-ink" : t.status === "exchange" ? "bg-marker" : "bg-muted"
                      }`}
                    />
                    <p className="flex items-baseline justify-between text-[13px]">
                      <b className="font-semibold">
                        {formatTerm(t.term)} <span className="font-normal text-muted">{termMonths(t.term)}</span>
                      </b>
                      <span className="text-[12px] tabular-nums text-ink-soft">
                        {t.status === "study" ? `${t.plannedCredits}학점${t.capCredits ? ` / 상한 ${t.capCredits}` : ""}` : ""}
                      </span>
                    </p>
                    <p className={`text-[12px] ${t.status === "study" ? "text-ink-soft" : "font-semibold text-ink"}`}>
                      {label}
                      {t.status === "study" && t.courses.length > 0 && ` · ${t.courses.map((x) => x.name).slice(0, 2).join(", ")}${t.courses.length > 2 ? ` 외 ${t.courses.length - 2}` : ""}`}
                    </p>
                  </li>
                );
              })}
            </ol>
            {track.paceStyle !== "balanced" && <p className="mt-2 text-[12px] text-muted">{PACE_STYLE_LABEL[track.paceStyle]}: 학기 옆 ‘상한’이 학년마다 달라져요.</p>}
          </Block>

          <EvidenceList title="공식 자료로 확인된 항목" icon={<BadgeCheck size={16} className="text-sage-ink" aria-hidden />}>
            {evidence.verified.map((v) => (
              <li key={v.text}>
                {v.text}
                {v.href?.startsWith("https://") && (
                  <a href={v.href} target="_blank" rel="noreferrer" className="ml-1 inline-flex items-center gap-0.5 text-pen underline-offset-4 hover:underline">
                    원문 <ExternalLink size={11} aria-hidden />
                  </a>
                )}
              </li>
            ))}
          </EvidenceList>
          <EvidenceList title="서비스 추천·계획 방식" icon={<Lightbulb size={16} className="text-marker" aria-hidden />}>
            {evidence.service.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </EvidenceList>
          <EvidenceList title="사용자 가정" icon={<UserPen size={16} className="text-pen" aria-hidden />}>
            {evidence.assumption.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </EvidenceList>
          <EvidenceList title="아직 확인되지 않은 항목" icon={<CircleHelp size={16} className="text-red" aria-hidden />}>
            {evidence.unknown.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </EvidenceList>
        </aside>
      </div>

      {similar.length > 0 && (
        <section className="mt-14">
          <h2 className="mb-4 font-serif text-[22px] font-bold">같은 진로의 다른 트랙</h2>
          <div className="flex gap-5 overflow-x-auto pb-2">
            {similar.map((t) => (
              <div key={t.id} className="w-[320px] shrink-0">
                <TrackCard track={t} />
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="mb-3 font-serif text-[20px] font-bold">{title}</h2>
      {children}
    </section>
  );
}

function EvidenceList({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
  return (
    <section>
      <h2 className="mb-2 flex items-center gap-2 font-serif text-[16px] font-bold">
        {icon} {title}
      </h2>
      <ul className="grid gap-1.5 pl-1 text-[13px] leading-relaxed text-ink-soft [&>li]:before:mr-1 [&>li]:before:content-['·']">{children}</ul>
    </section>
  );
}

function Stat({ label, strong, children }: { label: string; strong?: boolean; children: ReactNode }) {
  return (
    <div className="border-r border-line px-4 py-3 last:border-r-0">
      <dt className="text-[11px] text-muted">{label}</dt>
      <dd className={`mt-0.5 font-serif font-bold tabular-nums ${strong ? "text-[20px] text-red" : "text-[17px]"}`}>{children}</dd>
    </div>
  );
}

function Mini({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="border-r border-line px-3 py-2.5 last:border-r-0">
      <p className="text-[11px] text-muted">{label}</p>
      <p className="font-serif text-[18px] font-bold tabular-nums">{children}</p>
    </div>
  );
}
