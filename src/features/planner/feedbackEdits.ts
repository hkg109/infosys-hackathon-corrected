import type { DatasetV2, PlanEdit, PlanInput, PlanResult, Term } from "@/contracts/types";
import { formatTerm, paceBandsFor, termIndex, termRange } from "@/engine";

/**
 * 피드백 편집 적용(순수 함수). 채팅이 제안한 편집을 검증해 PlanInput에 반영한다.
 * 학점·완료 학기는 여기서 계산하지 않고 화면이 simulatePlan으로 다시 계산한다.
 */

const sameTerm = (a: Term, b: Term) => a.year === b.year && a.season === b.season;
const termOk = (t: Term | undefined): t is Term => !!t && Number.isInteger(t.year) && (t.season === 1 || t.season === 2) && t.year >= 2000 && t.year <= 2100;

export interface ApplyResult {
  next: PlanInput;
  changes: string[];
  /** 적용하지 않은 편집과 이유 */
  rejected: string[];
}

export function applyEdits(input: PlanInput, edits: PlanEdit[], dataset: DatasetV2): ApplyResult {
  let next: PlanInput = { ...input, breaks: [...input.breaks], termCaps: [...(input.termCaps ?? [])], courseRules: [...(input.courseRules ?? [])] };
  const changes: string[] = [];
  const rejected: string[] = [];
  const course = (code: string) => dataset.courses.find((c) => c.code.toUpperCase() === code.toUpperCase());
  const beforeStart = (t: Term) => termIndex(t) < termIndex(input.startTerm);

  for (const e of edits) {
    switch (e.type) {
      case "set_credit_cap": {
        if (!Number.isInteger(e.credits) || e.credits < 9 || e.credits > 24) {
          rejected.push(`학기당 학점 ${e.credits}은(는) 9~24 사이가 아니라 적용하지 않았어요.`);
          break;
        }
        next = { ...next, creditCap: e.credits, paceBands: next.paceStyle === "late_light" ? paceBandsFor("late_light", e.credits) : next.paceBands };
        changes.push(`학기당 계획 학점: ${e.credits}학점(학교 상한이 더 작으면 그 값)`);
        break;
      }
      case "set_pace_style": {
        next = { ...next, paceStyle: e.style, paceBands: paceBandsFor(e.style, next.creditCap) };
        changes.push(`학점 배치: ${e.style === "late_light" ? "후반 여유형(3·4학년 줄이기)" : "균형형"}`);
        break;
      }
      case "set_term_cap": {
        if (!termOk(e.term) || beforeStart(e.term) || !Number.isInteger(e.credits) || e.credits < 0 || e.credits > 24) {
          rejected.push("학기별 학점 제한의 학기나 학점이 올바르지 않아 적용하지 않았어요.");
          break;
        }
        next.termCaps = [...next.termCaps!.filter((t) => !sameTerm(t.term, e.term)), { term: e.term, credits: e.credits }];
        changes.push(`${formatTerm(e.term)} 최대 ${e.credits}학점`);
        break;
      }
      case "clear_term_cap": {
        if (!termOk(e.term)) break;
        next.termCaps = next.termCaps!.filter((t) => !sameTerm(t.term, e.term));
        changes.push(`${formatTerm(e.term)} 학점 제한 해제`);
        break;
      }
      case "add_leave": {
        if (!termOk(e.term) || beforeStart(e.term)) {
          rejected.push("휴학 학기가 계획 시작 전이거나 올바르지 않아 적용하지 않았어요.");
          break;
        }
        const r = termRange(e.term);
        if (next.breaks.some((b) => b.startDate < r.end && r.start < b.endDate)) {
          rejected.push(`${formatTerm(e.term)}은(는) 이미 쉬는 학기라 휴학을 더하지 않았어요.`);
          break;
        }
        next.breaks = [...next.breaks, { kind: "leave", startDate: r.start, endDate: r.end }];
        changes.push(`${formatTerm(e.term)} 휴학`);
        break;
      }
      case "remove_leave": {
        if (!termOk(e.term)) break;
        const r = termRange(e.term);
        const before = next.breaks.length;
        next.breaks = next.breaks.filter((b) => !(b.kind === "leave" && b.startDate === r.start && b.endDate === r.end));
        if (next.breaks.length < before) changes.push(`${formatTerm(e.term)} 휴학 취소`);
        else rejected.push(`${formatTerm(e.term)}에는 휴학이 없어요(군 복무 학기는 채팅으로 바꾸지 않아요).`);
        break;
      }
      case "exclude_course": {
        const c = course(e.code);
        if (!c) {
          rejected.push(`학과 자료에 없는 과목(${e.code})이라 뺄 수 없어요.`);
          break;
        }
        next.courseRules = [...next.courseRules!.filter((r) => r.code !== c.code), { code: c.code, action: "exclude" }];
        changes.push(`${c.name} 빼기${c.category?.includes("필수") ? "(필수 과목 — 졸업요건 확인 필요)" : ""}`);
        break;
      }
      case "restore_course": {
        const c = course(e.code);
        if (!c) break;
        next.courseRules = next.courseRules!.filter((r) => r.code !== c.code);
        changes.push(`${c.name} 다시 넣기`);
        break;
      }
      case "defer_course": {
        const c = course(e.code);
        if (!c || !termOk(e.term) || beforeStart(e.term)) {
          rejected.push("미룰 과목이나 학기가 올바르지 않아 적용하지 않았어요.");
          break;
        }
        next.courseRules = [...next.courseRules!.filter((r) => r.code !== c.code), { code: c.code, action: "not_before", term: e.term }];
        changes.push(`${c.name}은(는) ${formatTerm(e.term)} 이후에`);
        break;
      }
      case "set_target_credits": {
        if (!Number.isInteger(e.credits) || e.credits < 100 || e.credits > 160) {
          rejected.push(`목표 ${e.credits}학점은 범위(100~160)를 벗어나 적용하지 않았어요.`);
          break;
        }
        next = { ...next, targetCredits: e.credits };
        changes.push(`목표 총학점: ${e.credits}학점`);
        break;
      }
    }
  }
  if (next.termCaps!.length === 0) delete next.termCaps;
  if (next.courseRules!.length === 0) delete next.courseRules;
  return { next, changes, rejected };
}

