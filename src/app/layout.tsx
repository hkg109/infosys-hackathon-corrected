import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "아 맞다, 인생! — 정보시스템학과 플래너",
  description: "정보시스템학과에서 무엇을 듣고, 언제 준비할지. 내 진로와 일정에 맞춰 학기별로 설계합니다.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body className="antialiased">{children}</body>
    </html>
  );
}
