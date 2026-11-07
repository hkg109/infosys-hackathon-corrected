import type {
  CareerTrack,
  DatasetV2,
  GuidanceItemV2,
  GuidanceResultV2,
  PlanInputV2,
  PlanResultV2,
  RecommendationConfig,
  Term,
} from "@/contracts/types";
import { CAREER_LABEL } from "@/contracts/careers";
import { resolvePeriodRange } from "@/engine";
import { termIndex, termRange } from "@/engine/terms";

const CAREER: Record<CareerTrack, string> = CAREER_LABEL;
const termKey = (t: Term | null) => (t ? String(termIndex(t)) : "-");

/**
 * v2 결과를 준비사항으로 바꾼다. 학점·날짜를 다시 계산하지 않고 결과의 학기 배치만 읽는다.
 * 확인하지 않은 신청 기간은 날짜로 만들지 않고 상대 시점("복학 전")과 "신청 기간 확인 필요"로 둔다.
 */
export function buildGuidanceV2(
  input: PlanInputV2,
  result: PlanResultV2,
  dataset: DatasetV2,
  config?: RecommendationConfig,
): GuidanceResultV2 {
  const known = new Set(dataset.sources.map((s) => s.id));
  const src = (...ids: string[]) => ids.filter((id) => known.has(id));
  const items: GuidanceItemV2[] = [];
  const has = (code: string) => result.warnings.some((w) => w.code === code);

  // 기간별: 그 기간 직후의 첫 수강 학기를 결과에서 찾는다.
  for (const p of input.periods) {
    const range = resolvePeriodRange(p);
    const firstAfter = range
      ? (result.terms.find((t) => t.status === "study" && termRange(t.term).start >= range.end)?.term ?? null)
      : null;

    if (p.kind === "military")
      items.push({
        id: `military:${p.id}`,
        title: "입영·전역일과 복학 신청 일정 확인",
        detail: "입력한 날짜는 계획용 가정입니다. 실제 입영일, 전역일, 복학 신청 기간은 확인 후 다시 맞추세요. 신청 기간 확인 필요.",
        sourceIds: [],
        evidence: "user",
        status: range ? "user_assumption" : "unknown",
        timing: { kind: "relative", anchor: "before_military", term: null, label: "입대 전" },
        relatedPeriodIds: [p.id],
        relatedCourseCodes: [],
        checkKey: `military:${p.id}:${range?.start ?? "-"}:${range?.end ?? "-"}`,
      });

    if (p.kind === "exchange" && (p.exchange?.credits ?? null) === null)
      items.push({
        id: `exchange:${p.id}`,
        title: "교환학생 인정학점·학기 인정 확인",
        detail: "인정 여부가 정해지지 않아 교환 이후 학점 진행과 완료 학기를 확정하지 않았습니다.",
        sourceIds: [],
        evidence: "user",
        status: "unknown",
        timing: { kind: "relative", anchor: "before_exchange", term: null, label: "교환 출발 전" },
        relatedPeriodIds: [p.id],
        relatedCourseCodes: [],
        checkKey: `exchange:${p.id}:${range?.start ?? "-"}`,
      });

    if ((p.kind === "military" || p.kind === "leave") && firstAfter)
      items.push({
        id: `return-curriculum:${p.id}`,
        title: "복학 전 적용 교육과정 재확인",
        detail:
          "휴복학 등 학적변동 이후에는 적용 교육과정이 달라질 수 있습니다(수강신청 안내문 16쪽). 복학 학기의 교육과정과 개설 과목을 확인하세요.",
        sourceIds: src("S2"),
        evidence: "official",
        status: "verified",
        timing: { kind: "relative", anchor: "before_return", term: firstAfter, label: "복학 전" },
        relatedPeriodIds: [p.id],
        relatedCourseCodes: [],
        checkKey: `return-curriculum:${p.id}:${termKey(firstAfter)}`,
      });
  }

  if (input.periods.length === 0) {
    const first = result.terms.find((t) => t.status === "study")?.term ?? input.startTerm;
    items.push({
      id: "next-term",
      title: "다음 학기 수강편람 확인",
      detail: "교육과정 목록과 실제 개설 과목은 다를 수 있습니다.",
      sourceIds: src(...dataset.sources.map((s) => s.id)),
      evidence: "official",
      status: "unknown",
      timing: { kind: "relative", anchor: "before_term", term: first, label: "수강신청 전" },
      relatedPeriodIds: [],
      relatedCourseCodes: [],
      checkKey: `next-term:${termKey(first)}`,
    });
  }

  if (has("OFFERING_ASSUMED") || has("SEMESTER_UNKNOWN")) {
    const codes = result.warnings
      .filter((w) => (w.code === "OFFERING_ASSUMED" || w.code === "SEMESTER_UNKNOWN") && w.courseCode)
      .map((w) => w.courseCode!);
    const uniq = [...new Set(codes)].sort();
    items.push({
      id: "offering",
      title: "종료연도 이후·학기 미확인 과목의 개설 확인",
      detail: `${uniq.length}개 과목은 개설 유지나 학기를 가정해 배치했습니다.`,
      sourceIds: src(...dataset.sources.map((s) => s.id)),
      evidence: "official",
      status: "unknown",
      timing: { kind: "relative", anchor: "before_term", term: null, label: "해당 학기 수강신청 전" },
      relatedPeriodIds: [],
      relatedCourseCodes: uniq,
      checkKey: `offering:${uniq.join(",")}`,
    });
  }

  if (result.unplaced.length > 0) {
    const codes = result.unplaced.map((u) => u.code).sort();
    items.push({
      id: "unplaced",
      title: `배치하지 못한 과목 ${codes.length}개 확인`,
      detail: "공식 선수요건이나 개설 시기를 포털에서 확인하세요(수강신청 안내문 19~20쪽).",
      sourceIds: src("S2"),
      evidence: "official",
      status: "unknown",
      timing: { kind: "relative", anchor: "anytime", term: null, label: "지금" },
      relatedPeriodIds: [],
      relatedCourseCodes: codes,
      checkKey: `unplaced:${codes.join(",")}`,
    });
  }

  if (input.target === null || input.target.source === "user_goal")
    items.push({
      id: "requirements",
      title: "졸업사정조회로 내 졸업요건 확인",
      detail:
        input.target === null
          ? "목표 총학점이 없어 예상 계획 완료 학기를 계산하지 않았습니다. 포털 졸업사정조회에서 확인 후 입력하세요."
          : "목표학점은 사용자 입력값입니다. 공식 졸업 판정이 아니므로 포털 졸업사정조회에서 확인하세요.",
      sourceIds: src("S2"),
      evidence: "official",
      status: "unknown",
      timing: { kind: "relative", anchor: "anytime", term: null, label: "지금" },
      relatedPeriodIds: [],
      relatedCourseCodes: [],
      checkKey: `requirements:${input.target?.value ?? "-"}`,
    });

  for (const career of input.careers) {
    const core = config?.careers.find((c) => c.track === career)?.coreCourses.map((c) => c.courseCode) ?? [];
    const done = new Set(input.progress.completedCourseCodes ?? []);
    const pending = core.filter((c) => !done.has(c));
    const firstCore =
      result.terms.find((t) => t.courses.some((c) => pending.includes(c.code)))?.term ?? null;
    items.push({
      id: `career:${career}`,
      title: `${CAREER[career]} 진로 준비`,
      detail:
        pending.length > 0
          ? `핵심 과목 ${pending.length}개를 계획에 넣었습니다. 서비스의 진로 분류이며 학교 공식 트랙이 아닙니다.`
          : "추천 과목은 서비스의 진로 분류이며 학교 공식 트랙이 아닙니다.",
      sourceIds: [],
      evidence: "service",
      status: "unknown",
      timing: { kind: "relative", anchor: "before_term", term: firstCore, label: firstCore ? "핵심 과목 첫 학기 전" : "언제든" },
      relatedPeriodIds: [],
      relatedCourseCodes: pending,
      checkKey: `career:${career}:${termKey(firstCore)}:${pending.join(",")}`,
    });
  }

  return { items };
}
