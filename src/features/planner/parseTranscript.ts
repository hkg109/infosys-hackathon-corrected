import type { Course } from "@/contracts/types";

const squash = (s: string) => s.replace(/\s+/g, "").toUpperCase();

/**
 * 한양인 성적 조회 화면 등에서 복사한 텍스트에서 자료에 있는 과목을 찾는다.
 * 학수번호가 보이면 학수번호로, 아니면 과목명 전체가 그대로 있을 때만 찾은 것으로 본다.
 * 브라우저 안에서만 처리하며 학점·성적은 읽지 않는다.
 */
export function findCoursesInText(text: string, courses: Course[]): string[] {
  const flat = squash(text);
  if (!flat) return [];
  const codes = new Set((text.toUpperCase().match(/[A-Z]{3}\d{4}/g) ?? []));
  return courses
    .filter((c) => codes.has(c.code.toUpperCase()) || flat.includes(squash(c.name)))
    .map((c) => c.code);
}
