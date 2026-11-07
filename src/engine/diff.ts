import type { PlanDiff, PlannedTerm, PlanResult, PlanWarning, Term } from "@/contracts/types";

/** v1·v2 결과 모두 비교할 수 있도록 필요한 필드만 받는다. */
export type DiffablePlan = Pick<PlanResult, "unplaced" | "warnings" | "expectedCompletion"> & {
  terms: Array<Pick<PlannedTerm, "term" | "courses" | "plannedCredits">>;
};
import { termFromIndex, termIndex } from "./terms";

function courseCodes(result: DiffablePlan): Set<string> {
  const codes = new Set<string>();
  result.terms.forEach((t) => t.courses.forEach((c) => codes.add(c.code)));
  result.unplaced.forEach((u) => codes.add(u.code));
  return codes;
}

const warningKey = (w: PlanWarning) =>
  `${w.code}|${w.courseCode ?? ""}|${w.term ? termIndex(w.term) : ""}`;

export function diffPlans(before: DiffablePlan, after: DiffablePlan): PlanDiff {
  const a = courseCodes(before);
  const b = courseCodes(after);

  const credits = new Map<number, { before: number; after: number }>();
  for (const t of before.terms) credits.set(termIndex(t.term), { before: t.plannedCredits, after: 0 });
  for (const t of after.terms) {
    const i = termIndex(t.term);
    credits.set(i, { before: credits.get(i)?.before ?? 0, after: t.plannedCredits });
  }

  const beforeWarnings = new Set(before.warnings.map(warningKey));

  return {
    addedCourses: [...b].filter((c) => !a.has(c)).sort(),
    removedCourses: [...a].filter((c) => !b.has(c)).sort(),
    completionDeltaTerms:
      before.expectedCompletion && after.expectedCompletion
        ? termIndex(after.expectedCompletion) - termIndex(before.expectedCompletion)
        : null,
    creditDiffByTerm: [...credits.entries()]
      .filter(([, v]) => v.before !== v.after)
      .sort(([x], [y]) => x - y)
      .map(([i, v]) => ({ term: termFromIndex(i) as Term, ...v })),
    newWarnings: after.warnings.filter((w) => !beforeWarnings.has(warningKey(w))),
  };
}
