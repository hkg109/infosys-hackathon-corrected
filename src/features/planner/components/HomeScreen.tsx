"use client";

import { ArrowRight, FlaskConical, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { CAREER_LABEL, CAREER_TRACKS } from "@/contracts/careers";
import { usePlanner } from "../PlannerApp";
import { stepPath } from "../inputSteps";
import { TEST_PROFILES } from "../testProfiles";
import { Button, GroupDot, Hand, LinkButton, Tag } from "./ui";

const CONTENTS = [
  { no: "01", syl: "아", title: "내 정보", desc: "질문에 하나씩 답하며 이수 현황·진로·군대·교환학생 계획을 적어요" },
  { no: "02", syl: "맞", title: "맞춰가기", desc: "추천 순위대로 놓인 트랙을 둘러보고, 마음에 드는 트랙을 기본 트랙으로 골라요" },
  { no: "03", syl: "다", title: "다했다", desc: "교양 자리·피드백으로 다듬어 학기별 최종 로드맵을 확정해요" },
];

/** 00 아맞다 — 화면 전체를 채우는 표지 */
export function HomeScreen() {
  const { draft, plan, tracks, mounted, resetAll, loadProfile } = usePlanner();
  const router = useRouter();
  const [profiles, setProfiles] = useState(false);
  const resume = plan ? "/output" : tracks ? "/match" : draft ? "/input" : null;

  return (
    <div className="paper relative grid min-h-dvh grid-cols-2">
      {/* 왼쪽 면: 표지 */}
      <div className="relative flex flex-col justify-between border-r border-line px-20 py-16">
        <div>
          <div className="tape absolute top-10 left-20 h-7 w-32 -rotate-3" aria-hidden />
          <p className="pt-10 font-hand text-[28px] text-pen">정보시스템학과 4년, 트랙 하나로 정리하기</p>

          <h1 className="mt-6 font-serif text-[88px] leading-[1.02] font-bold tracking-tight">
            아 맞다,
            <br />
            <span className="marker">인생!</span>
          </h1>

          <p className="mt-10 max-w-[560px] font-serif text-[30px] leading-snug font-bold">
            <span className="text-red">아</span>름다운 인생을 <span className="text-red">맞</span>춰드립니<span className="text-red">다</span>.
          </p>
          <p className="mt-4 max-w-[560px] text-[17px] leading-relaxed text-ink-soft">
            무엇을 언제 들을지, 군대와 교환학생은 언제 다녀올지. 질문에 하나씩 답하면 그에 맞는 트랙들을 추천 순위대로 보여 드려요.
          </p>
        </div>

        <div className="mt-12">
          <div className="flex flex-wrap items-center gap-3">
            {mounted && resume ? (
              <>
                <LinkButton href={resume} kind="ink" className="min-h-[64px] px-10 text-[20px]">
                  이어서 하기 <ArrowRight size={20} aria-hidden />
                </LinkButton>
                <Button
                  kind="line"
                  className="min-h-[64px] px-7 text-[17px]"
                  onClick={() => {
                    resetAll();
                    router.push("/input");
                  }}
                >
                  처음부터 시작하기
                </Button>
              </>
            ) : (
              <LinkButton href="/input" kind="ink" className="min-h-[64px] px-12 text-[20px]">
                시작하기 <ArrowRight size={20} aria-hidden />
              </LinkButton>
            )}
            <Button kind="ghost" className="min-h-[64px] px-5 text-[16px]" onClick={() => setProfiles(true)} aria-expanded={profiles}>
              <FlaskConical size={18} aria-hidden /> 테스트 정보로 시작하기
            </Button>
          </div>
          <p className="mt-5 text-[13px] text-muted">입력한 정보는 이 브라우저에만 저장되고 어디로도 보내지 않아요.</p>
        </div>
      </div>

      {/* 오른쪽 면: 목차 또는 테스트 프로필 */}
      <div className="px-20 py-16">
        {profiles ? (
          <section aria-labelledby="profiles-title">
            <div className="flex items-center justify-between pt-10">
              <h2 id="profiles-title" className="font-serif text-[30px] font-bold">
                테스트 정보 불러오기
              </h2>
              <Button kind="ghost" onClick={() => setProfiles(false)} aria-label="닫기">
                <X size={18} aria-hidden />
              </Button>
            </div>
            <p className="mt-2 text-[14px] text-ink-soft">
              <Tag tone="marker">가상 데이터</Tag> 실제 학생 정보가 아니에요. 불러오면 지금 입력·선택한 트랙·교양 자리·확정 로드맵·체크리스트가 모두 초기화돼요.
            </p>
            <ul className="mt-6 grid gap-3">
              {TEST_PROFILES.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => {
                      loadProfile(p);
                      router.push(stepPath(p.landing));
                    }}
                    className="group flex min-h-[88px] w-full cursor-pointer items-center gap-5 rounded-[10px] border-2 border-line bg-paper px-5 py-4 text-left hover:border-pen"
                  >
                    <span className="grid size-12 shrink-0 place-items-center rounded-[8px] bg-ink font-serif text-[22px] font-bold text-paper">{p.id}</span>
                    <span className="min-w-0">
                      <span className="block text-[17px] font-semibold">{p.title}</span>
                      <span className="block text-[13px] text-ink-soft">{p.summary}</span>
                    </span>
                    <ArrowRight size={20} className="ml-auto shrink-0 text-pen transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ) : (
          <>
            <p className="pt-10 font-serif text-[13px] tracking-[0.3em] text-muted">CONTENTS</p>
            <h2 className="mt-1 font-serif text-[30px] font-bold">목차</h2>
            <ol className="mt-6 border-t border-rule">
              {CONTENTS.map((c) => (
                <li key={c.no} className="grid grid-cols-[56px_64px_minmax(0,1fr)] items-baseline border-b border-rule py-6">
                  <span className="font-serif text-[20px] text-muted tabular-nums">{c.no}</span>
                  <span className="font-serif text-[36px] font-bold text-red">{c.syl}</span>
                  <div>
                    <p className="font-serif text-[22px] font-bold">{c.title}</p>
                    <p className="text-[14px] text-ink-soft">{c.desc}</p>
                  </div>
                </li>
              ))}
            </ol>

            <div className="mt-12">
              <p className="mb-3 text-[13px] font-medium text-muted">트랙을 이루는 진로 {CAREER_TRACKS.length}개</p>
              <ul className="flex flex-wrap gap-x-6 gap-y-2">
                {CAREER_TRACKS.map((t) => (
                  <li key={t} className="flex items-center gap-2 text-[15px]">
                    <GroupDot group={t} size={11} />
                    {CAREER_LABEL[t]}
                  </li>
                ))}
              </ul>
              <Hand className="mt-5 block text-[21px]">같은 진로라도 군 복무 트랙·입대 시기·학점 페이스·교환학생에 따라 트랙이 여러 개로 나뉘어요.</Hand>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
