"use client";

import { ArrowRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { CAREER_LABEL, CAREER_TRACKS } from "@/contracts/careers";
import { usePlanner } from "../PlannerApp";
import { Button, GroupDot, Hand, LinkButton } from "./ui";

/** 아·맞·다 = 아름다운 인생을 맞춰 줍니다 */
const ACROSTIC: Array<[string, string]> = [
  ["아", "아름다운 인생을"],
  ["맞", "맞춰 줍니"],
  ["다", "다"],
];

const CONTENTS = [
  { no: "01", syl: "아", title: "내 정보", desc: "질문에 답하며 이수 현황·끌리는 것·군대·교환학생 계획을 적어요" },
  { no: "02", syl: "맞", title: "맞춰가기", desc: "추천 순위대로 놓인 트랙을 둘러보고, 마음에 드는 트랙을 기본 트랙으로 골라요" },
  { no: "03", syl: "다", title: "다했다", desc: "기본 트랙에 피드백을 더해 나만의 최종 트랙을 확정해요" },
];

export function HomeScreen() {
  const { draft, plan, tracks, mounted, resetAll } = usePlanner();
  const router = useRouter();
  const resume = plan ? "/output" : tracks ? "/match" : draft ? "/input" : null;

  return (
    <div className="grid min-h-[calc(100dvh-230px)] grid-cols-2">
      {/* 왼쪽 면: 표지 */}
      <div className="relative flex flex-col justify-between border-r border-line pr-14">
        <div>
          <div className="tape absolute -top-3 left-8 h-7 w-32 -rotate-3" aria-hidden />
          <p className="pt-10 font-hand text-[26px] text-pen">정보시스템학과 4년, 트랙 하나로 정리하기</p>

          <h1 className="mt-6 flex items-end gap-6" aria-label="아 맞다 — 아름다운 인생을 맞춰 줍니다">
            {ACROSTIC.map(([syl, word], i) => (
              <span key={syl} className="flex flex-col items-start">
                <span className={`font-serif text-[96px] leading-none font-bold ${i === 1 ? "marker" : ""}`}>{syl}</span>
                <span className="mt-3 font-hand text-[22px] leading-none text-pen">{word}</span>
              </span>
            ))}
          </h1>

          <p className="mt-10 max-w-[460px] font-serif text-[22px] font-bold leading-snug">
            <span className="text-red">아</span>름다운 인생을 <span className="text-red">맞</span>춰 줍니<span className="text-red">다</span>.
          </p>
          <p className="mt-3 max-w-[460px] text-[15px] leading-relaxed text-ink-soft">
            무엇을 언제 들을지, 군대와 교환학생은 언제 다녀올지. 몇 가지 질문에 답하면 그에 맞는 트랙들을 추천 순위대로 보여 드려요.
            마음에 드는 트랙을 고르고, 나에게 맞게 다듬어 확정하세요.
          </p>
        </div>

        <div className="mt-10">
          <div className="flex flex-wrap items-center gap-3">
            {mounted && resume ? (
              <>
                <LinkButton href={resume} kind="ink" className="px-6">
                  이어서 쓰기 <ArrowRight size={16} aria-hidden />
                </LinkButton>
                <Button
                  kind="ghost"
                  onClick={() => {
                    resetAll();
                    router.push("/input");
                  }}
                >
                  새 플래너로 시작
                </Button>
              </>
            ) : (
              <LinkButton href="/input" kind="ink" className="px-6">
                플래너 펼치기 <ArrowRight size={16} aria-hidden />
              </LinkButton>
            )}
          </div>
          <p className="mt-4 text-[12px] text-muted">입력한 정보는 이 브라우저에만 저장되고 어디로도 보내지 않아요.</p>
        </div>
      </div>

      {/* 오른쪽 면: 목차 */}
      <div className="pl-14">
        <p className="pt-10 font-serif text-[13px] tracking-[0.3em] text-muted">CONTENTS</p>
        <h2 className="mt-1 font-serif text-[26px] font-bold">목차</h2>
        <ol className="mt-6 border-t border-rule">
          {CONTENTS.map((c) => (
            <li key={c.no} className="grid grid-cols-[52px_56px_minmax(0,1fr)] items-baseline border-b border-rule py-[18px]">
              <span className="font-serif text-[18px] text-muted tabular-nums">{c.no}</span>
              <span className="font-serif text-[30px] font-bold text-red">{c.syl}</span>
              <div>
                <p className="font-serif text-[19px] font-bold">{c.title}</p>
                <p className="text-[13px] text-ink-soft">{c.desc}</p>
              </div>
            </li>
          ))}
        </ol>

        <div className="mt-10">
          <p className="mb-3 text-[12px] font-medium text-muted">트랙을 이루는 진로 다섯 갈래</p>
          <ul className="flex flex-wrap gap-x-5 gap-y-2">
            {CAREER_TRACKS.map((t) => (
              <li key={t} className="flex items-center gap-2 text-[14px]">
                <GroupDot group={t} size={10} />
                {CAREER_LABEL[t]}
              </li>
            ))}
          </ul>
          <Hand className="mt-4 block">같은 진로라도 군대·교환학생 시기에 따라 트랙이 여러 개로 나뉘어요.</Hand>
        </div>
      </div>
    </div>
  );
}
