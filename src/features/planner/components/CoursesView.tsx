import type { Dataset, PlanInput, PlanResult, Term } from "@/contracts/types";
import { formatTerm, groupOf, recommendedCourses } from "@/engine";
import { TRACK_NAME } from "../labels";
import { Badge, SectionHeader } from "./ui";


export function CoursesView({
  input,
  dataset,
  result,
  onToggleCompleted,
  onJump,
}: {
  input: PlanInput;
  dataset: Dataset;
  result: PlanResult;
  onToggleCompleted: (code: string) => void;
  /** 로드맵의 해당 학기로 이동 */
  onJump: (term: Term) => void;
}) {
  // 엔진 결과에서 과목이 놓인 학기를 찾는다(표시용).
  const placedAt = new Map<string, Term>();
  result.terms.forEach((t) => t.courses.forEach((c) => placedAt.set(c.code, t.term)));
  const unplaced = new Set(result.unplaced.map((u) => u.code));
  const courses = recommendedCourses(dataset, input.track);
  const sourceOf = (id: string) => dataset.sources.find((s) => s.id === id);

  return (
    <>
      <SectionHeader
        title={`${TRACK_NAME[input.track]} 추천 과목`}
        aside={<span className="text-xs text-muted">{courses.length}개 · 서비스 진로 분류</span>}
      />
      <div className="grid gap-2.5 sm:grid-cols-2">
        {courses.map((c) => {
          const done = input.completedCourseCodes.includes(c.code);
          const tag = dataset.careerTags.find((t) => t.courseCode === c.code);
          const src = sourceOf(c.sourceId);
          return (
            <article key={c.code} className="min-w-0 rounded-[10px] border border-line bg-panel p-4">
              <div className="flex items-center justify-between gap-2">
                {done ? (
                  <Badge tone="ok">이수 완료</Badge>
                ) : groupOf(c.code, dataset) === "common" ? (
                  <Badge>공통 기반</Badge>
                ) : (
                  <Badge>진로 추천</Badge>
                )}
                <label className="flex items-center gap-1.5 text-[11px] text-muted">
                  <input type="checkbox" checked={done} onChange={() => onToggleCompleted(c.code)} />
                  이수함
                </label>
              </div>
              <h3 className="mt-2.5 mb-1 text-sm font-medium break-words">{c.name}</h3>
              {!done && placedAt.has(c.code) && (
                <button
                  type="button"
                  onClick={() => onJump(placedAt.get(c.code)!)}
                  className="mb-1.5 cursor-pointer text-xs font-medium text-brand hover:underline"
                >
                  {formatTerm(placedAt.get(c.code)!)}에 배치됨 · 로드맵에서 보기
                </button>
              )}
              {!done && unplaced.has(c.code) && <p className="mb-1.5 text-xs text-warm-ink">배치하지 못함 · 로드맵 위 확인 항목 참고</p>}
              <p className="mb-2 text-xs text-muted">
                {c.code} · {c.credits}학점 · {c.recommendedYear ?? "?"}학년{" "}
                {c.semester === null ? "학기 미확인" : c.semester === 0 ? "학기 공통" : `${c.semester}학기`}
              </p>
              <details>
                <summary className="cursor-pointer text-[11px] text-brand">추천 이유와 근거</summary>
                <p className="mt-2 text-xs">{tag?.reason ?? "추천 분류 없음"}</p>
                <p className="mt-1 text-xs text-muted">
                  선수요건: {c.prerequisiteStatus === "verified" ? c.prerequisites.join(", ") || "없음" : "미확인"} · 종료연도{" "}
                  {c.offeringEndYear ?? "미확인"}
                </p>
                {src && (
                  <a href={src.url} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block text-xs text-brand underline">
                    원문 확인 ↗ ({src.checkedAt})
                  </a>
                )}
              </details>
            </article>
          );
        })}
      </div>
    </>
  );
}
