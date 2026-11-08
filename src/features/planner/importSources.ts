"use client";

import { rowsFromTable, rowsFromText, type SourceRow } from "./transcriptImport";

/**
 * 가져오기 원문 읽기(브라우저 전용).
 * - 클립보드: text/html의 표 → text/plain의 탭·행 → 일반 텍스트 순서
 * - 이미지: 이 브라우저 안의 OCR(tesseract.js Worker). 외부 OCR API로 보내지 않는다.
 * - 이미지 원본·OCR 원문은 저장하지 않는다. 호출한 쪽이 검토 후 확인한 값만 저장한다.
 */

export const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"];
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
/** 이보다 가로 픽셀이 작으면 글자를 잘못 읽을 수 있다고 알린다 */
export const LOW_RES_WIDTH = 900;

export interface ClipboardContent {
  kind: "html" | "text" | "image" | "empty";
  rows: SourceRow[];
  image: File | null;
}

/** 붙여넣기 이벤트의 DataTransfer에서 가장 구조가 살아 있는 형태를 고른다 */
export function readClipboard(data: DataTransfer): ClipboardContent {
  const image = [...data.items].find((i) => i.kind === "file" && IMAGE_TYPES.includes(i.type))?.getAsFile() ?? null;
  const html = data.getData("text/html");
  if (html && /<table[\s>]/i.test(html)) {
    const rows = rowsFromHtml(html);
    if (rows.length > 0) return { kind: "html", rows, image: null };
  }
  const text = data.getData("text/plain");
  if (text.trim()) return { kind: "text", rows: rowsFromText(text), image: null };
  if (image) return { kind: "image", rows: [], image };
  return { kind: "empty", rows: [], image: null };
}

/** HTML 안의 모든 표를 원래 행·셀 순서대로 꺼낸다(스크립트는 실행하지 않는다) */
export function rowsFromHtml(html: string): SourceRow[] {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const table: string[][] = [];
  for (const t of doc.querySelectorAll("table")) {
    if (t.querySelector("table")) continue; // 바깥 레이아웃 표는 건너뛰고 안쪽 표만
    for (const tr of t.querySelectorAll("tr")) table.push([...tr.querySelectorAll("th,td")].map((c) => c.textContent ?? ""));
    table.push([]);
  }
  return rowsFromTable(table);
}

export function imageProblem(file: File): string | null {
  if (!IMAGE_TYPES.includes(file.type)) return "PNG·JPEG·WebP 이미지만 읽을 수 있어요.";
  if (file.size > MAX_IMAGE_BYTES) return "이미지가 10MB보다 커요. 성적표 부분만 잘라서 다시 올려 주세요.";
  return null;
}

/** 회전을 적용한 캔버스와 원본 크기 */
export async function prepareImage(file: File, rotation: 0 | 90 | 180 | 270): Promise<{ canvas: HTMLCanvasElement; width: number; height: number }> {
  const bitmap = await createImageBitmap(file);
  const turned = rotation === 90 || rotation === 270;
  const canvas = document.createElement("canvas");
  canvas.width = turned ? bitmap.height : bitmap.width;
  canvas.height = turned ? bitmap.width : bitmap.height;
  const ctx = canvas.getContext("2d")!;
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((rotation * Math.PI) / 180);
  ctx.drawImage(bitmap, -bitmap.width / 2, -bitmap.height / 2);
  const size = { width: bitmap.width, height: bitmap.height };
  bitmap.close();
  return { canvas, ...size };
}

export interface OcrJob {
  done: Promise<SourceRow[]>;
  cancel: () => void;
}

/**
 * 로컬 OCR. 쓸 때만 tesseract.js를 불러오고(dynamic import), 끝나거나 취소하면 Worker를 닫는다.
 * 언어 자료·엔진 파일은 public/ocr에서 읽는다(scripts/build/copy-ocr-assets.mjs).
 */
export function runOcr(image: HTMLCanvasElement, onProgress: (ratio: number, label: string) => void): OcrJob {
  let cancelled = false;
  let terminate: (() => Promise<unknown>) | null = null;
  const done = (async () => {
    onProgress(0, "읽기 도구 준비 중");
    const { createWorker, OEM } = await import("tesseract.js");
    if (cancelled) throw new DOMException("cancelled", "AbortError");
    const worker = await createWorker(["kor", "eng"], OEM.LSTM_ONLY, {
      workerPath: "/ocr/worker.min.js",
      corePath: "/ocr/core",
      langPath: "/ocr/lang",
      gzip: true,
      logger: (m: { status: string; progress: number }) => {
        if (cancelled) return;
        if (m.status === "recognizing text") onProgress(0.2 + m.progress * 0.8, "글자 읽는 중");
        else onProgress(Math.min(0.2, m.progress * 0.2), "한국어·영어 자료 불러오는 중");
      },
    });
    terminate = () => worker.terminate();
    if (cancelled) {
      await worker.terminate();
      throw new DOMException("cancelled", "AbortError");
    }
    try {
      // 표 모양을 유지하도록 한 블록 안의 줄 단위로 읽는다
      await worker.setParameters({ preserve_interword_spaces: "1" });
      const { data } = await worker.recognize(image);
      return rowsFromText(data.text);
    } finally {
      await worker.terminate();
      terminate = null;
    }
  })();
  return {
    done,
    cancel: () => {
      cancelled = true;
      void terminate?.();
    },
  };
}
