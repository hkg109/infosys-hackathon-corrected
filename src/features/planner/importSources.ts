"use client";

/**
 * 성적표 스크린샷 준비(브라우저 전용). 보내기 전에 크기를 줄여 JPEG base64로 만든다.
 * 이미지 원본·결과 원문은 저장하지 않는다(검토 후 확인한 숫자·과목만 저장).
 */

export const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"];
export const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
export const MAX_IMAGES = 8;
/** 긴 변 최대 픽셀(글자는 읽히고 전송 크기는 작게) */
const MAX_SIDE = 2000;

export function imageProblem(file: File): string | null {
  if (!IMAGE_TYPES.includes(file.type)) return "PNG·JPEG·WebP 이미지만 읽을 수 있어요.";
  if (file.size > MAX_IMAGE_BYTES) return "이미지가 너무 커요(15MB 이하). 성적표 부분만 잘라 주세요.";
  return null;
}

/** 붙여넣기 이벤트에서 이미지 파일만 꺼낸다 */
export function imagesFromClipboard(data: DataTransfer): File[] {
  return [...data.items].filter((i) => i.kind === "file" && IMAGE_TYPES.includes(i.type)).flatMap((i) => (i.getAsFile() ? [i.getAsFile()!] : []));
}

export async function toJpegBase64(file: File): Promise<{ mediaType: "image/jpeg"; data: string; width: number; height: number }> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const size = { width: bitmap.width, height: bitmap.height };
  bitmap.close();
  const url = canvas.toDataURL("image/jpeg", 0.88);
  return { mediaType: "image/jpeg", data: url.slice(url.indexOf(",") + 1), ...size };
}
