"use client";

import { ArrowLeft, Check, CircleAlert, Plane, Shield } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { CAREER_LABEL } from "@/contracts/careers";
import { formatTerm, termIndex, termRange } from "@/engine";
import { CAREER_INFO } from "../careerInfo";
import { usePlanner } from "../PlannerApp";
import { candidatePlanInput, gradeLabel, termMonths } from "../plan";
import type { Track } from "../tracks";
import { TrackCard, TrackThumb } from "./TrackGallery";
import { Button, Empty, GroupDot, Hand, Tag } from "./ui";

export function TrackDetail({ trackId }: { trackId: string }) {
  const { mounted, tracks } = usePlanner();
  if (!mounted) return <div className="h-96 animate-pulse rounded bg-paper-2" aria-busy="true" />;
  const track = tracks?.tracks.find((t) => t.id === trackId);
  if (!tracks || !track)
    return (
      <Empty title="이 트랙을 찾을 수 없어요" href="/match" cta="트랙 목록으로">
        입력을 바꾸면 트랙 목록도 새로 계산돼요. 목록에서 다시 골라 주세요.
      </Empty>
    );
  return <Detail track={track} all={tracks.tracks} />;
}

function Detail({ track, all }: { track: Track; all: Track[] }) {
  const { draft, dataset, plan, setPlan } = usePlanner();
  const router = useRouter();
  const c = track.candidate;
  const res = c.result;
  const info = CAREER_INFO[track.career];
  const core = dataset?.recommendation?.careers.find((x) => x.track === track.career)?.coreCourses ?? [];
  const placedAt = new Map<string, string>();
  for (const t of res?.terms ?? []) for (const x of t.courses) placedAt.set(x.code, formatTerm(t.term));
  const done = new Set(draft?.completedCourseCodes ?? []);
  const study = res?.terms.filter((t) => t.status === "study") ?? [];
  const avg = study.length ? study.reduce((a, t) => a + t.plannedCredits, 0) / study.length : null;
  const similar = all.filter((t) => t.career === track.career && t.id !== track.id);
  const isBase = plan?.trackId === track.id;

  const decide = () => {
    const input = candidatePlanInput(c);
    if (!input) return;
    setPlan({
      schemaVersion: 3,
      input,
      trackId: track.id,
      trackTitle: track.title,
      exchange: track.exchangeTerm
        ? { startDate: termRange(track.exchangeTerm).start, endDate: termRange(track.exchangeTerm).end }
        : null,
      previous: null,
      lastChanges: [],
      confirmedAt: null,
    });
    router.push("/output");
  };

  // 학년 표시용 순번
  let ord = draft?.completedTerms ?? 0;

  return (
    <div>
      <Link href="/match" className="mb-6 inline-flex items-center gap-2 text-[14px] text-ink-soft hover:text-ink">
        <ArrowLeft size={15} aria-hidden /> 트랙 목록
      </Link>

      {/* 상단: 썸네일 + 정보 */}
      <section className="grid grid-cols-[340px_minmax(0,1fr)] gap-12">
        <TrackThumb track={track} big />
        <div className="flex flex-col">
          <p className="flex items-center gap-2 text-[13px] text-muted">
            <span className="font-serif text-[18px] font-bold text-red">추천 #{track.rank}</span>
            <span>·</span>
            <GroupDot group={track.career} /> {CAREER_LABEL[track.career]}
          </p>
          <h1 className="mt-2 font-serif text-[38px] leading-tight font-bold tracking-tight">{track.title}</h1>
          <p className="mt-1 text-[15px] text-ink-soft">{track.subtitle}</p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {track.tags.map((t) => (
              <Tag key={t}>{t}</Tag>
            ))}
            {c.status !== "computable" && <Tag tone="red">확인 필요 있음</Tag>}
          </div>

          <dl className="mt-6 grid grid-cols-4 border-y-[1.5px] border-ink">
            <Stat label="예상 계획 완료" strong>
              {res?.expectedCompletion ? formatTerm(res.expectedCompletion) : "확인 필요"}
            </Stat>
            <Stat label="다닐 학기">{study.length}학기</Stat>
            <Stat label="학기 평균">{avg === null ? "—" : `${avg.toFixed(1)}학점`}</Stat>
            <Stat label="질문 적합도">
              {track.match.matchedAnswers}/5
            </Stat>
          </dl>

          <div className="mt-auto flex items-center gap-3 pt-7">
            <Button kind="stamp" onClick={decide} className="px-7 py-3 font-serif text-[17px] font-bold">
              {isBase ? "이 트랙으로 다시 시작" : "이 트랙으로 결정"}
            </Button>
            <Hand>고른 트랙이 기본 트랙이 되고, 다음 장에서 나에게 맞게 다듬어요.</Hand>
          </div>
        </div>
      </section>

      <div className="mt-12 grid grid-cols-[minmax(0,1fr)_380px] gap-12">
        <div className="grid content-start gap-10">
          <Block title="이 트랙의 장점">
            <ul className="grid gap-2.5">
              {track.highlights.map((h) => (
                <li key={h} className="flex gap-3 text-[15px]">
                  <Check size={18} className="mt-0.5 shrink-0 text-sage-ink" strokeWidth={2.5} aria-hidden />
                  {h}
                </li>
              ))}
              {track.entry.reasons.map((r) => (
                <li key={r} className="flex gap-3 text-[14px] text-ink-soft">
                  <span className="mt-0.5 w-[18px] shrink-0 text-center text-muted">·</span>
                  {r}
                </li>
              ))}
            </ul>
          </Block>

          <Block title="어떤 트랙인가요">
            <p className="font-hand text-[24px] leading-tight text-pen">{info.tagline}</p>
            <p className="mt-2 text-[15px] leading-relaxed text-ink-soft">{info.summary}</p>
            <div className="mt-4 grid grid-cols-2 gap-6 text-[14px]">
              <div>
                <p className="mb-1.5 text-[12px] font-medium text-muted">이런 사람에게</p>
                <ul className="grid gap-1">
                  {info.fits.map((f) => (
                    <li key={f}>· {f}</li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="mb-1.5 text-[12px] font-medium text-muted">이어지는 길 (예시)</p>
                <ul className="grid gap-1">
                  {info.jobs.map((j) => (
                    <li key={j}>· {j}</li>
                  ))}
                </ul>
              </div>
            </div>
            {(track.militaryStart || track.exchangeTerm) && (
              <div className="mt-5 grid gap-2 border-t border-dashed border-line pt-4 text-[14px]">
                {track.militaryStart && (
                  <p className="flex items-center gap-2">
                    <Shield size={16} className="text-ink-soft" aria-hidden /> {formatTerm(track.militaryStart)}에 입대하는 흐름이에요.{" "}
                    <Link href="/info/military" className="text-pen underline-offset-4 hover:underline">
                      군대 정보 보기
                    </Link>
                  </p>
                )}
                {track.exchangeTerm && (
                  <p className="flex items-center gap-2">
                    <Plane size={16} className="text-ink-soft" aria-hidden /> {formatTerm(track.exchangeTerm)}에 교환학생을 다녀와요.{" "}
                    <Link href="/info/exchange" className="text-pen underline-offset-4 hover:underline">
                      교환학생 정보 보기
                    </Link>
                  </p>
                )}
              </div>
            )}
          </Block>

          <Block title="핵심 과목은 언제 듣나요">
            <ul className="border-t border-rule">
              {core.map((x) => {
                const name = dataset?.courses.find((cc) => cc.code === x.courseCode)?.name ?? x.courseCode;
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
        </div>

        <aside className="grid content-start gap-10">
          <Block title="학기 흐름">
            <ol className="relative border-l-2 border-line pl-5">
              {res?.terms.map((t) => {
                const label = t.status === "study" ? gradeLabel(ord++) : t.status === "exchange" ? "교환학생" : "군 복무·휴학";
                return (
                  <li key={termIndex(t.term)} className="relative pb-3">
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
                      <span className="text-[12px] tabular-nums text-ink-soft">{t.status === "study" ? `${t.plannedCredits}학점` : ""}</span>
                    </p>
                    <p className={`text-[12px] ${t.status === "study" ? "text-ink-soft" : "font-semibold text-ink"}`}>{label}</p>
                  </li>
                );
              })}
            </ol>
          </Block>

          {track.cautions.length > 0 && (
            <Block title="확인할 점">
              <ul className="grid gap-2 text-[13px] text-ink-soft">
                {track.cautions.map((x) => (
                  <li key={x} className="flex gap-2">
                    <CircleAlert size={15} className="mt-0.5 shrink-0 text-red" aria-hidden />
                    {x}
                  </li>
                ))}
              </ul>
            </Block>
          )}
        </aside>
      </div>

      {similar.length > 0 && (
        <section className="mt-14">
          <h2 className="mb-4 font-serif text-[22px] font-bold">같은 진로의 다른 트랙</h2>
          <div className="flex gap-5 overflow-x-auto pb-2">
            {similar.map((t) => (
              <div key={t.id} className="w-[200px] shrink-0">
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

function Stat({ label, strong, children }: { label: string; strong?: boolean; children: ReactNode }) {
  return (
    <div className="border-r border-line px-4 py-3 last:border-r-0">
      <dt className="text-[11px] text-muted">{label}</dt>
      <dd className={`mt-0.5 font-serif font-bold tabular-nums ${strong ? "text-[20px] text-red" : "text-[17px]"}`}>{children}</dd>
    </div>
  );
}
