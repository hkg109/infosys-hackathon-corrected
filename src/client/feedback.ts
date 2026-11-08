import type { FeedbackApiReply } from "@/contracts/types";

/** 피드백 채팅 해석 요청. 화면은 이 함수만 쓴다(직접 Claude·외부 호출 금지). 실패하면 null → 규칙 해석으로 */
export async function postFeedback(body: { message: string; history: Array<{ role: "user" | "assistant"; text: string }>; context: unknown }): Promise<FeedbackApiReply | null> {
  try {
    const res = await fetch("/api/feedback", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!res.ok) return null;
    const data = (await res.json()) as FeedbackApiReply;
    return Array.isArray(data.edits) && typeof data.reply === "string" ? data : null;
  } catch {
    return null;
  }
}
