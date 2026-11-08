import { CAREER_LABEL } from "@/contracts/careers";
import type { BreakPeriod, DatasetV2, PlannedTerm, PlanResult } from "@/contracts/types";
import { courseLevel, formatTerm, isCapExempt, isMajorCourse, termBreakdown, termIndex } from "@/engine";
import type { ExchangeChoice } from "../plan";
import { militarySummary } from "../plan";
import type { PlanState } from "../storage";
import { breakName } from "./Roadmap";

/**
 * 인쇄·PDF 전용 "최종 학기별 수강 계획표"(docs/prompts/ah-matda-print-pdf-fix-prompt.md).
 * 화면에서는 숨기고 인쇄에서만 보인다. 화면이 계산한 결과만 읽어 다시 그린다(새로 계산하지 않는다).
 * 교양은 과목을 나열하지 않고 학기별 학점만 보여 준다.
 * 단색·불투명만 쓴다(혼합 모드·반투명·그라디언트·그림자 없음 — Safari 인쇄에서 검게 찍히는 원인). 스타일: globals.css `.print-doc`.
 */

interface TermRow {
  t: PlannedTerm;
  key: string;
  label: string;
  study: boolean;
  breakLabel: string | null;
  majorNames: string[];
  majorCourses: number;
  majorSlot: number;
  upperSlot: number;
  lower: number;
  upper: number;
  general: number;
  total: number;
  cumulative: number;
  completion: boolean;
}

const short = (ordinal: number) => `${Math.floor(ordinal / 2) + 1}-${(ordinal % 2) + 1}`;

