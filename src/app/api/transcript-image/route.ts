import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import type { TranscriptImageReply } from "@/contracts/types";

/**
 * 성적표 스크린샷 → 과목 행(Claude 이미지 인식). 사용자가 화면에서 전송에 동의한 경우에만 호출된다.
 * - 이미지는 Claude에 한 번 보내고 저장·로그하지 않는다. 이름·학번 등은 결과에 넣지 않게 지시한다.
 * - 결과는 바로 반영하지 않고 화면의 검토 창(학과 자료 매칭·사용자 확인)을 거친다.
 * - 키가 없으면 503.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MODEL = "claude-sonnet-5-5";
const MAX_BASE64 = 4_000_000; // Vercel 요청 본문 한도(4.5MB) 안쪽

const hits = new Map<string, number[]>();
function limited(ip: string) {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < 60_000);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > 10;
}

const BodySchema = z.object({
  consent: z.literal(true),
  mediaType: z.enum(["image/jpeg", "image/png", "image/webp"]),
  data: z.string().min(100).max(MAX_BASE64),
});

const OutputSchema = z.object({
  rows: z.array(
    z.object({
      term: z.string().nullable(),
      category: z.string().nullable(),
      code: z.string().nullable(),
      name: z.string().nullable(),
      credits: z.number().nullable(),
      grade: z.string().nullable(),
    }),
  ),
  summary: z.object({
    earnedCredits: z.number().nullable(),
    majorCredits: z.number().nullable(),
    targetCredits: z.number().nullable(),
    majorRequiredCredits: z.number().nullable(),
    majorLowerRequiredCredits: z.number().nullable(),
    majorUpperRequiredCredits: z.number().nullable(),
    majorUpperEarnedCredits: z.number().nullable(),
  }),
  unreadable: z.boolean(),
});

const PROMPT = `이 이미지는 한국 대학교(한양대학교) 포털의 성적 조회 또는 졸업사정 화면 캡처야.
보이는 과목 행을 빠짐없이, 화면에 적힌 그대로 옮겨 줘.
- term: 연도·학기 표기(예: "2026년-1학년-1학기"). 없으면 null.
- category: 이수구분(예: 교양필수, 전공핵심). 없으면 null.
- code: 학수번호(예: CUL0203, I-D3018). 글자가 불확실하면 보이는 대로 쓰고 추측해서 고치지 마.
- name: 교과목명. credits: 학점(숫자, 예: 2.00 → 2). grade: 등급(A+, B0, F, P, W 등). 점수·평점(96.7, 4.50)은 credits·grade에 넣지 마.
- name의 로마숫자(Ⅰ, Ⅱ, I, II)는 과목명에 그대로 남겨. grade는 반드시 성적 열에서 읽은 값만 넣고 과목명 속 글자를 성적으로 추측하지 마.
- summary: 화면에 숫자로 분명히 보일 때만 그 값, 아니면 null. 과목 학점을 직접 더하지 마.
  - earnedCredits: 총 취득(이수)학점. majorCredits: 전공 취득(이수)학점. targetCredits: 졸업학점 기준(요건).
  - majorRequiredCredits: 졸업요건의 "전공학점" 기준값. majorLowerRequiredCredits: "전공 100~300단위" 기준값. majorUpperRequiredCredits: "전공 400단위" 기준값. majorUpperEarnedCredits: 전공 400단위 취득학점.
  - 졸업사정 화면에 기준(요건) 열만 있으면 그 숫자는 기준값이야. 취득학점(earnedCredits, majorCredits, majorUpperEarnedCredits)에 넣지 마. 기준과 취득 중 어느 열인지 모호하면 null.
- 이름·학번·생년월일 같은 개인정보는 어디에도 쓰지 마.
- 성적 화면이 아니거나 글자를 읽을 수 없으면 rows는 빈 배열, unreadable은 true.`;

export async function POST(req: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: "no_key" }, { status: 503 });
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (limited(ip)) return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const { mediaType, data } = parsed.data;

  const client = new Anthropic();
  try {
    const res = await client.messages.parse({
      model: MODEL,
      max_tokens: 8000,
      output_config: { effort: "low", format: zodOutputFormat(OutputSchema) },
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mediaType, data } },
            { type: "text", text: PROMPT },
          ],
        },
      ],
    });
    if (res.stop_reason === "refusal" || !res.parsed_output) return NextResponse.json({ error: "no_output" }, { status: 502 });
    const body: TranscriptImageReply = res.parsed_output;
    return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return NextResponse.json({ error: "upstream_rate_limited" }, { status: 429 });
    if (e instanceof Anthropic.AuthenticationError) return NextResponse.json({ error: "no_key" }, { status: 503 });
    if (e instanceof Anthropic.APIError) return NextResponse.json({ error: "upstream_error" }, { status: 502 });
    return NextResponse.json({ error: "unknown" }, { status: 500 });
  }
}
