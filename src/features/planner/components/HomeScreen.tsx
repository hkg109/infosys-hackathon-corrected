"use client";

import { ArrowRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { CAREER_LABEL, CAREER_TRACKS } from "@/contracts/careers";
import { usePlanner } from "../PlannerApp";
import { Button, GroupDot, Hand, LinkButton } from "./ui";

const CONTENTS = [
  { no: "01", title: "아 맞다", desc: "지금까지 들은 것, 끌리는 것, 군 복무 여부를 적어요", page: "/input" },
  { no: "02", title: "맞춰가기", desc: "추천 진로·입대 시기·학기 학점을 선택지로 좁혀요", page: "/processing" },
  { no: "03", title: "다 했다", desc: "학기별 로드맵을 보고, 피드백으로 고친 뒤 확정해요", page: "/output" },
];

export function HomeScreen() {
  const { draft, plan, mounted, resetAll } = usePlanner();
  const router = useRouter();
  const resume = plan ? "/output" : draft ? "/processing" : null;

  return (
    <div className="grid min-h-[600px] grid-cols-2">
      {/* 왼쪽 면: 표지 */}
      <div className="relative flex flex-col justify-between border-r border-line pr-14">
        <div>
          <div className="tape absolute -top-3 left-8 h-7 w-32 -rotate-3" aria-hidden />
          <p className="pt-10 font-hand text-[26px] text-pen">정보시스템학과 4년, 한 권에 정리하기</p>
          <h1 className="mt-4 font-serif text-[64px] leading-[1.05] font-bold tracking-tight">
            아 맞다,
            <br />
            <span className="marker">인생!</span>
          </h1>
          <p className="mt-6 max-w-[420px] text-[16px] leading-relaxed text-ink-soft">
            무엇을 언제 들을지, 군대는 언제 다녀올지. 정해 두지 않아도 괜찮아요. 몇 가지만 적으면 선택지를 추천하고,
            고른 대로 학기별 로드맵을 그려 드려요.
          </p>
        </div>

        <div className="mt-10 flex flex-wrap items-center gap-3">
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

        <p className="mt-6 text-[12px] text-muted">입력한 정보는 이 브라우저에만 저장되고 어디로도 보내지 않아요.</p>
      </div>

      {/* 오른쪽 면: 목차 */}
      <div className="pl-14">
        <p className="pt-10 font-serif text-[13px] tracking-[0.3em] text-muted">CONTENTS</p>
        <h2 className="mt-1 font-serif text-[26px] font-bold">목차</h2>
        <ol className="mt-6 border-t border-rule">
          {CONTENTS.map((c) => (
            <li key={c.no} className="grid grid-cols-[52px_minmax(0,1fr)] items-baseline border-b border-rule py-[18px]">
              <span className="font-serif text-[22px] text-red tabular-nums">{c.no}</span>
              <div>
                <p className="font-serif text-[19px] font-bold">{c.title}</p>
                <p className="text-[13px] text-ink-soft">{c.desc}</p>
              </div>
            </li>
          ))}
        </ol>

        <div className="mt-10">
          <p className="mb-3 text-[12px] font-medium text-muted">이 플래너가 다루는 진로 다섯 갈래</p>
          <ul className="flex flex-wrap gap-x-5 gap-y-2">
            {CAREER_TRACKS.map((t) => (
              <li key={t} className="flex items-center gap-2 text-[14px]">
                <GroupDot group={t} size={10} />
                {CAREER_LABEL[t]}
              </li>
            ))}
          </ul>
          <Hand className="mt-4 block">진로는 직접 고르지 않아도 돼요. 답을 보고 추천해 드릴게요.</Hand>
        </div>
      </div>
    </div>
  );
}
