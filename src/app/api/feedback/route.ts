import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import type { FeedbackApiReply, PlanEdit } from "@/contracts/types";

/**
 * 피드백 채팅 해석(Claude). 화면은 직접 Claude를 부르지 않고 이 라우트를 거친다(CLAUDE.md).
 * - Claude는 정해진 편집(PlanEdit)만 제안한다. 학점·완료 학기는 화면이 엔진(simulatePlan)으로 다시 계산한다.
 * - 키가 없으면 503 → 화면이 규칙 기반 해석으로 넘어간다.
 * - 요청 본문(계획 요약·대화)은 로그에 남기지 않는다. 이름·학번은 보내지 않는다(화면이 요약에서 뺌).
 */

export const dynamic = "force-dynamic";

const MODEL = "claude-sonnet-5-5";

// 공개 배포 비용 보호: IP당 1분 20회(서버 인스턴스 메모리 기준의 단순 제한)
const hits = new Map<string, number[]>();
function limited(ip: string) {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < 60_000);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > 20;
}

const TermSchema = z.object({ year: z.number().int(), season: z.number().int() });
const EditSchema = z.object({
  type: z.enum(["set_credit_cap", "set_pace_style", "set_term_cap", "clear_term_cap", "add_leave", "remove_leave", "exclude_course", "restore_course", "defer_course", "set_target_credits"]),
  credits: z.number().int().nullable(),
  term: TermSchema.nullable(),
  course_code: z.string().nullable(),
  pace_style: z.enum(["balanced", "late_light"]).nullable(),
});
const OutputSchema = z.object({
  reply: z.string(),
  edits: z.array(EditSchema),
  not_supported: z.array(z.string()),
});

const BodySchema = z.object({
  message: z.string().min(1).max(1000),
  history: z.array(z.object({ role: z.enum(["user", "assistant"]), text: z.string().max(2000) })).max(12),
  context: z.unknown(),
});

const SYSTEM = `너는 한양대학교 정보시스템학과 학생의 학기별 수강 계획(로드맵)을 다듬어 주는 도우미야.
학생이 바라는 점을 읽고, 아래 편집만 골라 제안해. 학점·완료 학기 계산은 서비스 엔진이 다시 하니 숫자를 지어내거나 결과를 예측하지 마.

가능한 편집(type):
- set_credit_cap {credits}: 매 학기 계획 학점 상한(9~24). "빨리 끝내고 싶다" → 보통 20.
- set_pace_style {pace_style}: late_light(3·4학년 학점 줄이기) 또는 balanced.
- set_term_cap {term, credits}: 특정 학기만 최대 학점(0~24). "그 학기는 가볍게" → 보통 12.
- clear_term_cap {term}
- add_leave {term} / remove_leave {term}: 휴학 추가·취소(군 복무 학기는 바꾸지 않음).
- exclude_course {course_code}: 이 계획에서 과목 빼기. 필수 과목이면 reply에서 졸업요건 확인이 필요하다고 알려.
- restore_course {course_code}
- defer_course {course_code, term}: 그 학기 전에는 배치하지 않기.
- set_target_credits {credits}: 목표 총학점(100~160). 학생이 숫자를 말했을 때만.

규칙:
- term은 계획 요약의 terms에 있는 학기만 써. "4학년 2학기" 같은 표현은 terms의 gradeLabel로 찾아.
- course_code는 계획 요약에 나온 과목 코드만 써. 과목명이 애매하면 편집하지 말고 어떤 과목인지 물어.
- 계절학기, 교수님 선택, 시간표·요일, 성적 예측, 졸업 확정 판정은 지금 할 수 없어. not_supported에 짧게 적고, 할 수 있는 대안(특정 학기 가볍게, 과목 미루기·빼기)을 reply에서 제안해.
- 쓰지 않는 필드는 null.
- reply는 한국어 존댓말 한두 문장. 무엇을 바꿨는지(또는 왜 못 바꾸는지)만 말해. 바뀐 완료 학기 같은 결과 숫자는 말하지 마.`;

export async function POST(req: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: "no_key" }, { status: 503 });
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (limited(ip)) return NextResponse.json({ error: "rate_limited" }, { status: 429 });

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const { message, history, context } = parsed.data;

  const client = new Anthropic();
  try {
    const res = await client.messages.parse({
      model: MODEL,
      max_tokens: 4000,
      system: SYSTEM,
      output_config: { effort: "low", format: zodOutputFormat(OutputSchema) },
      messages: [
        // 계획 요약은 첫 사용자 메시지에 고정해 대화가 길어져도 앞부분이 같게 둔다
        { role: "user", content: `현재 계획 요약(JSON):\n${JSON.stringify(context)}` },
        { role: "assistant", content: "계획 요약을 확인했어요. 바라는 점을 말씀해 주세요." },
        ...history.slice(-10).map((h) => ({ role: h.role, content: h.text })),
        { role: "user", content: message },
      ],
    });
    if (res.stop_reason === "refusal" || !res.parsed_output) return NextResponse.json({ error: "no_output" }, { status: 502 });
    const out = res.parsed_output;
    const edits: PlanEdit[] = [];
    for (const e of out.edits) {
      const term = e.term && (e.term.season === 1 || e.term.season === 2) ? { year: e.term.year, season: e.term.season as 1 | 2 } : null;
      switch (e.type) {
        case "set_credit_cap":
        case "set_target_credits":
          if (e.credits !== null) edits.push({ type: e.type, credits: e.credits });
          break;
        case "set_pace_style":
          if (e.pace_style) edits.push({ type: e.type, style: e.pace_style });
          break;
        case "set_term_cap":
          if (term && e.credits !== null) edits.push({ type: e.type, term, credits: e.credits });
          break;
        case "clear_term_cap":
        case "add_leave":
        case "remove_leave":
          if (term) edits.push({ type: e.type, term });
          break;
        case "exclude_course":
        case "restore_course":
          if (e.course_code) edits.push({ type: e.type, code: e.course_code });
          break;
        case "defer_course":
          if (e.course_code && term) edits.push({ type: e.type, code: e.course_code, term });
          break;
      }
    }
    const body: FeedbackApiReply = { reply: out.reply, edits, notSupported: out.not_supported };
    return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return NextResponse.json({ error: "upstream_rate_limited" }, { status: 429 });
    if (e instanceof Anthropic.AuthenticationError) return NextResponse.json({ error: "no_key" }, { status: 503 });
    if (e instanceof Anthropic.APIError) return NextResponse.json({ error: "upstream_error", status: e.status }, { status: 502 });
    return NextResponse.json({ error: "unknown" }, { status: 500 });
  }
}
