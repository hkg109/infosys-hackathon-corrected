import { LATE_LIGHT_CONFIG, paceBandsFor } from "@/engine";
import type { FeedbackReply, FeedbackRequest } from "./feedbackAgent";

/**
 * 시연용 예시 응답(scripted demo). 생성형 AI가 아니며, 정해진 문장 패턴에만 정해진 계획 변경을 돌려준다.
 * 화면은 이 응답을 "시연용 예시 응답"으로 표시해야 한다. 계획은 엔진(simulatePlan)으로 다시 계산한다.
 */
export const SCRIPTED_DEMO_LABEL = "시연용 예시 응답";

export async function scriptedDemoResponder(req: FeedbackRequest): Promise<FeedbackReply> {
  const text = req.message.replace(/\s+/g, "");
  const input = req.plan.input;
  if (/가볍|여유|줄이/.test(text)) {
    return {
      origin: "scripted_demo",
      message: `[${SCRIPTED_DEMO_LABEL}] 3·4학년 계획 학점을 줄이는 ${LATE_LIGHT_CONFIG.name}으로 바꿔 볼게요. ${LATE_LIGHT_CONFIG.disclaimer}`,
      nextInput: { ...input, paceStyle: "late_light", paceBands: paceBandsFor("late_light", input.creditCap) },
      changes: [`학점 배치: ${LATE_LIGHT_CONFIG.name}`],
    };
  }
  if (/빨리|빠르게|일찍/.test(text) && input.creditCap < 20) {
    return {
      origin: "scripted_demo",
      message: `[${SCRIPTED_DEMO_LABEL}] 학기당 계획 학점을 20학점으로 올려 볼게요${input.paceStyle && input.paceStyle !== "balanced" ? "(3·4학년 학점 줄이기는 끄고 균형형으로)" : ""}. 확인된 학교 상한이 더 작으면 그 값이 적용돼요.`,
      nextInput: { ...input, creditCap: 20, paceBands: undefined, paceStyle: "balanced" },
      changes: ["학기당 계획 학점: 20학점", ...(input.paceStyle && input.paceStyle !== "balanced" ? ["학점 배치: 균형형"] : [])],
    };
  }
  return {
    origin: "scripted_demo",
    message: `[${SCRIPTED_DEMO_LABEL}] 이 요청은 시연용 예시에 없는 내용이라 계획을 바꾸지 않았어요. (예: “4학년은 가볍게 하고 싶어요”, “조금 더 빨리 끝내고 싶어요”) 계절학기·교수 선택 같은 요청은 개인화 기능이 연결되면 다룰 예정이에요.`,
    nextInput: null,
    changes: [],
  };
}
