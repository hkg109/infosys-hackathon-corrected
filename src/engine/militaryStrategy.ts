import type {
  ConcurrentApplicationRule,
  EligibilityResult,
  ISODate,
  MilitaryCatalog,
  MilitaryOutcomeBranch,
  MilitaryPlanningInput,
  MilitaryStrategyCandidate,
  MilitaryStrategySet,
  MilitaryTrackInfo,
  OfficialSource,
  PlannedApplication,
  RecruitmentCycle,
} from "@/contracts/types";

/**
 * 최소 입력 → 분기형 군 복무 전략. 순수 함수(같은 입력·같은 카탈로그 → 같은 결과).
 *
 * - 복무개월·입영일·중복지원 규칙을 사용자에게 묻지 않는다. 카탈로그(병무청 원문 검토 자료)로 계산한다.
 * - 회차를 명시하지 않은 중복지원 규칙은 쓰지 않는다. 대상 회차에 규칙이 없으면 "unknown"으로 두고
 *   허용(동시지원)·불허(순차지원) 두 전략을 모두 만든다.
 * - 공고가 없는 회차는 날짜를 만들지 않는다. 추가모집은 공고 확인 행동으로만 넣고 특정 특기를 보장하지 않는다.
 * - 합격 가능성·다른 사람의 선택은 점수에 넣지 않는다.
 * - 선발 결과가 나오기 전에는 분기를 확정 기간으로 바꾸지 않는다(selectBranchPeriod 참고).
 */

export const PROGRAM = {
  general: "army-general",
  armyTech: "army-technical",
  airTech: "air-force-technical",
  katusa: "katusa",
} as const;

export interface StrategyContext {
  today: ISODate;
  /** 마친 유효학기 수(전공 1년 이수 조건 판단). 모르면 null */
  completedTerms: number | null;
}

const STATUS_RANK: Record<MilitaryStrategyCandidate["status"], number> = { computable: 0, conditional: 1, conflict: 2, ineligible: 3 };

/** 아직 끝나지 않은(또는 공고 미발표) 가장 이른 회차 */
export function nextCycle(catalog: MilitaryCatalog | undefined, programId: string, today: ISODate): RecruitmentCycle | null {
  return (catalog?.recruitmentCycles ?? []).find((c) => c.programId === programId && !isPast(c, today)) ?? null;
}

/** 공식 회차인데 날짜가 없고 이름상 과거 연도면 지난 회차로 본다 */
function isPast(c: RecruitmentCycle, today: ISODate): boolean {
  if (c.applicationEnd) return c.applicationEnd < today;
  const year = Number(c.label.match(/^(\d{4})년/)?.[1] ?? NaN);
  return c.publicationStatus === "official" && Number.isFinite(year) && year < Number(today.slice(0, 4));
}

/** 대상 회차에 적용되는 중복지원 규칙(회차가 명시된 것만) */
export function concurrencyFor(catalog: MilitaryCatalog | undefined, leftProgramId: string, rightProgramId: string, cycleId: string | null): ConcurrentApplicationRule | null {
  if (!cycleId) return null;
  return (
    (catalog?.concurrentRules ?? []).find(
      (r) =>
        r.appliesToCycleIds.includes(cycleId) &&
        ((r.leftProgramId === leftProgramId && (r.rightProgramId === rightProgramId || r.rightProgramId === "*")) ||
          (r.leftProgramId === rightProgramId && r.rightProgramId === leftProgramId)),
    ) ?? null
  );
}

