import type { Metadata } from "next";
import { PlannerApp } from "@/features/planner/PlannerApp";
import "./globals.css";

export const metadata: Metadata = {
  title: "아 맞다, 인생! — 정보시스템학과 플래너",
  description: "정보시스템학과에서 무엇을 듣고, 언제 준비할지. 내 진로와 일정에 맞춰 학기별로 설계합니다.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font -- App Router 루트 레이아웃이라 모든 화면에 적용된다 */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Gowun+Batang:wght@400;700&family=Nanum+Pen+Script&display=swap"
        />
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
        />
      </head>
      <body className="antialiased">
        <PlannerApp>{children}</PlannerApp>
      </body>
    </html>
  );
}
