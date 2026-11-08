import type { TranscriptImageReply } from "@/contracts/types";

export type TranscriptImageResult = { ok: true; reply: TranscriptImageReply } | { ok: false; reason: "no_key" | "rate_limited" | "failed" };

/** 성적표 스크린샷 읽기 요청. 화면이 동의를 받은 뒤에만 부른다(직접 Claude 호출 금지) */
export async function readTranscriptImage(image: { mediaType: "image/jpeg" | "image/png" | "image/webp"; data: string }): Promise<TranscriptImageResult> {
  try {
    const res = await fetch("/api/transcript-image", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ consent: true, ...image }) });
    if (res.status === 503) return { ok: false, reason: "no_key" };
    if (res.status === 429) return { ok: false, reason: "rate_limited" };
    if (!res.ok) return { ok: false, reason: "failed" };
    const reply = (await res.json()) as TranscriptImageReply;
    return Array.isArray(reply.rows) ? { ok: true, reply } : { ok: false, reason: "failed" };
  } catch {
    return { ok: false, reason: "failed" };
  }
}
