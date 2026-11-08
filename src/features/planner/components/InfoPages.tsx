"use client";

import { ArrowLeft, ArrowRight } from "lucide-react";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { findCertificate, formatTerm, KATUSA_STATUS_LABEL, matchCertificates } from "@/engine";
import { usePlanner } from "../PlannerApp";
import type { Track } from "../tracks";
import { TrackThumb } from "./TrackGallery";
import { Button, Choice, Hand, LinkButton, Tag } from "./ui";

/*
 * 군대·교환학생 안내. 학교 자료(S1·S2)로 확인된 것은 쪽수를 달고,
 * 그 밖의 공개 정보는 "확인 필요"로, 서비스의 계획 요령은 "계획 팁"으로 구분한다.
 * 학교별 신청 기간·자격·선발 기준 같은 확인되지 않은 수치는 쓰지 않는다.
 */

function InfoShell({
  kicker,
  title,
  lead,
  back,
  children,
  mine,
}: {
  kicker: string;
  title: string;
  lead: string;
  back: { href: string; label: string };
  children: ReactNode;
  mine: ReactNode;
}) {
  return (
    <div>
      <Link href={back.href} className="mb-6 inline-flex items-center gap-2 text-[14px] text-ink-soft hover:text-ink">
        <ArrowLeft size={15} aria-hidden /> {back.label}
      </Link>
      <p className="font-hand text-[22px] leading-none text-pen">{kicker}</p>
      <h1 className="mt-1 font-serif text-[36px] font-bold tracking-tight">{title}</h1>
      <p className="mt-2 max-w-[720px] text-[15px] text-ink-soft">{lead}</p>
      <div className="mt-10 grid grid-cols-[minmax(0,1fr)_360px] gap-12">
        <div className="grid content-start gap-11">{children}</div>
        <aside className="self-start">
          <div className="memo-note relative rotate-[0.8deg] px-6 pt-8 pb-6">
            <div className="tape absolute -top-2.5 left-1/2 h-6 w-24 -translate-x-1/2 -rotate-2" aria-hidden />
            {mine}
          </div>
        </aside>
      </div>
    </div>
  );
}

function Part({ no, title, tag, children }: { no: string; title: string; tag?: ReactNode; children: ReactNode }) {
  return (
    <section className="grid grid-cols-[48px_minmax(0,1fr)] gap-4">
      <span className="font-serif text-[26px] leading-none text-red tabular-nums">{no}</span>
      <div>
        <div className="mb-3 flex items-center gap-3">
          <h2 className="font-serif text-[21px] font-bold">{title}</h2>
          {tag}
        </div>
        <div className="text-[15px] leading-relaxed text-ink-soft">{children}</div>
      </div>
    </section>
  );
}

const Check = () => <Tag tone="red">공식 확인 필요</Tag>;
const Tip = () => <Tag tone="marker">계획 팁</Tag>;
const Verified = ({ src }: { src: string }) => <Tag tone="sage">학교 자료 {src}</Tag>;