export function PrintPlan({
  plan,
  result,
  dataset,
  guidance,
  checked,
  name,
  today,
  exchangePending,
  exchangeChoice,
  warnings,
}: {
  plan: PlanState;
  result: PlanResult;
  dataset: DatasetV2;
  guidance: Array<{ id: string; title: string; detail: string }>;
  checked: Record<string, boolean>;
  name: string | undefined;
  today: string;
  exchangePending: boolean;
  exchangeChoice: ExchangeChoice | null | undefined;
  warnings: string[];
}) {
  const { input } = plan;
  const mil = militarySummary(input, result);
  const completionIdx = result.expectedCompletion ? termIndex(result.expectedCompletion) : null;
  const course = (code: string) => dataset.courses.find((c) => c.code === code);

  // ── 학기별 행(엔진 결과 그대로 나눠 담기) ──
  let ordinal = input.completedTerms;
  let cumulative = input.earnedCredits;
  const rows: TermRow[] = result.terms.map((t) => {
    const idx = termIndex(t.term);
    if (t.status !== "study")
      return {
        t,
        key: `${idx}`,
        label: `${t.term.year}-${t.term.season}`,
        study: false,
        breakLabel: breakName(t, input.breaks as BreakPeriod[], plan.exchange),
        majorNames: [],
        majorCourses: 0,
        majorSlot: 0,
        upperSlot: 0,
        lower: 0,
        upper: 0,
        general: 0,
        total: 0,
        cumulative,
        completion: false,
      };
    const b = termBreakdown(t, plan.genEd, dataset);
    const majors = t.courses.filter((c) => isMajorCourse(course(c.code)));
    const upperSlot = t.upperMajorSlotCredits ?? 0;
    const lower = majors.filter((c) => courseLevel(c.code) !== "upper").reduce((a, c) => a + c.credits, 0) + (b.majorSlot - upperSlot);
    const upper = majors.filter((c) => courseLevel(c.code) === "upper").reduce((a, c) => a + c.credits, 0) + upperSlot;
    cumulative += t.plannedCredits;
    const label = `${short(ordinal)} (${t.term.year})`;
    ordinal++;
    return {
      t,
      key: `${idx}`,
      label,
      study: true,
      breakLabel: null,
      majorNames: majors.map((c) => `${c.name}${c.assumptions.length > 0 ? "*" : ""}`),
      majorCourses: majors.reduce((a, c) => a + c.credits, 0),
      majorSlot: b.majorSlot,
      upperSlot,
      lower,
      upper,
      general: t.plannedCredits - majors.reduce((a, c) => a + c.credits, 0) - b.majorSlot,
      total: t.plannedCredits,
      cumulative,
      completion: idx === completionIdx,
    };
  });
  const study = rows.filter((r) => r.study);
  const plannedTotal = study.reduce((a, r) => a + r.total, 0);
  const plannedMajor = study.reduce((a, r) => a + r.lower + r.upper, 0);
  const plannedGeneral = study.reduce((a, r) => a + r.general, 0);
  const finalTotal = input.earnedCredits + plannedTotal;
  const finalMajor = input.earnedMajorCredits + plannedMajor;
  const hasAssumed = result.terms.some((t) => t.courses.some((c) => c.assumptions.length > 0));

  // ── 졸업 요건(개인 졸업사정 값이 있을 때만 숫자로) ──
  const mp = result.majorProgress ?? null;
  const target = input.targetCredits;
  type Req = { label: string; need: number | null; plan: number; strong?: boolean };
  const reqs: Req[] = [
    ...(mp?.required.lower != null ? [{ label: "전공 100~300단위", need: mp.required.lower, plan: mp.earned.lower + mp.planned.lower + mp.extra.lower }] : []),
    ...(mp?.required.upper != null ? [{ label: "전공 400단위", need: mp.required.upper, plan: mp.earned.upper + mp.planned.upper + mp.extra.upper }] : []),
    { label: "전공학점 합계", need: mp?.required.major ?? null, plan: finalMajor, strong: true },
    { label: "총 졸업학점", need: target, plan: finalTotal, strong: true },
  ];
  const verdict = (r: Req) => (r.need === null ? { text: "기준 확인 필요", tone: "pd-unknown" } : r.plan >= r.need ? { text: r.plan > r.need ? `충족(${r.plan - r.need}학점 초과)` : "충족", tone: "pd-ok" } : { text: `${r.need - r.plan}학점 부족`, tone: "pd-bad" });
  const totalOk = target !== null && finalTotal >= target;

  const completion = exchangePending ? "교환 인정학점 확인 후" : result.expectedCompletion ? formatTerm(result.expectedCompletion) : target === null ? "목표학점 필요" : "확인 필요";
  const status = plan.confirmedAt ? `${plan.confirmedAt} 확정` : "확정 전 초안";

  // ── 학년·연도 계획 ──
  const yearItems: Array<{ k: string; v: string; at: number }> = [];
  for (const r of study) {
    const grade = `${r.label.split("-")[0]}학년`;
    if (!yearItems.some((y) => y.k === grade)) yearItems.push({ k: grade, v: `${r.t.term.year}년`, at: termIndex(r.t.term) });
  }
  if (mil) {
    yearItems.push({ k: "입대", v: formatTerm(mil.first), at: termIndex(mil.first) - 0.5 });
    yearItems.push({ k: "복학", v: mil.back ? formatTerm(mil.back) : "계획 범위 밖", at: mil.back ? termIndex(mil.back) - 0.5 : 9e9 });
  }
  if (plan.exchange && exchangeChoice) yearItems.push({ k: "교환", v: formatTerm(exchangeChoice.term), at: termIndex(exchangeChoice.term) - 0.5 });
  yearItems.sort((a, b) => a.at - b.at);
  const yearBox: Array<[string, string]> = [...yearItems.map((y): [string, string] => [y.k, y.v]), ["완료", completion]];

  const overCap = study.filter((r) => r.t.capCredits !== undefined && r.total > (r.t.capCredits ?? 99));
  const heavy = study.filter((r) => r.total >= 20);
  const review = [
    mp ? (mp.met ? `전공: ${finalMajor}학점으로 입력한 전공 요건을 계획상 충족해요.` : `전공: ${finalMajor}학점 — 입력한 전공 요건 중 부족한 항목이 있어요(③ 참고).`) : `전공: 이수 ${input.earnedMajorCredits} + 계획 ${plannedMajor} = ${finalMajor}학점. 전공 요건(졸업사정)을 입력하지 않아 충족 여부는 확인 필요예요.`,
    `교양·기타: 계획 ${plannedGeneral}학점(과목은 수강신청 때 직접 선택).`,
    target === null ? "졸업학점: 목표 총학점을 입력하지 않아 충족 여부를 계산하지 않았어요." : totalOk ? `졸업학점: ${finalTotal}학점으로 ${target}학점 기준을 충족해요${finalTotal > target ? `(${finalTotal - target}학점 초과)` : ""}.` : `졸업학점: ${finalTotal}학점 — ${target}학점 기준까지 ${target - finalTotal}학점 부족해요.`,
    heavy.length > 0 ? `주의: ${heavy.map((r) => r.label.split(" ")[0]).join(", ")}는 ${heavy.map((r) => r.total).join("·")}학점이라 최대 신청 가능 학점을 확인하세요.` : overCap.length > 0 ? "주의: 학기 상한을 넘는 학기가 있어요." : null,
    plan.exchange ? `교환학생: ${exchangeChoice ? `${exchangeChoice.universityName}(${formatTerm(exchangeChoice.term)}) · ` : ""}학점 인정은 귀국 후 학과 심의로 정해져 완료 학기는 확정하지 않았어요.` : null,
    plan.military ? `군 복무: ${plan.military.label}${mil ? ` · ${formatTerm(mil.first)} 입대` : " · 일정 미정"}${plan.military.monthsStatus === "verified" ? "" : " · 복무기간 확인 필요"}.` : null,
    "이수구분·필수 교양 요건은 포털 졸업사정에서 최종 확인이 필요해요.",
  ].filter((x): x is string => !!x);

  const firstStudy = study[0];
  const lastStudy = study[study.length - 1];
  const summary3 = [
    firstStudy && lastStudy ? `${formatTerm(firstStudy.t.term)}부터 ${formatTerm(lastStudy.t.term)}까지 ${study.length}개 학기를 다니며, 예상 계획 완료는 ${completion}예요.` : "계획할 학기가 없어요.",
    `최종 계획은 전공 ${finalMajor}학점 + 교양·기타 ${finalTotal - finalMajor}학점 = ${finalTotal}학점이에요(이미 이수한 ${input.earnedCredits}학점 포함).`,
    target === null ? "목표 졸업학점이 없어 충족 여부는 확인이 필요해요. 이수구분과 필수 요건 확인이 남았어요." : totalOk ? `졸업 총학점 기준(${target}학점)을 충족하며, 이수구분과 필수 요건 확인이 남았어요.` : `졸업 총학점 기준(${target}학점)까지 ${target - finalTotal}학점이 더 필요해요.`,
  ];

  return (
    <article className="print-doc" aria-hidden>
      {/* 머리 */}
      <header className="pd-top">
        <div className="pd-title">
          <h1>최종 학기별 수강 계획표</h1>
          <p className="pd-pill">
            {dataset.department} · {CAREER_LABEL[input.track]} · {name ? `${name}님` : "내 계획"}
          </p>
          <p className="pd-track">{plan.trackTitle}</p>
          <p className="pd-meta">
            {dataset.curriculum} 교육과정 · {status} · 생성 {today} · 계획·추정 결과이며 졸업 판정이 아니에요
          </p>
        </div>
        <table className="pd-yearbox">
          <thead>
            <tr>
              <th colSpan={2}>학년·연도 계획</th>
            </tr>
          </thead>
          <tbody>
            {yearBox.map(([k, v]) => (
              <tr key={k}>
                <th>{k}</th>
                <td>{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </header>

      {/* ① 학기별 수강 계획 */}
      <section className="pd-sec">
        <h2>
          <span className="pd-no">1</span> 학기별 수강 계획
        </h2>
        <table className="pd-grid pd-plan">
          <colgroup>
            <col style={{ width: "13%" }} />
            <col style={{ width: "11%" }} />
            <col />
            <col style={{ width: "8%" }} />
            <col style={{ width: "9%" }} />
          </colgroup>
          <thead>
            <tr>
              <th>학기</th>
              <th>구분</th>
              <th>과목</th>
              <th>학점</th>
              <th>총학점</th>
            </tr>
          </thead>
          {rows.map((r) => {
            if (!r.study)
              return (
                <tbody key={r.key} className="pd-term pd-off">
                  <tr>
                    <td className="pd-sem">{r.label}</td>
                    <td colSpan={4} className="pd-offlabel">
                      {r.breakLabel} — 쉬는 학기
                    </td>
                  </tr>
                </tbody>
              );
            const lines: Array<{ kind: string; text: string; credits: number }> = [];
            if (r.majorNames.length > 0) lines.push({ kind: "전공", text: r.majorNames.join(", "), credits: r.majorCourses });
            if (r.majorSlot > 0) lines.push({ kind: "전공 선택", text: `전공 선택 과목${r.upperSlot > 0 ? ` (400단위 ${r.upperSlot}학점 포함)` : ""} — 수강신청 때 고르기`, credits: r.majorSlot });
            const exempt = r.t.courses.filter((c) => isCapExempt(c.code));
            if (r.general > 0)
              lines.push({
                kind: "교양·선택",
                text: `교양·선택 과목 — 수강신청 때 고르기${exempt.length > 0 ? ` (${exempt.map((c) => `${c.name.split(":")[0]} ${c.credits}`).join(", ")} 포함 · 상한 제외)` : ""}`,
                credits: r.general,
              });
            if (lines.length === 0) lines.push({ kind: "—", text: "배치할 과목 없음", credits: 0 });
            return (
              <tbody key={r.key} className={`pd-term${r.completion ? " pd-final" : ""}`}>
                {lines.map((l, i) => (
                  <tr key={i}>
                    {i === 0 && (
                      <td rowSpan={lines.length} className="pd-sem">
                        {r.label}
                        {r.completion && <span className="pd-flag">계획 완료</span>}
                      </td>
                    )}
                    <td className="pd-kind">{l.kind}</td>
                    <td>{l.text}</td>
                    <td className="pd-num">{l.credits}</td>
                    {i === 0 && (
                      <td rowSpan={lines.length} className="pd-num pd-total">
                        {r.total}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            );
          })}
        </table>
        {hasAssumed && <p className="pd-foot-note">* 개설 시기를 가정해 배치한 과목이에요.</p>}
        {result.unplaced.length > 0 && <p className="pd-foot-note">아직 못 넣은 과목: {result.unplaced.map((u) => `${u.name}(${u.reason})`).join(", ")}</p>}
      </section>

      <div className="pd-two">
        {/* ② 학기별 학점 요약 */}
        <section className="pd-sec pd-half">
          <h2>
            <span className="pd-no">2</span> 학기별 학점 요약
          </h2>
          <table className="pd-grid pd-sum">
            <thead>
              <tr>
                <th>학기</th>
                <th>전공 100~300</th>
                <th>전공 400</th>
                <th>교양·기타</th>
                <th>총학점</th>
                <th>누적 학점</th>
              </tr>
            </thead>
            <tbody>
              <tr className="pd-muted">
                <td>이수 완료</td>
                <td colSpan={3} className="pd-c">
                  전공 {input.earnedMajorCredits}학점 포함
                </td>
                <td className="pd-num">{input.earnedCredits}</td>
                <td className="pd-num">{input.earnedCredits}</td>
              </tr>
              {study.map((r) => (
                <tr key={r.key} className={r.completion ? "pd-final-row" : ""}>
                  <td>{r.label}</td>
                  <td className="pd-num">{r.lower}</td>
                  <td className="pd-num">{r.upper}</td>
                  <td className="pd-num">{r.general}</td>
                  <td className="pd-num">{r.total}</td>
                  <td className="pd-num">{r.cumulative}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th>계획 합계</th>
                <th className="pd-num">{study.reduce((a, r) => a + r.lower, 0)}</th>
                <th className="pd-num">{study.reduce((a, r) => a + r.upper, 0)}</th>
                <th className="pd-num">{plannedGeneral}</th>
                <th className="pd-num">{plannedTotal}</th>
                <th className="pd-num">{finalTotal}</th>
              </tr>
            </tfoot>
          </table>
          <p className="pd-foot-note">전공 단위는 학수번호 첫 숫자로 판단했어요(1~3 → 100~300, 4 → 400).</p>
        </section>

        {/* ③ 졸업 요건 충족 여부 */}
        <section className="pd-sec pd-half">
          <h2>
            <span className="pd-no">3</span> 졸업 요건 충족 여부
          </h2>
          <div className={`pd-big ${target === null ? "pd-big-unknown" : totalOk ? "pd-big-ok" : "pd-big-bad"}`}>
            <span className="pd-mark">{target === null ? "?" : totalOk ? "✓" : "!"}</span>
            <span>
              <b className="pd-bignum">
                {finalTotal} / {target ?? "—"}
              </b>{" "}
              학점
              <span className="pd-bigsub">
                전공 {finalMajor}학점 · 교양·기타 {finalTotal - finalMajor}학점
              </span>
            </span>
          </div>
          <table className="pd-grid pd-req">
            <thead>
              <tr>
                <th>졸업 요건</th>
                <th>기준</th>
                <th>계획</th>
                <th>결과</th>
              </tr>
            </thead>
            <tbody>
              {reqs.map((r) => {
                const v = verdict(r);
                return (
                  <tr key={r.label}>
                    <td className={r.strong ? "pd-b" : ""}>{r.label}</td>
                    <td className="pd-num">{r.need ?? "—"}</td>
                    <td className="pd-num">{r.plan}</td>
                    <td className={`pd-c ${v.tone}`}>{v.text}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="pd-foot-note">기준은 개인 졸업사정·내 목표 입력값이에요. 비어 있으면 학교 기준을 만들지 않고 ‘확인 필요’로 둬요.</p>
        </section>
      </div>

      {/* ④ 최종 검토 */}
      <section className="pd-sec pd-box-sec">
        <h2>
          <span className="pd-no">4</span> 최종 검토
        </h2>
        <ul className="pd-bullets">
          {review.map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ul>
        {warnings.length > 0 && (
          <p className="pd-foot-note">
            가정·확인 필요 {warnings.length}건: {warnings.slice(0, 4).join(" / ")}
            {warnings.length > 4 ? " …" : ""}
          </p>
        )}
      </section>

      {/* 준비할 것 */}
      {guidance.length > 0 && (
        <section className="pd-sec">
          <h2>준비할 것</h2>
          <ul className="pd-checks">
            {guidance.map((g) => (
              <li key={g.id}>
                <span className="pd-boxmark">{checked[g.id] ? "☑" : "☐"}</span> <b>{g.title}</b> — {g.detail}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* 3줄 요약 */}
      <section className="pd-sec pd-box-sec pd-three">
        <h2>3줄 요약</h2>
        <ol>
          {summary3.map((x, i) => (
            <li key={i}>
              <span className="pd-no pd-no-s">{i + 1}</span> {x}
            </li>
          ))}
        </ol>
      </section>

      <footer className="pd-foot">공식 합격·학점 인정·졸업을 보장하지 않아요. 과목 정보: 학과 교육과정표(S1). 진로·트랙 분류와 추천은 서비스 기준이에요.</footer>
    </article>
  );
}