// ── Claude에 보낼 계획 요약(이름 등 개인정보 없이) ───────

export function planContext(input: PlanInput, result: PlanResult, dataset: DatasetV2) {
  let ord = input.completedTerms;
  return {
    startTerm: input.startTerm,
    completedTerms: input.completedTerms,
    earnedCredits: input.earnedCredits,
    targetCredits: input.targetCredits,
    creditCap: input.creditCap,
    paceStyle: input.paceStyle ?? "balanced",
    termCaps: input.termCaps ?? [],
    courseRules: input.courseRules ?? [],
    expectedCompletion: result.expectedCompletion,
    terms: result.terms.map((t) => {
      const studyOrdinal = t.status === "study" ? ++ord : null;
      return {
        term: t.term,
        label: formatTerm(t.term),
        gradeLabel: studyOrdinal ? `${Math.ceil(studyOrdinal / 2)}학년 ${studyOrdinal % 2 === 1 ? 1 : 2}학기` : null,
        status: t.status,
        plannedCredits: t.plannedCredits,
        courses: t.courses.map((c) => ({ code: c.code, name: c.name, credits: c.credits, category: dataset.courses.find((x) => x.code === c.code)?.category ?? null })),
      };
    }),
    unplaced: result.unplaced.map((u) => ({ code: u.code, name: u.name })),
  };
}
export type PlanContext = ReturnType<typeof planContext>;

// ── 규칙 기반 해석(키가 없거나 호출이 실패할 때) ──────────

const norm = (s: string) => s.replace(/\s+/g, "").toLowerCase();