function MyTracks({ tracks, empty }: { tracks: Track[]; empty: string }) {
  if (tracks.length === 0) return <p className="text-[14px] text-ink-soft">{empty}</p>;
  return (
    <ul className="grid gap-2">
      {tracks.slice(0, 4).map((t) => (
        <li key={t.id}>
          <Link href={`/match/${encodeURIComponent(t.id)}`} className="group grid grid-cols-[56px_minmax(0,1fr)] items-center gap-3 rounded-[6px] bg-paper/70 p-2 hover:bg-paper">
            <TrackThumb track={t} mini />
            <span className="min-w-0">
              <span className="block truncate text-[13px] font-semibold group-hover:underline">{t.title}</span>
              <span className="block text-[12px] text-ink-soft tabular-nums">
                {t.candidate.result?.expectedCompletion ? `${formatTerm(t.candidate.result.expectedCompletion)} 완료` : "완료 확인 필요"}
              </span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function MilitaryInfo() {
  const { tracks, draft, dataset, updateDraft } = usePlanner();
  const [query, setQuery] = useState("");
  const catalog = dataset?.military;
  const top = tracks?.tracks[0]?.career;
  const mine = tracks?.tracks.filter((t) => t.career === top && (t.militaryStart || t.militaryLabel) && !t.exchangeTerm) ?? [];
  const certIds = draft?.military.certificateIds ?? [];
  const picked = draft?.military.trackIds ?? [];
  const found = query.trim() ? findCertificate(query, catalog) : [];

  const toggleTrack = (id: string) =>
    updateDraft((d) => ({
      ...d,
      military: {
        ...d.military,
        status: d.military.status === "planned" || d.military.status === "undecided" ? d.military.status : "undecided",
        trackIds: d.military.trackIds.includes(id) ? d.military.trackIds.filter((x) => x !== id) : [...d.military.trackIds, id],
      },
    }));
  const toggleCert = (id: string) =>
    updateDraft((d) => ({
      ...d,
      military: {
        ...d.military,
        certificateIds: d.military.certificateIds.includes(id) ? d.military.certificateIds.filter((x) => x !== id) : [...d.military.certificateIds, id],
      },
    }));

  return (
    <InfoShell
      kicker="알아두면 좋은 · 군대"
      title="군대 트랙, 어떻게 고를까"
      lead="병무청 원문을 직접 열어 확인한 내용만 담았어요. 원문에 없는 복무기간·점수는 비워 두고 ‘확인 필요’로 표시해요. 이 화면은 합격 가능성 예측이 아니에요."
      back={{ href: "/input/military-branch", label: "군 복무 질문으로 돌아가기" }}
      mine={
        <>
          <p className="font-hand text-[26px] leading-none text-ink">내 계획에 넣은 군대 트랙</p>
          <p className="mt-2 mb-4 text-[13px] text-ink-soft">
            {picked.length > 0 ? picked.map((id) => catalog?.tracks.find((t) => t.id === id)?.officialName ?? id).join(", ") : "아직 고른 트랙이 없어요. 왼쪽에서 ‘내 계획에 넣기’를 눌러 보세요."}
          </p>
          {draft && (draft.military.status === "planned" || draft.military.status === "undecided") && (
            <p className="mb-4 text-[13px] text-ink-soft">
              카투사 우선: <b>{draft.katusa.priority ? `예 · ${KATUSA_STATUS_LABEL[draft.katusa.status]}` : "아니요"}</b>{" "}
              <Link href="/input/katusa" className="text-pen underline underline-offset-4">
                바꾸기
              </Link>
            </p>
          )}
          <MyTracks tracks={mine} empty="입력을 마치면 군대 트랙별 계획이 여기 나타나요." />
          {mine.length > 0 && (
            <LinkButton href="/match#katusa" kind="ink" className="mt-5 w-full">
              군대 트랙 비교 보기 <ArrowRight size={15} aria-hidden />
            </LinkButton>
          )}
        </>
      }
    >
      <Part no="01" title="군대 트랙 비교" tag={<Tag tone="sage">병무청 원문 {catalog?.reviewedAt ?? ""} 확인</Tag>}>
        {!catalog && <p>군대 트랙 자료를 불러오지 못했어요.</p>}
        <div className="grid gap-5">
          {catalog?.tracks.map((t) => {
            const matches = matchCertificates(t.id, certIds, catalog);
            const rules = catalog.scoringRules.filter((r) => r.militaryTrackId === t.id);
            const on = picked.includes(t.id);
            return (
              <article key={t.id} className={`rounded-[10px] border-2 p-5 ${on ? "border-pen bg-pen/[0.04]" : "border-line bg-paper"}`}>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="font-serif text-[21px] font-bold text-ink">{t.officialName}</h3>
                    <p className="mt-1 text-[14px]">{t.description}</p>
                  </div>
                  <Button kind={on ? "ink" : "line"} onClick={() => toggleTrack(t.id)} className="shrink-0" aria-pressed={on}>
                    {on ? "내 계획에 넣음 ✓" : "내 계획에 넣기"}
                  </Button>
                </div>
                <dl className="mt-4 grid grid-cols-2 gap-x-8 gap-y-3 text-[13px]">
                  <InfoRow label="이런 사람에게(서비스 안내)">{t.fitsFor.join(" / ")}</InfoRow>
                  <InfoRow label="복무기간">
                    {t.serviceMonths !== null && t.serviceMonthsStatus === "verified" ? (
                      <>
                        <b className="text-ink">{t.serviceMonths}개월</b> <Tag tone="sage">공식 확인</Tag>
                      </>
                    ) : (
                      <Tag tone="red">확인 필요</Tag>
                    )}{" "}
                    <span className="text-muted">{t.serviceMonthsNote}</span>
                  </InfoRow>
                  <InfoRow label="지원자격(원문 요약)">
                    <ul>{t.eligibility.map((x) => <li key={x}>· {x}</li>)}</ul>
                  </InfoRow>
                  <InfoRow label="선발 방식(원문 요약)">
                    <ul>{t.selection.map((x) => <li key={x}>· {x}</li>)}</ul>
                  </InfoRow>
                  <InfoRow label="자격증 반영">
                    {t.certificatesConsidered === "yes" ? "반영함(원문)" : t.certificatesConsidered === "no" ? "원문에서 반영을 확인하지 못함" : "확인 필요"}
                    {rules.map((r) => (
                      <span key={r.id} className="mt-1 block text-muted">
                        {r.title}: {r.rows.map((x) => `${x.label} ${x.value}`).join(" · ")}
                      </span>
                    ))}
                  </InfoRow>
                  <InfoRow label="보유 자격증과의 관계">
                    {matches.length === 0
                      ? "아래에서 보유 자격증을 고르면 공식 관련성을 확인해 드려요."
                      : matches.map((m) => (
                          <span key={m.certificate.id} className="block">
                            {m.certificate.officialName}: <span className={m.officialRelations.length ? "text-sage-ink" : "text-red"}>{m.note}</span>
                          </span>
                        ))}
                  </InfoRow>
                  <InfoRow label="준비할 것">
                    <ul>{t.prepare.map((x) => <li key={x}>· {x}</li>)}</ul>
                  </InfoRow>
                  <InfoRow label="주의할 점">
                    <ul>{t.cautions.map((x) => <li key={x}>· {x}</li>)}</ul>
                  </InfoRow>
                </dl>
                <p className="mt-4 border-t border-dashed border-line pt-3 text-[12px] text-muted">
                  적용: {t.appliesTo ?? "확인 필요"} · 출처:{" "}
                  {t.sources.map((src, i) => (
                    <span key={src.url}>
                      {i > 0 && ", "}
                      <a href={src.url} target="_blank" rel="noreferrer" className="text-pen underline-offset-4 hover:underline">
                        {src.title}
                      </a>{" "}
                      ({src.checkedAt} 확인)
                    </span>
                  ))}
                </p>
              </article>
            );
          })}
        </div>
        <p className="mt-3 text-[12px] text-muted">
          해·공군·해병대 정보통신 분야 등은 공식 명칭과 모집 여부를 아직 확인하지 못해 넣지 않았어요. 이 결과는 합격 가능성 예측이 아니에요.
        </p>
      </Part>

      <Part no="02" title="보유 자격증" tag={<Tag tone="red">공식 관련성은 트랙별로 확인</Tag>}>
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="자격증 이름이나 예전 이름으로 찾기" aria-label="자격증 찾기" className="w-[360px]" />
        {found.length > 0 && (
          <ul className="mt-2 grid gap-1 text-[13px]">
            {found.map(({ certificate, matchedAlias }) => (
              <li key={certificate.id}>
                <button type="button" onClick={() => toggleCert(certificate.id)} className="cursor-pointer text-pen underline-offset-4 hover:underline">
                  {certificate.officialName}
                </button>
                {matchedAlias && (
                  <span className="text-muted">
                    {" "}
                    — ‘{matchedAlias}’로 찾음{certificate.aliases.find((a) => a.name === matchedAlias)?.status !== "verified" ? " (이름 연결 공식 확인 전 · 같은 자격으로 보지 않음)" : ""}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          {catalog?.certificates.map((c) => (
            <Choice key={c.id} selected={certIds.includes(c.id)} onClick={() => toggleCert(c.id)} className="min-h-[40px] text-[13px]">
              {c.officialName}
              {c.status !== "verified" && <span className="ml-1 text-[11px] text-muted">정보 확인 필요</span>}
            </Choice>
          ))}
        </div>
        <p className="mt-2 text-[12px] text-muted">
          여러 자격증을 가지고 있어도 점수를 더하지 않아요. 진로 준비에 도움이 되는 자격증(서비스 추천)과 군 모집 분야의 공식 인정은 서로 다른 정보예요.
        </p>
      </Part>

      <Part no="03" title="입대 시기 고르는 요령" tag={<Tip />}>
        <ul className="grid gap-2">
          <li>· <b className="text-ink">학년을 마친 직후</b>에 가면 학기 중간에 끊기지 않아요. 이 플래너의 입대 트랙도 이 시점들로 만들어요.</li>
          <li>· 카투사처럼 선발 결과를 기다리는 트랙은 ‘선발 시’와 ‘선발되지 않을 경우’를 함께 계획해 두세요.</li>
          <li>· 진로 핵심 과목을 입대 <b className="text-ink">전에</b> 몇 개 들어 두면 복학 후 감을 되찾기 쉬워요.</li>
        </ul>
      </Part>

      <Part no="04" title="학교에서 챙길 것" tag={<Verified src="S2 16쪽" />}>
        <ul className="grid gap-2">
          <li>· 입영이 정해지면 학교에 군입대 휴학을 신청해요. 필요한 서류와 기간은 학사 공지에서 확인하세요.</li>
          <li>
            · <b className="text-ink">휴·복학 후 적용 교육과정이 달라질 수 있어요</b> (2026-2 수강신청 안내문 16쪽). 복학 전에 내 교육과정을 다시 확인하세요.
          </li>
        </ul>
      </Part>
    </InfoShell>
  );
}

function InfoRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-[11px] font-medium text-muted">{label}</dt>
      <dd className="mt-0.5 leading-relaxed text-ink-soft">{children}</dd>
    </div>
  );
}

export function ExchangeInfo() {
  const { tracks, draft } = usePlanner();
  const mine = tracks?.tracks.filter((t) => t.exchangeTerm) ?? [];
  return (
    <InfoShell
      kicker="알아두면 좋은 · 교환학생"
      title="교환학생, 언제 어떻게 준비할까"
      lead="한 학기를 해외 대학에서 보내는 계획을 세울 때 필요한 흐름을 정리했어요. 모집 일정·지원 자격·학점 인정 기준은 국제처 공지로 꼭 확인하세요."
      back={{ href: "/input/exchange", label: "교환학생 질문으로 돌아가기" }}
      mine={
        <>
          <p className="font-hand text-[26px] leading-none text-ink">내 상황에 맞춘 교환 트랙</p>
          <p className="mt-2 mb-5 text-[13px] text-ink-soft">
            {draft && draft.exchange.mode && draft.exchange.mode !== "none"
              ? "군 복무 시기와 겹치지 않게 교환 학기를 넣어 계산했어요."
              : "‘관심 있어요’를 고르면 교환 학기를 넣은 트랙을 만들어 드려요."}
          </p>
          <MyTracks tracks={mine} empty="아직 교환학생 트랙이 없어요." />
          {mine.length > 0 && (
            <LinkButton href="/match#exchange" kind="ink" className="mt-5 w-full">
              교환학생 트랙 전체 보기 <ArrowRight size={15} aria-hidden />
            </LinkButton>
          )}
        </>
      }
    >
      <Part no="01" title="교환학생과 방문학생" tag={<Check />}>
        <ul className="grid gap-2">
          <li>
            <b className="text-ink">교환학생</b> — 학교끼리 맺은 협정으로 상대 대학에서 공부해요. 보통 학교 안에서 선발을 거쳐요.
          </li>
          <li>
            <b className="text-ink">방문학생</b> — 협정과 별개로 개인이 상대 대학 프로그램에 지원하는 방식이에요. 비용과 학점 인정 조건이 다를 수 있어요.
          </li>
        </ul>
      </Part>

      <Part no="02" title="준비는 보통 이렇게 흘러가요" tag={<Tip />}>
        <ol className="grid gap-2">
          <li>
            <b className="text-ink">1.</b> 가고 싶은 학기 1년쯤 전부터 학교·지역·과목을 알아봐요.
          </li>
          <li>
            <b className="text-ink">2.</b> 지원에 필요한 어학 성적을 미리 준비해요.
          </li>
          <li>
            <b className="text-ink">3.</b> 교내 선발에 지원하고, 합격하면 상대 대학 지원과 비자를 준비해요.
          </li>
          <li>
            <b className="text-ink">4.</b> 출국 전에 들을 과목의 학점 인정을 미리 확인해요.
          </li>
        </ol>
        <p className="mt-2 text-[12px] text-muted">정확한 모집 시기와 자격은 학교 국제처 공지를 기준으로 하세요.</p>
      </Part>

      <Part no="03" title="학점 인정과 졸업 시점" tag={<Check />}>
        <p>
          교환 학기에 들은 과목이 전공·교양 몇 학점으로 인정될지는 학교 심사를 거쳐야 정해져요. 그래서 이 플래너는 교환 학기에 국내 과목을 넣지 않고,
          인정 학점이 정해지기 전까지는 그 뒤 완료 시점을 <b className="text-ink">“확인 필요”</b>로 보여 드려요.
        </p>
      </Part>

      <Part no="04" title="언제 가면 좋을까" tag={<Tip />}>
        <ul className="grid gap-2">
          <li>· 전공 기초를 어느 정도 들은 2~3학년에 많이 가요. 이 플래너의 추천도 3학년 1·2학기로 만들어요.</li>
          <li>· 군 복무가 있다면 겹치지 않게 앞뒤를 정해야 해요. 교환 트랙은 군 복무 학기를 피해서 넣어요.</li>
          <li>· 진로 핵심 과목이 특정 학기에만 열린다면 그 학기는 피하는 게 좋아요. 트랙 정보에서 핵심 과목이 언제 배치됐는지 보세요.</li>
        </ul>
        <Hand className="mt-3 block">교환을 다녀와도 진로 핵심 과목이 밀리지 않는지 트랙에서 비교해 보세요.</Hand>
      </Part>
    </InfoShell>
  );
}
