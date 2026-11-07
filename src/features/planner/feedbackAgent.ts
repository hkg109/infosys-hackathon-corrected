import type { DatasetV2, PlanInput } from "@/contracts/types";
import type { PlanState } from "./storage";

/**
 * 피드백 채팅 → 개인 맞춤 트랙. 화면(FeedbackScreen)은 이 함수만 부른다.
 *
 * TODO(피드백 담당): 아직 구현하지 않았다. 시연에서는 정해진 입력 → 정해진 결과로 채운다.
 *  - 예: "계절학기 듣고 싶어요" → nextInput의 학기 배치를 바꾼 계획 + changes 문구
 *  - 학점·학기는 엔진(simulatePlan)으로 다시 계산하고, 화면이 diffPlans로 전후를 비교한다.
 *  - 나중에 Claude API를 붙인다면 화면에서 직접 부르지 말고 src/app/api/** 라우트를 거친다(CLAUDE.md 규칙).
 */

export interface ChatMessage {
  role: "user" | "assistant";
  text: string;
  /** 시연용 예시 응답이면 true(화면에 표시) */
  demo?: boolean;
}

export interface FeedbackRequest {
  message: string;
  history: ChatMessage[];
  plan: PlanState;
  dataset: DatasetV2;
}

export interface FeedbackReply {
  /** agent = 실제 개인화 로직(다른 담당자가 연결), scripted_demo = 시연용 예시 응답, none = 미연결 */
  origin: "agent" | "scripted_demo" | "none";
  /** 채팅에 보여 줄 답 */
  message: string;
  /** 바꾼 계획 입력. 바꿀 게 없거나 아직 처리하지 못하면 null */
  nextInput: PlanInput | null;
  /** "계절학기 1번 추가"처럼 바뀐 점 요약. 로드맵의 "방금 고친 것"에 쓰인다. */
  changes: string[];
}

/** 화면이 주입받는 응답 함수 경계. 개인화 담당자는 이 모양의 함수를 넘기면 된다. */
export type FeedbackResponder = (req: FeedbackRequest) => Promise<FeedbackReply>;

export async function requestTrackFeedback(req: FeedbackRequest): Promise<FeedbackReply> {
  void req;
  return {
    origin: "none",
    message: "피드백 반영 기능은 아직 연결 중이에요. 적어 주신 내용은 이 대화에 남겨 둘게요.",
    nextInput: null,
    changes: [],
  };
}