function eligibility(track: MilitaryTrackInfo | undefined, input: MilitaryPlanningInput, ctx: StrategyContext): EligibilityResult {
  const id = track?.id ?? "unknown";
  if (!track) return { programId: id, status: "unknown", reasons: ["검토 자료가 없어요."], question: null };
  const age = "접수연도 기준 만 18~28세·신체등급 1~4급(원문) — 생년·신체등급은 묻지 않아요.";
  switch (track.id) {
    case PROGRAM.katusa: {
      const ev = input.katusaEvidence;
      if (ev?.priorApplication === "other_application")
        return { programId: id, status: "ineligible", reasons: ["카투사 지원은 1회에 한해요(접수취소자·신체검사 불합격자만 재지원 가능, 원문)."], question: null };
      if (ev?.hasLanguageScore === "yes") return { programId: id, status: "eligible", reasons: ["인정 어학성적 보유(점수·응시일 5년 이내는 원문 표로 확인)", age], question: null };
      return {
        programId: id,
        status: "unknown",
        reasons: [ev?.hasLanguageScore === "no" ? "어학 기준을 충족하는 정기시험 성적이 접수 전까지 필요해요." : "어학성적 보유 여부를 몰라요.", age],
        question: ev?.hasLanguageScore === "no" ? null : "카투사 기준을 넘는 영어 정기시험 성적(5년 이내)이 있나요?",
      };
    }
    case PROGRAM.airTech: {
      if (ctx.completedTerms === null) return { programId: id, status: "unknown", reasons: ["IT개발관리병은 관련학과 1년 이상 이수 등 조건이 있어요(원문).", age], question: null };
      return ctx.completedTerms >= 2
        ? { programId: id, status: "eligible", reasons: ["관련학과 1년 이상 이수 조건 충족(마친 학기 기준)", age], question: null }
        : { programId: id, status: "unknown", reasons: ["관련학과 1년 이상 이수 후 지원할 수 있어요(원문). 지금은 이수 기간이 부족해요.", age], question: null };
    }
    case PROGRAM.armyTech:
      return { programId: id, status: "eligible", reasons: ["전공학과·자격면허 배점으로 선발(점수·합격 가능성은 계산하지 않아요)", age], question: null };
    default:
      return { programId: id, status: "eligible", reasons: ["현역병 입영대상이면 입영일자를 직접 고를 수 있어요(선착순)."], question: null };
  }
}

const cycleLine = (c: RecruitmentCycle | null, name: string) =>
  !c
    ? `${name}: 공고 확인 필요`
    : c.publicationStatus === "official" && c.applicationStart
      ? `${c.label}: 접수 ${c.applicationStart}~${c.applicationEnd}${c.resultDate ? ` · 발표 ${c.resultDate}` : ""}`
      : `${c.label}: ${c.publicationStatus === "expected" ? "예상·확정 아님" : "공식 모집일 미발표"} — ${c.note}`;

