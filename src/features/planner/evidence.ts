import type { DatasetV2, PlanResult } from "@/contracts/types";
import { addGenEd, emptyGenEd, formatTerm, type GenEdState, LATE_LIGHT_CONFIG } from "@/engine";
import type { Draft } from "./plan";
import { curriculumCovers } from "./profile";
import type { Track } from "./tracks";

/** 확인 상태별로 나눈 근거 목록(화면 표시용). 새 수치를 만들지 않고 이미 있는 결과·자료만 분류한다. */
export interface EvidenceGroups {
  /** 공식 자료로 확인 */
  verified: Array<{ text: string; href?: string }>;
  /** 서비스 추천·계획 방식(학교 공식 아님) */
  service: string[];
  /** 사용자가 정한 값·가정 */
  assumption: string[];
  /** 아직 확인되지 않음 */
  unknown: string[];
}

export function evidenceFor(track: Track, draft: Draft, dataset: DatasetV2): EvidenceGroups {
  const c = track.candidate;
  const res = c.result;
  const out: EvidenceGroups = { verified: [], service: [], assumption: [], unknown: [] };
  const src = dataset.sources.find((s) => s.id === dataset.courses[0]?.sourceId);
  out.verified.push({ text: `과목·학점·이수구분·권장 학년: ${dataset.department} ${dataset.curriculum} 교육과정 자료`, href: src?.url });

  const capRuleIds = [...new Set(res?.terms.flatMap((t) => (t.capRuleId ? [t.capRuleId] : [])) ?? [])];
  for (const id of capRuleIds) {
    const rule = dataset.creditCapRules?.find((r) => r.id === id);
    if (rule) out.verified.push({ text: `학기당 최대 ${rule.maxCredits}학점(${rule.sourceRef.sourceId} ${rule.sourceRef.pages.join("·")}쪽) — 계획 학점보다 작아 적용` });
  }
  const mil = track.militaryTrackId ? dataset.military?.tracks.find((t) => t.id === track.militaryTrackId) : null;
  if (mil) {
    for (const s of mil.sources) out.verified.push({ text: `${mil.officialName}: ${s.locator} (${s.checkedAt} 확인)`, href: s.url });
    if (mil.serviceMonths !== null && mil.serviceMonthsStatus === "verified") out.verified.push({ text: `${mil.officialName} 복무기간 ${mil.serviceMonths}개월 — ${mil.serviceMonthsNote}` });
  }

  out.service.push("진로 분류·핵심 과목·추천 순위는 서비스가 정한 것이며 학교 공식 트랙이 아닙니다.");
  if (track.paceStyle === "late_light") out.service.push(`${LATE_LIGHT_CONFIG.name}: ${LATE_LIGHT_CONFIG.disclaimer}`);
  if (track.militaryStart) out.service.push("입대 시기 후보(학년을 마친 직후)는 계획 비교용 서비스 규칙입니다.");
  if (track.exchangeTerm) out.service.push("교환 학기 추천(3학년)은 서비스 기준이며 학교 규정이 아닙니다.");

  out.assumption.push(`학기당 ${c.key.paceCredits}학점 계획 상한(학교 승인값 아님)`);
  out.assumption.push("1학기 3~6월, 2학기 9~12월 계획용 학기 구간");
  if (draft.targetCredits !== null)
    out.assumption.push(
      draft.targetSource === "graduation_check"
        ? `목표 ${draft.targetCredits}학점 — 이 학생의 졸업사정 조회 값(학교 공통 졸업학점 아님)`
        : `목표 ${draft.targetCredits}학점 — 직접 정한 목표`,
    );
  if (track.militaryStart) out.assumption.push(`입대일을 ${formatTerm(track.militaryStart)} 시작일로 가정`);
  for (const a of res?.assumptions ?? [])
    if (a.status === "user_assumption" && a.id.startsWith("military_track")) out.assumption.push(a.message);
  if (draft.leave.mode === "pick") out.assumption.push("휴학 한 학기(직접 고른 시점)");

  for (const m of c.missing) out.unknown.push(m.message);
  if (track.militaryRole === "conditional") out.unknown.push("카투사 선발 결과(합격 가능성은 계산하지 않음)");
  if (mil && mil.serviceMonths === null) out.unknown.push(`${mil.officialName} 복무기간 — ${mil.serviceMonthsNote}`);
  if (res?.warnings.some((w) => w.code === "PREREQ_UNKNOWN")) out.unknown.push("일부 과목의 공식 선수요건");
  if (res?.warnings.some((w) => w.code === "OFFERING_ASSUMED")) out.unknown.push("자료상 종료연도 이후 과목의 개설 여부");
  if (track.exchangeTerm) out.unknown.push("교환학생 인정학점(더하지 않음)");
  const covers = curriculumCovers(dataset.curriculum, draft.admissionYear);
  if (covers !== true) out.unknown.push(`자료 범위 확인 필요 — ${dataset.curriculum} 교육과정이 내 입학연도에 적용되는지`);
  if (!capRuleIds.length) out.unknown.push("나에게 적용되는 학교 최대 수강학점(입학연도·학기로 확인된 규칙이 없으면 계획 상한만 사용)");
  out.unknown = [...new Set(out.unknown)];
  return out;
}

/** 테스트 프로필의 시연용 교양 자리를 결과에 넣는다. 들어가지 않는 항목은 건너뛴다(학기 상한을 넘기지 않음). */
export function demoGenEd(result: PlanResult, demo: Draft["demo"]): GenEdState {
  let state = emptyGenEd();
  if (!demo) return state;
  const study = result.terms.filter((t) => t.status === "study");
  for (const g of demo.genEd) {
    const r = addGenEd(state, study[g.studyIndex], g.credits, "demo");
    if (r.ok) state = r.state;
  }
  return state;
}

