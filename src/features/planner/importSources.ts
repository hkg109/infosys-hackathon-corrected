"use client";

import { rowsFromTable, rowsFromText, type SourceRow } from "./transcriptImport";

/**
 * 붙여넣기 원문 읽기(브라우저 전용). text/html의 표 → text/plain의 탭·행 → 일반 텍스트 순서.
 * 원문은 저장하지 않는다. 호출한 쪽이 검토 후 확인한 값만 저장한다. 이미지(스크린샷)는 읽지 않는다.
 */

export interface ClipboardContent {
  kind: "html" | "text" | "image" | "empty";
  rows: SourceRow[];
}

export function readClipboard(data: DataTransfer): ClipboardContent {
  const html = data.getData("text/html");
  if (html && /<table[\s>]/i.test(html)) {
    const rows = rowsFromHtml(html);
    // 표가 여러 개면 가장 많은 행을 가진 표 구조가 살아 있다. 행이 너무 적으면 텍스트 쪽이 나을 수 있다
    if (rows.length >= 2) return { kind: "html", rows };
  }
  const text = data.getData("text/plain");
  if (text.trim()) return { kind: "text", rows: rowsFromText(text) };
  if ([...data.items].some((i) => i.kind === "file" && i.type.startsWith("image/"))) return { kind: "image", rows: [] };
  return { kind: "empty", rows: [] };
}

/** HTML 안의 표를 원래 행·셀 순서대로 꺼낸다(스크립트는 실행하지 않는다). 레이아웃용 바깥 표는 건너뛴다 */
export function rowsFromHtml(html: string): SourceRow[] {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const table: string[][] = [];
  for (const t of doc.querySelectorAll("table")) {
    if (t.querySelector("table")) continue;
    for (const tr of t.querySelectorAll("tr")) table.push([...tr.querySelectorAll("th,td")].map((c) => (c as HTMLElement).innerText ?? c.textContent ?? ""));
    table.push([]);
  }
  return rowsFromTable(table);
}