export function buildMilitaryStrategies(input: MilitaryPlanningInput, catalog: MilitaryCatalog | undefined, ctx: StrategyContext): MilitaryStrategySet {
  const empty: MilitaryStrategySet = { strategies: [], bestId: null, followUpQuestion: null, catalogVersion: catalog?.catalogVersion ?? null };
  if (input.serviceNeeded === "no" || !catalog) return empty;

  const byId = new Map(catalog.tracks.map((t) => [t.id, t]));
  const general = byId.get(PROGRAM.general);
  const katusa = byId.get(PROGRAM.katusa);
  const branches = input.preferredBranches;
  const wantsAir = branches.includes("air_force");
  const wantsArmy = branches.length === 0 || branches.includes("army");
  const itWanted = input.itRolePriority === "high" || input.itRolePriority === "medium" || (input.itRolePriority === "unknown" && input.goal === "it_experience");
  // IT 모집 분야: 공군만 고르면 공군, 육군(또는 상관없음)이면 육군 기술행정병
  const itProgram = itWanted ? byId.get(wantsAir && !wantsArmy ? PROGRAM.airTech : PROGRAM.armyTech) : undefined;
  const safetyNet = input.generalArmyAcceptedAsFallback !== "no" && general ? general : undefined;
  const katusaOn = !!katusa && (input.katusaPreference === "first_priority" || input.katusaPreference === "consider" || input.goal === "katusa");
  const supplemental = (catalog.supplementalRules ?? []).find((r) => r.programId === itProgram?.id);
  const warnings: string[] = [];
  if (branches.some((b) => b === "navy" || b === "marine")) warnings.push("해군·해병대 모집 자료는 아직 검토하지 않아 전략에 넣지 않았어요. 병무청 공고에서 직접 확인하세요.");
  if (wantsAir && wantsArmy && itWanted) warnings.push("육군 기술행정병과 공군 기술병은 같은 회차면 중복 접수가 가능하다는 원문이 있어요. 회차가 같은지 공고에서 확인하세요.");
  if (input.mustReturnBy) warnings.push("반드시 복학할 학기는 트랙 로드맵에서 분기별로 확인해요.");

  const katusaCycle = katusaOn ? nextCycle(catalog, PROGRAM.katusa, ctx.today) : null;
  const itCycle = itProgram ? nextCycle(catalog, itProgram.id, ctx.today) : null;
  const generalCycle = safetyNet ? nextCycle(catalog, PROGRAM.general, ctx.today) : null;

  const out: MilitaryStrategyCandidate[] = [];
  const months = (t: MilitaryTrackInfo | undefined) => (t && t.serviceMonthsStatus === "verified" ? t.serviceMonths : null);
  const name = (t: MilitaryTrackInfo | undefined) => t?.officialName ?? "군 복무";
  const sourcesOf = (...ts: Array<MilitaryTrackInfo | undefined>) => {
    const s = new Map<string, OfficialSource>();
    for (const t of ts) for (const x of t?.sources ?? []) s.set(x.url, x);
    return [...s.values()];
  };
  const cancelRule = (selected: string, affected: string, cycleId: string | null) =>
    (catalog.selectionRules ?? []).find((r) => r.whenSelectedProgramId === selected && r.affectedProgramId === affected && (r.appliesToCycleIds.length === 0 || (cycleId !== null && r.appliesToCycleIds.includes(cycleId))));

  const app = (id: string, programId: string, order: number, cycle: RecruitmentCycle | null, role: PlannedApplication["role"], note: string): PlannedApplication => ({
    id,
    programId,
    order,
    cycleId: cycle?.id ?? null,
    role,
    note,
  });

  const supplementalAction = supplemental
    ? `${name(itProgram)} 추가모집 공고 확인 — ${supplemental.applicationMethod === "first_come" ? "선착순 접수" : "방식은 공고 확인"}, 원하는 특기가 나온다고 보장하지 않아요.`
    : null;

  const generalBranch = (cancelled: string[]): MilitaryOutcomeBranch | null =>
    safetyNet
      ? {
          id: "none",
          condition: "none_selected",
          title: `모든 지원이 안 되면 → ${name(safetyNet)}`,
          selectedProgramId: safetyNet.id,
          cancelledApplicationIds: cancelled,
          serviceMonths: months(safetyNet),
          label: generalCycle?.publicationStatus === "official" ? "official_schedule" : "check_notice",
          nextActions: [cycleLine(generalCycle, name(safetyNet)), "입영일자 본인선택은 선착순 — 원하는 달이 마감될 수 있어요."],
        }
      : null;

  // ── 1. 카투사 제외 ─────────────────────────────────────
  if (safetyNet && (!itProgram || input.goal === "fast_stable")) {
    out.push(
      finish({
        id: `general-only`,
        scenario: "katusa_excluded",
        title: `${name(safetyNet)}로 바로`,
        summary: "가장 단순한 경로예요. 입영일을 직접 골라 학업 중단 시점을 미리 정해요.",
        applications: [app("a-general", safetyNet.id, 1, generalCycle, "primary", "입영일자 본인선택(선착순)")],
        eligibility: [eligibility(safetyNet, input, ctx)],
        concurrency: null,
        branches: [{ ...generalBranch([])!, id: "general", condition: "none_selected", title: `${name(safetyNet)} 입영` }],
        sources: sourcesOf(safetyNet),
      }),
    );
  }
  if (itProgram) {
    const fb = generalBranch(["a-it"]);
    const cancelGeneral = safetyNet ? cancelRule(itProgram.id, safetyNet.id, itCycle?.id ?? null) : undefined;
    out.push(
      finish({
        id: `it-${itProgram.id}`,
        scenario: "katusa_excluded",
        title: `${name(itProgram)} 도전${safetyNet ? " + 일반 입영 안전장치" : ""}`,
        summary: `전공을 살리는 ${name(itProgram)}에 지원하고, 안 되면 ${safetyNet ? name(safetyNet) : "다음 회차"}로 가요.`,
        applications: [
          app("a-it", itProgram.id, 1, itCycle, "primary", itProgram.id === PROGRAM.armyTech ? "월단위 모집 — 입영월 3개월 전 접수" : "회차별 공고 확인"),
          ...(supplementalAction ? [app("a-supp", itProgram.id, 2, null, "supplemental" as const, supplementalAction)] : []),
          ...(safetyNet ? [app("a-general", safetyNet.id, 3, generalCycle, "safety_net" as const, "입영일자 본인선택")] : []),
        ],
        eligibility: [eligibility(itProgram, input, ctx), ...(safetyNet ? [eligibility(safetyNet, input, ctx)] : [])],
        concurrency: null,
        branches: [
          {
            id: "it",
            condition: "fallback_selected",
            title: `${name(itProgram)} 선발`,
            selectedProgramId: itProgram.id,
            cancelledApplicationIds: cancelGeneral ? ["a-general"] : [],
            serviceMonths: months(itProgram),
            label: "awaiting_result",
            nextActions: [cycleLine(itCycle, name(itProgram)), ...(cancelGeneral ? [`선발되면 ${cancelGeneral.note}`] : [])],
          },
          ...(fb ? [{ ...fb, nextActions: [...(supplementalAction ? [supplementalAction] : []), ...fb.nextActions] }] : []),
        ],
        sources: sourcesOf(itProgram, safetyNet),
      }),
    );
  }

  // ── 2·3. 카투사 우선: 동시지원 / 순차지원 ─────────────
  if (katusaOn && katusa) {
    const other = itProgram ?? safetyNet;
    const rule = other ? concurrencyFor(catalog, PROGRAM.katusa, other.id, katusaCycle?.id ?? null) : null;
    // "*" 대상 조건부 규칙은 접수 시점에 다른 모집병 지원이 있으면 막는다 → 동시지원 불가로 본다
    const relation: ConcurrentApplicationRule["relation"] = !rule ? "unknown" : rule.relation === "conditional" && rule.rightProgramId === "*" ? "forbidden" : rule.relation;
    const concurrency = {
      relation,
      cycleId: katusaCycle?.id ?? null,
      ruleId: rule?.id ?? null,
      note: !katusaCycle
        ? "카투사 다음 회차 정보가 없어요."
        : !rule
          ? `${katusaCycle.label}의 중복지원 규칙은 공고가 나와야 알 수 있어요. 지난 회차 규칙을 그대로 쓰지 않고 허용·불허 두 경우를 모두 보여 드려요.`
          : rule.conditions.join(" "),
    };
    const kElig = eligibility(katusa, input, ctx);
    const katusaSelected = (cancelled: string[]): MilitaryOutcomeBranch => ({
      id: "katusa",
      condition: "katusa_selected",
      title: "카투사 선발",
      selectedProgramId: katusa.id,
      cancelledApplicationIds: cancelled,
      serviceMonths: months(katusa),
      label: "awaiting_result",
      nextActions: [cycleLine(katusaCycle, "카투사"), "선발되면 지원 때 적은 입영희망월에 입영(원문) — 그 일정으로 학업 로드맵을 다시 맞춰요.", ...(months(katusa) === null ? ["카투사 복무기간은 원문에서 확인하지 못했어요 — 공고 확인 필요"] : [])],
    });
    const itBranch = (title: string, actions: string[]): MilitaryOutcomeBranch[] =>
      itProgram
        ? [
            {
              id: "it",
              condition: "fallback_selected",
              title,
              selectedProgramId: itProgram.id,
              cancelledApplicationIds: safetyNet && cancelRule(itProgram.id, safetyNet.id, itCycle?.id ?? null) ? ["a-general"] : [],
              serviceMonths: months(itProgram),
              label: "awaiting_result",
              nextActions: actions,
            },
          ]
        : [];

    if (other) {
      // 동시지원: 같은 시기에 카투사와 다른 모집병을 함께 접수
      const parallelApps = [
        app("a-katusa", katusa.id, 1, katusaCycle, "primary", "카투사 접수(지원은 1회)"),
        app("a-other", other.id, 1, other === itProgram ? itCycle : generalCycle, "parallel_fallback", "카투사와 같은 시기에 접수(허용될 때만)"),
        ...(itProgram && safetyNet ? [app("a-general", safetyNet.id, 2, generalCycle, "safety_net" as const, "입영일자 본인선택")] : []),
      ];
      const notSel = {
        id: "katusa-no",
        condition: "katusa_not_selected" as const,
        title: "카투사 미선발 → 함께 낸 지원 유지",
        selectedProgramId: null,
        cancelledApplicationIds: ["a-katusa"],
        serviceMonths: null,
        label: "awaiting_result" as const,
        nextActions: [`${name(other)} 절차를 계속 진행`],
      };
      out.push(
        finish({
          id: `katusa-parallel-${other.id}`,
          scenario: "katusa_parallel",
          title: `카투사 우선 + ${name(other)} 동시지원`,
          summary: "카투사와 다른 지원을 같은 시기에 내서 공백을 줄여요. 해당 회차에서 동시지원이 허용될 때만 가능해요.",
          applications: parallelApps,
          eligibility: [kElig, eligibility(other, input, ctx), ...(itProgram && safetyNet ? [eligibility(safetyNet, input, ctx)] : [])],
          concurrency,
          branches: [
            katusaSelected(["a-other", ...(itProgram && safetyNet ? ["a-general"] : [])]),
            notSel,
            ...itBranch(`${name(itProgram)} 선발`, [cycleLine(itCycle, name(itProgram))]),
            ...(generalBranch(["a-katusa", "a-other"]) ? [generalBranch(["a-katusa", "a-other"])!] : []),
          ],
          sources: sourcesOf(katusa, other, safetyNet),
        }),
      );
    }

    // 순차지원: 카투사 결과를 본 뒤 다음 회차에 지원
    out.push(
      finish({
        id: `katusa-sequential${itProgram ? `-${itProgram.id}` : ""}`,
        scenario: "katusa_sequential",
        title: `카투사 우선 → 결과 후 ${itProgram ? name(itProgram) : safetyNet ? name(safetyNet) : "다음 회차"}`,
        summary: "카투사 결과가 나올 때까지 다른 모집병 지원을 미뤄요. 동시지원이 막혀 있어도 쓸 수 있지만 입영이 늦어질 수 있어요.",
        applications: [
          app("a-katusa", katusa.id, 1, katusaCycle, "primary", "카투사 접수(지원은 1회) — 접수 시점에 다른 모집병 지원이 없어야 하는 회차가 있어요"),
          ...(itProgram ? [app("a-it", itProgram.id, 2, null, "sequential_fallback" as const, "카투사 발표 뒤 다음 공식 모집회차")] : []),
          ...(supplementalAction ? [app("a-supp", itProgram!.id, 3, null, "supplemental" as const, supplementalAction)] : []),
          ...(safetyNet ? [app("a-general", safetyNet.id, 4, generalCycle, "safety_net" as const, "입영일자 본인선택")] : []),
        ],
        eligibility: [kElig, ...(itProgram ? [eligibility(itProgram, input, ctx)] : []), ...(safetyNet ? [eligibility(safetyNet, input, ctx)] : [])],
        concurrency,
        branches: [
          katusaSelected([]),
          {
            id: "katusa-no",
            condition: "katusa_not_selected",
            title: "카투사 미선발 → 다음 회차 지원",
            selectedProgramId: null,
            cancelledApplicationIds: ["a-katusa"],
            serviceMonths: null,
            label: "check_notice",
            nextActions: [itProgram ? `${name(itProgram)} 다음 공식 모집회차 확인` : "다음 공식 모집회차 확인", ...(supplementalAction ? [supplementalAction] : [])],
          },
          ...itBranch(`${name(itProgram)} 선발(다음 회차)`, [itProgram?.id === PROGRAM.armyTech ? "월단위 모집 — 입영월 3개월 전 접수(예상·확정 아님)" : "회차별 공고 확인"]),
          ...(generalBranch(["a-katusa"]) ? [generalBranch(["a-katusa"])!] : []),
        ],
        sources: sourcesOf(katusa, itProgram, safetyNet),
      }),
    );
  }

  function finish(c: Omit<MilitaryStrategyCandidate, "status" | "metrics" | "reasons" | "warnings">): MilitaryStrategyCandidate {
    const ws = [...warnings];
    let status: MilitaryStrategyCandidate["status"] = "computable";
    const primary = c.applications.find((a) => a.role === "primary");
    const primaryElig = c.eligibility.find((e) => e.programId === primary?.programId);
    if (primaryElig?.status === "ineligible") status = "ineligible";
    else if (c.scenario === "katusa_parallel" && c.concurrency?.relation === "forbidden") {
      status = "conflict";
      ws.push(`이 회차는 동시지원이 막혀 있어요: ${c.concurrency.note}`);
    } else if (
      c.eligibility.some((e) => e.status !== "eligible") ||
      (c.scenario === "katusa_parallel" && c.concurrency?.relation === "unknown") ||
      c.branches.some((b) => b.selectedProgramId && b.serviceMonths === null)
    )
      status = "conditional";
    if (c.concurrency?.relation === "unknown" && c.scenario === "katusa_parallel") ws.push("동시지원 허용 여부가 공고 전이라 확정할 수 없어요. 불허되면 ‘순차지원’ 전략을 쓰세요.");

    const programs = new Set(c.applications.map((a) => a.programId));
    const itMatch = programs.has(PROGRAM.armyTech) || programs.has(PROGRAM.airTech);
    const branchMonths = c.branches.filter((b) => b.selectedProgramId).map((b) => b.serviceMonths);
    const worst = branchMonths.some((m) => m === null) ? null : Math.max(0, ...(branchMonths as number[]));
    const goal = input.goal === "unknown" && input.katusaPreference === "first_priority" ? "katusa" : input.goal;
    const goalMet =
      goal === "unknown" ||
      (goal === "fast_stable" && primary?.programId === PROGRAM.general) ||
      (goal === "it_experience" && itMatch) ||
      (goal === "katusa" && programs.has(PROGRAM.katusa)) ||
      (goal === "return_predictable" && worst !== null);
    const uncertainty =
      c.eligibility.filter((e) => e.status === "unknown").length +
      // 동시지원 전략만 미발표 중복지원 규칙에 기대므로 그 불확실성을 센다(순차지원은 허용·불허와 무관)
      (c.scenario === "katusa_parallel" && c.concurrency?.relation === "unknown" ? 1 : 0) +
      c.branches.filter((b) => b.selectedProgramId && b.serviceMonths === null).length +
      c.branches.filter((b) => b.label === "check_notice").length;
    const hasFallback = c.branches.some((b) => b.condition === "none_selected" && b.selectedProgramId !== null);

    const reasons = [
      goalMet && goal !== "unknown" ? `가장 중요하다고 한 ‘${GOAL_LABEL[goal]}’에 맞아요.` : null,
      hasFallback ? "모든 지원이 안 돼도 일반 입영으로 이어지는 안전장치가 있어요." : null,
      itMatch && itWanted ? "IT 관련 모집 분야를 포함해요." : null,
      worst !== null ? `분기별 복무기간이 모두 공식 확인돼 복학 시점을 계산할 수 있어요(최대 ${worst}개월).` : "일부 분기의 복무기간이 원문에서 확인되지 않아 복학 시점은 조건부예요.",
    ].filter((x): x is string => x !== null);
    return { ...c, status, metrics: { goalMet, hasFallback, itMatch, uncertainty, worstServiceMonths: worst }, reasons, warnings: ws };
  }

  const itPref = input.itRolePriority === "high" || input.itRolePriority === "medium";
  out.sort(
    (a, b) =>
      Number(b.metrics.goalMet) - Number(a.metrics.goalMet) ||
      STATUS_RANK[a.status] - STATUS_RANK[b.status] ||
      // 공고 전 중복지원 규칙에 기대는 동시지원보다, 어느 쪽이든 쓸 수 있는 전략을 먼저
      Number(dependsOnUnknownRule(a)) - Number(dependsOnUnknownRule(b)) ||
      Number(b.metrics.hasFallback) - Number(a.metrics.hasFallback) ||
      (itPref ? Number(b.metrics.itMatch) - Number(a.metrics.itMatch) : 0) ||
      (a.metrics.worstServiceMonths ?? 99) - (b.metrics.worstServiceMonths ?? 99) ||
      a.metrics.uncertainty - b.metrics.uncertainty ||
      a.id.localeCompare(b.id),
  );
  const best = out.find((s) => s.status !== "ineligible" && s.status !== "conflict") ?? null;
  const followUpQuestion = best?.eligibility.find((e) => e.status === "unknown" && e.question)?.question ?? null;
  return { strategies: out, bestId: best?.id ?? null, followUpQuestion, catalogVersion: catalog.catalogVersion };
}