/** "2028년 2학기", "28-2", "4학년 2학기", "다음 학기" → 계획 안의 학기 */
export function findTerm(text: string, ctx: PlanContext): Term | null {
  const t = text.replace(/\s+/g, "");
  let m = t.match(/(20\d{2})년?(1|2)학기/) ?? t.match(/'?(\d{2})-(1|2)(?!\d)/);
  if (m) {
    const year = m[1].length === 2 ? 2000 + Number(m[1]) : Number(m[1]);
    return { year, season: Number(m[2]) as 1 | 2 };
  }
  m = t.match(/([1-5])학년([12])학기/);
  if (m) return ctx.terms.find((x) => x.gradeLabel === `${m![1]}학년 ${m![2]}학기`)?.term ?? null;
  m = t.match(/([1-5])학년/);
  if (m && /(때|에|부터|이후|로)/.test(t)) return ctx.terms.find((x) => x.gradeLabel?.startsWith(`${m![1]}학년`))?.term ?? null;
  if (/다음학기/.test(t)) return ctx.terms[0]?.term ?? null;
  if (/마지막학기/.test(t)) return [...ctx.terms].reverse().find((x) => x.status === "study")?.term ?? null;
  return null;
}

function findCourse(text: string, ctx: PlanContext, dataset: DatasetV2) {
  const t = norm(text);
  const code = text.toUpperCase().match(/[A-Z]{2,4}-?\s?\d{4}/)?.[0]?.replace(/[\s-]/g, "");
  const pool = dataset.courses;
  if (code) {
    const c = pool.find((x) => x.code.replace(/-/g, "") === code);
    if (c) return c;
  }
  // 긴 이름부터(“데이터베이스시스템”이 “데이터베이스”보다 먼저)
  return [...pool].sort((a, b) => b.name.length - a.name.length).find((c) => t.includes(norm(c.name))) ?? null;
}

export function parseFeedbackRules(message: string, ctx: PlanContext, dataset: DatasetV2): { edits: PlanEdit[]; reply: string; notSupported: string[] } {
  const t = norm(message);
  const edits: PlanEdit[] = [];
  const notSupported: string[] = [];
  const term = findTerm(message, ctx);
  const c = findCourse(message, ctx, dataset);

  if (/계절학기|여름학기|겨울학기/.test(t)) notSupported.push("계절학기는 아직 계획 모델에 없어요(학교 공식 계절학기 학점 상한을 확인하지 못했어요). 대신 특정 학기를 가볍게 하는 건 바로 할 수 있어요.");
  if (/교수/.test(t)) notSupported.push("교수님별 개설 정보는 자료에 없어서 교수님 기준으로는 고르지 못해요. 그 과목을 빼거나 다른 학기로 미루는 건 할 수 있어요.");

  const n = Number(message.match(/(\d{1,2})\s*학점/)?.[1] ?? NaN);
  if (c && /(빼|안듣|듣기싫|싫어|피하|제외|안들)/.test(t)) edits.push({ type: "exclude_course", code: c.code });
  else if (c && /(다시넣|다시듣|복구|되살)/.test(t)) edits.push({ type: "restore_course", code: c.code });
  else if (c && term && /(미루|나중|뒤로|이후|부터|에듣|때듣|로옮|옮겨)/.test(t)) edits.push({ type: "defer_course", code: c.code, term });
  else if (/휴학/.test(t) && term) edits.push(/(취소|안할|빼)/.test(t) ? { type: "remove_leave", term } : { type: "add_leave", term });
  else if (term && (Number.isFinite(n) || /(가볍|여유|줄이|적게|널널)/.test(t))) edits.push({ type: "set_term_cap", term, credits: Number.isFinite(n) ? n : 12 });
  else if (/목표/.test(t) && /(\d{3})학점/.test(t)) edits.push({ type: "set_target_credits", credits: Number(t.match(/(\d{3})학점/)![1]) });
  else if (/(3·4학년|34학년|후반|고학년|4학년)/.test(t) && /(가볍|여유|줄이)/.test(t)) edits.push({ type: "set_pace_style", style: "late_light" });
  else if (/(균형|고르게|일정하게)/.test(t)) edits.push({ type: "set_pace_style", style: "balanced" });
  else if (/(빨리|빠르게|일찍|조기)/.test(t)) edits.push({ type: "set_credit_cap", credits: Math.max(20, ctx.creditCap) });
  else if (Number.isFinite(n) && /(매학기|학기당|한학기에)/.test(t)) edits.push({ type: "set_credit_cap", credits: n });
  else if (/(가볍|여유|줄이)/.test(t)) edits.push({ type: "set_pace_style", style: "late_light" });

  const reply =
    edits.length > 0
      ? "요청대로 계획을 고쳐서 다시 계산했어요."
      : notSupported.length > 0
        ? ""
        : "어떤 학기나 과목을 바꾸고 싶은지 조금 더 알려 주세요. 예) “4학년 2학기는 12학점만”, “데이터베이스는 3학년 때 듣고 싶어요”, “2028년 1학기 휴학”, “인공지능 과목은 빼 주세요”.";
  return { edits, reply, notSupported };
}
