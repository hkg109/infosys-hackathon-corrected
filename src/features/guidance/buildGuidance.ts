import { CAREER_LABEL } from "@/contracts/careers";
import type { Dataset, GuidanceItem, GuidanceResult, PlanInput, PlanResult } from "@/contracts/types";

const TRACK_NAME = CAREER_LABEL;

/**
 * 계산 결과를 다음 행동 3~5개로 바꾼다. 학점·날짜를 다시 계산하지 않는다.
 * 확인하지 못한 모집일·마감일을 만들어내지 않는다.
 */
export function buildGuidance(input: PlanInput, result: PlanResult, dataset: Dataset): GuidanceResult {
  const sourceIds = dataset.sources.map((s) => s.id);
  const items: GuidanceItem[] = [];
  const has = (code: string) => result.warnings.some((w) => w.code === code);

  if (input.breaks.some((b) => b.kind === "military"))
    items.push({
      id: "military",
      title: "확정 입영·전역일과 복학 신청 일정 확인",
      detail:
        "입력한 날짜는 가정입니다. 실제 복학 신청 기간과 승인 조건은 학사 공지에서 확인하세요. 복학 후 적용 교육과정이 달라질 수 있어(수강신청 안내문 16쪽) 복학 전에 다시 확인하세요.",
      sourceIds: [],
    });
  else if (input.breaks.length > 0)
    items.push({
      id: "leave",
      title: "휴학·복학 신청 절차 확인",
      detail: "복학 후 개설 과목과 적용 교육과정이 달라질 수 있어(수강신청 안내문 16쪽) 복학 전에 다시 확인하세요.",
      sourceIds: [],
    });
  else
    items.push({
      id: "next-term",
      title: "다음 학기 수강편람 확인",
      detail: "교육과정 목록과 실제 개설 과목은 다를 수 있습니다.",
      sourceIds,
    });

  if (has("OFFERING_ASSUMED") || has("SEMESTER_UNKNOWN"))
    items.push({
      id: "offering",
      title: "종료연도 이후·학기 미확인 과목의 개설 확인",
      detail: "일부 과목은 개설 유지를 가정해 배치했습니다.",
      sourceIds,
    });

  if (result.unplaced.length > 0)
    items.push({
      id: "unplaced",
      title: `배치하지 못한 과목 ${result.unplaced.length}개 확인`,
      detail: "공식 선수요건이나 개설 시기를 확인하세요.",
      sourceIds,
    });

  if (has("TARGET_UNKNOWN") || dataset.rules.some((r) => r.status !== "verified"))
    items.push({
      id: "requirements",
      title: "내 적용 교육과정과 졸업요건 확인",
      detail: "졸업 총학점·전공학점 요건이 확인되지 않아 예상 계획으로만 보여줍니다.",
      sourceIds: [],
    });

  items.push({
    id: "career",
    title: `${TRACK_NAME[input.track]} 진로 프로젝트 준비`,
    detail: "추천 과목은 서비스의 진로 분류이며 학교 공식 트랙이 아닙니다.",
    sourceIds: [],
  });

  return { items: items.slice(0, 5) };
}
