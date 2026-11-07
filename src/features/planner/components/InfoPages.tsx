"use client";

import { ArrowLeft, ArrowRight } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { usePlanner } from "../PlannerApp";
import type { Track } from "../tracks";
import { formatTerm } from "@/engine";
import { TrackThumb } from "./TrackGallery";
import { Hand, LinkButton, Tag } from "./ui";

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

const SERVICE_ROWS: Array<[string, string, string]> = [
  ["육군", "18개월", "가장 많은 인원이 가는 형태"],
  ["해병대", "18개월", "모집병으로 지원"],
  ["해군", "20개월", "모집병으로 지원"],
  ["공군", "21개월", "모집병으로 지원"],
  ["사회복무요원", "21개월", "병역판정 결과에 따라 배정"],
];

export function MilitaryInfo() {
  const { tracks, draft } = usePlanner();
  const top = tracks?.tracks[0]?.career;
  const mine = tracks?.tracks.filter((t) => t.career === top && t.militaryStart && !t.exchangeTerm) ?? [];

  return (
    <InfoShell
      kicker="알아두면 좋은 · 군대"
      title="군대, 언제 어떻게 다녀올까"
      lead="대학생활과 군 복무를 같이 계획할 때 알아야 할 것만 모았어요. 기간·제도는 바뀔 수 있으니 결정 전에는 병무청 공지를 꼭 확인하세요."
      back={{ href: "/input/military", label: "군대 질문으로 돌아가기" }}
      mine={
        <>
          <p className="font-hand text-[26px] leading-none text-ink">내 상황에 맞춘 입대 트랙</p>
          <p className="mt-2 mb-5 text-[13px] text-ink-soft">
            {draft?.military.mode === "recommend"
              ? "01에서 적은 답으로 입대 시기마다 트랙을 계산했어요."
              : "‘다녀와야 해요(시기 추천)’를 고르면 입대 시기별 트랙을 비교해 드려요."}
          </p>
          <MyTracks tracks={mine} empty="아직 비교할 입대 트랙이 없어요." />
          {mine.length > 0 && (
            <LinkButton href="/match#military" kind="ink" className="mt-5 w-full">
              입대 시기별 트랙 전체 보기 <ArrowRight size={15} aria-hidden />
            </LinkButton>
          )}
        </>
      }
    >
      <Part no="01" title="복무 형태별 기간" tag={<Check />}>
        <table className="w-full max-w-[560px] border-y-[1.5px] border-ink text-[14px]">
          <tbody>
            {SERVICE_ROWS.map(([kind, len, note]) => (
              <tr key={kind} className="border-b border-rule last:border-0">
                <th scope="row" className="py-2 pr-4 text-left font-semibold text-ink">
                  {kind}
                </th>
                <td className="py-2 pr-4 font-serif font-bold tabular-nums text-ink">{len}</td>
                <td className="py-2 text-[13px] text-muted">{note}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-2 text-[12px] text-muted">공개된 현행 기준을 옮긴 것이에요. 이 플래너는 여기서 고른 기간을 계획용 가정으로만 써요.</p>
      </Part>

      <Part no="02" title="입대하는 방법" tag={<Check />}>
        <ul className="grid gap-2">
          <li>
            <b className="text-ink">현역병 입영 신청</b> — 병무청 누리집에서 원하는 입영 시기를 골라 신청하는 방식이 있어요. 원하는 날짜가 마감될 수 있어 일찍 알아보는 게 좋아요.
          </li>
          <li>
            <b className="text-ink">모집병 지원</b> — 해군·공군·해병대나 육군 특기병처럼 분야를 골라 지원하고 선발되면 입영해요. 지원부터 입영까지 시간이 걸려요.
          </li>
          <li>
            <b className="text-ink">그 밖의 길</b> — 카투사, 학군단(ROTC), 학사장교 등은 자격과 선발 일정이 따로 있어요.
          </li>
        </ul>
        <p className="mt-2 text-[12px] text-muted">자격·선발 일정은 병무청과 각 군 모집 공고에서 확인하세요.</p>
      </Part>

      <Part no="03" title="입대 시기 고르는 요령" tag={<Tip />}>
        <ul className="grid gap-2">
          <li>· <b className="text-ink">학년을 마친 직후</b>에 가면 학기 중간에 끊기지 않아요. 이 플래너의 입대 트랙도 이 시점들로 만들어요.</li>
          <li>· 전역 날짜가 학기 시작 전이면 그 학기에 복학을 계획할 수 있어요. 전역일과 학교 복학 신청 기간을 함께 보세요.</li>
          <li>· 진로 핵심 과목을 입대 <b className="text-ink">전에</b> 몇 개 들어 두면 복학 후 감을 되찾기 쉬워요. 트랙 정보에서 “입대 전 핵심 과목 수”를 확인하세요.</li>
          <li>· 교환학생도 생각한다면 군 복무와 겹치지 않는 학기를 골라야 해요. 교환 트랙은 자동으로 피해서 만들어요.</li>
        </ul>
      </Part>

      <Part no="04" title="학교에서 챙길 것" tag={<Verified src="S2 16쪽" />}>
        <ul className="grid gap-2">
          <li>· 입영이 정해지면 학교에 군입대 휴학을 신청해요. 필요한 서류와 기간은 학사 공지에서 확인하세요.</li>
          <li>· 복학 신청 기간을 놓치지 않게 전역 전에 미리 확인하세요.</li>
          <li>
            · <b className="text-ink">휴·복학 후 적용 교육과정이 달라질 수 있어요</b> (2026-2 수강신청 안내문 16쪽). 복학 전에 내 교육과정을 다시 확인하세요.
          </li>
        </ul>
      </Part>
    </InfoShell>
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
            {draft && draft.exchange.mode !== "none"
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