const dependsOnUnknownRule = (s: MilitaryStrategyCandidate) => s.scenario === "katusa_parallel" && s.concurrency?.relation === "unknown";

export const GOAL_LABEL: Record<MilitaryPlanningInput["goal"], string> = {
  fast_stable: "빠르고 안정적인 입대",
  it_experience: "IT·개발 관련 경험",
  katusa: "카투사 우선",
  return_predictable: "학업 복귀 시점 예측",
  unknown: "아직 모름",
};

export const BRANCH_LABEL: Record<MilitaryOutcomeBranch["label"], string> = {
  confirmed: "확정됨",
  official_schedule: "공식 일정 발표됨",
  user_assumption: "사용자 가정",
  awaiting_result: "결과 대기",
  check_notice: "공고 확인 필요",
  not_computable: "계산 불가",
};

/**
 * 실제 선발 결과를 입력한 뒤에만 그 분기를 확정 군 복무 기간으로 바꾼다.
 * 결과 전(awaiting_result·check_notice)이면 null — 조건부 분기를 확정 기간으로 저장하지 않는다.
 */
export function selectBranchPeriod(
  branch: MilitaryOutcomeBranch,
  result: { selected: boolean; enlistmentDate: ISODate | null },
): { startDate: ISODate; durationMonths: number | null; status: "verified" | "unknown" } | null {
  if (!result.selected || !result.enlistmentDate || !branch.selectedProgramId) return null;
  return { startDate: result.enlistmentDate, durationMonths: branch.serviceMonths, status: branch.serviceMonths === null ? "unknown" : "verified" };
}
