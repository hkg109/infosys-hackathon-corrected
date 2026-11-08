import type { DatasetV2, FeedbackApiReply, PlanInput } from "@/contracts/types";
import { postFeedback } from "@/client/feedback";
import { simulatePlan } from "@/engine";
import { applyEdits, parseFeedbackRules, planContext } from "./feedbackEdits";
import type { PlanState } from "./storage";

/**
 * 피드백 채팅 → 개인 맞춤 트랙. 화면(FeedbackChat — 03 다 로드맵 옆 채팅)은 이 함수만 부른다.
 * 1) /api/feedback(Claude)이 바라는 점을 편집(PlanEdit)으로 바꾼다. 키가 없거나 실패하면 2) 규칙 해석.
 * 3) 편집을 검증해 PlanInput에 반영하고, 화면이 엔진으로 다시 계산한다(숫자를 AI가 만들지 않는다).
 */

export interface ChatMessage {
  role: "user" | "assistant";
  text: string;
  /** 규칙 해석으로 답했으면 true(화면에 표시) */
  rules?: boolean;
}

export interface FeedbackRequest {
  message: string;
  history: ChatMessage[];
  plan: PlanState;
  dataset: DatasetV2;
}

export interface FeedbackReply {
  /** agent = Claude 해석, rules = 규칙 기반 해석(키 없음·호출 실패) */
  origin: "agent" | "rules";
  /** 채팅에 보여 줄 답 */
  message: string;
  /** 바꾼 계획 입력. 바꿀 게 없으면 null */
  nextInput: PlanInput | null;
  /** "2028년 2학기 최대 12학점"처럼 바뀐 점 요약. 로드맵의 "방금 고친 것"에 쓰인다. */
  changes: string[];
}

/** 화면이 주입받는 응답 함수 경계 */
export type FeedbackResponder = (req: FeedbackRequest) => Promise<FeedbackReply>;

export async function requestTrackFeedback(req: FeedbackRequest, post: typeof postFeedback = postFeedback): Promise<FeedbackReply> {
  const input = req.plan.input;
  const ctx = planContext(input, simulatePlan(input, req.dataset), req.dataset);
  const history = req.history.slice(0, -1).map((h) => ({ role: h.role, text: h.text }));
  const ai: FeedbackApiReply | null = await post({ message: req.message, history, context: ctx });
  const interp = ai ?? (() => {
    const r = parseFeedbackRules(req.message, ctx, req.dataset);
    return { reply: r.reply, edits: r.edits, notSupported: r.notSupported };
  })();
  const { next, changes, rejected } = applyEdits(input, interp.edits, req.dataset);
  const parts = [interp.reply, ...interp.notSupported, ...rejected].filter((x) => x && x.trim());
  return {
    origin: ai ? "agent" : "rules",
    message: parts.join(" ") || "바꿀 내용을 찾지 못했어요. 학기나 과목을 콕 집어 말씀해 주세요.",
    nextInput: changes.length > 0 ? next : null,
    changes,
  };
}
