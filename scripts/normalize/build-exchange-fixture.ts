/**
 * 2027-1 한양대 파견교 엑셀(서울) 추출 행 → 교환학생 fixture.
 * 입력: data/candidates/hanyang-2027-1-partners-seoul.rows.json (셀 값 그대로)
 * 출력: src/data/fixtures/exchange-2027-1.json
 *
 * 규칙
 * - 셀 값에서 기계적으로 읽을 수 있는 숫자만 숫자로 옮긴다(GPA "3.0/4.0", IELTS "6.5" 등). 문장이면 null + 원문 보존.
 * - "제한 목록에 없음"을 수강 가능으로 바꾸지 않는다(과목 접근은 limited/unknown만).
 * - 기숙사 O는 "신청 가능(보장 아님)", X는 "교내 기숙사 없음"으로만 옮긴다.
 * - 이 회차 자료는 2027-1 전용이다. 다른 회차 offering으로 복제하지 않는다.
 *
 * 실행: npx tsx scripts/normalize/build-exchange-fixture.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import type { ExchangeCatalog, ExchangeEligibilityRule, ExchangeLanguageRequirement, ExchangeSourceRef, HanyangExchangeCycle, PartnerOffering, SourcedValue, TruthState } from "../../src/contracts/types";

const CHECKED = "2026-11-08";
const CYCLE = "hy-2027-1-main";
const raw = JSON.parse(readFileSync("data/candidates/hanyang-2027-1-partners-seoul.rows.json", "utf8")) as {
  _source: { noticeUrl: string; sheet: string };
  rows: Array<Record<string, string | number>>;
};

const NOTICE_URL = raw._source.noticeUrl;
const FILE_BASE = "https://exchangeout.hanyang.ac.kr/documents/portlet_file_entry/70067768/";
const sources: ExchangeSourceRef[] = [
  {
    id: "hy-2027-1-notice",
    title: "[파견교환] 2027학년도 1학기 파견교환학생 모집 안내(파견교 추가 2026.07.09)",
    url: NOTICE_URL,
    evidenceKind: "hanyang_notice",
    publishedAt: "2026-07-03",
    updatedAt: "2026-07-09",
    checkedAt: CHECKED,
    excerptSummary: "서울캠퍼스 대상 본모집 공고. 공고기간 2026-07-03~07-30. 개인 사유 파견 취소 시 이후 국제처 프로그램 참가 제한 안내. 첨부 5종.",
    reviewer: null,
  },
  {
    id: "hy-2027-1-notice-pdf-en",
    title: "1-1. Spring Semester of 2027 Exchange Student Recruitment.pdf",
    url: `${FILE_BASE}1-1.+Spring+Semester+of+2027+Exchange+Student+Recruitment.pdf/a3cbe49f-5fd0-06b9-2f30-0f604903d358?status=0&download=true`,
    evidenceKind: "hanyang_attachment_pdf",
    publishedAt: "2026-07-03",
    updatedAt: null,
    checkedAt: CHECKED,
    fileName: "1-1. Spring Semester of 2027 Exchange Student Recruitment.pdf",
    page: 1,
    excerptSummary:
      "지원자격·선발(서류 종합평가: 누적 GPA·어학, 동점 시 GPA→총 이수학점→어학)·비용(한양대 등록금 납부, 파견교 등록금 면제)·학점 인정(환산 규칙, P/F, 귀국 후 신청 기한). 일부 문장은 글꼴 치환으로 추출돼 해독함 — 사람 재확인 필요.",
    reviewer: null,
  },
  {
    id: "hy-2027-1-schedule",
    title: "[파견교환] 2027학년도 1학기 파견교환학생 모집일정 안내",
    url: "https://exchangeout.hanyang.ac.kr/notice?_kr_ac_hanyang_bbs_web_portlet_BbsPortlet_action=view_message&_kr_ac_hanyang_bbs_web_portlet_BbsPortlet_messageId=203602&p_p_id=kr_ac_hanyang_bbs_web_portlet_BbsPortlet&p_p_lifecycle=0&redirect=%2Fhome",
    evidenceKind: "hanyang_notice",
    publishedAt: "2026-06-26",
    updatedAt: null,
    checkedAt: CHECKED,
    excerptSummary: "일정표는 이미지 첨부로만 제공(본문에 날짜 행 없음). 영미·유럽·기타권과 일본·중국어권 중복 지원 불가, 기간 외 신청 무효.",
    reviewer: null,
  },
];

const val = <T,>(value: T | null, truth: TruthState, refs: string[], note?: string, derivation?: string): SourcedValue<T> => ({
  value,
  truth: value === null && truth !== "unknown" && truth !== "forecast" ? "unknown" : truth,
  sourceRefs: refs,
  validity: { applicationCycleId: CYCLE, exchangeTermId: "2027-1", hostAcademicPeriod: null, effectiveFrom: null, effectiveUntil: null },
  ...(note ? { note } : {}),
  ...(derivation ? { derivation } : {}),
});

const rule = (id: string, kind: ExchangeEligibilityRule["kind"], operator: ExchangeEligibilityRule["operator"], operand: ExchangeEligibilityRule["operand"], text: string, opts: { scale?: number; blocking?: boolean; decoded?: boolean; truth?: TruthState } = {}): ExchangeEligibilityRule => ({
  id,
  owner: "hanyang",
  kind,
  operator,
  operand,
  ...(opts.scale ? { scale: opts.scale } : {}),
  source: val(text, opts.truth ?? "verified_official", ["hy-2027-1-notice-pdf-en"], opts.decoded ? "PDF 글꼴 치환 구간을 해독한 문장 — 원문 PDF에서 사람이 재확인해야 합니다." : undefined),
  blocking: opts.blocking ?? true,
});

const cycle: HanyangExchangeCycle = {
  id: CYCLE,
  label: "2027학년도 1학기 파견교환 본모집(서울)",
  targetHomeTerm: { year: 2027, season: 1 },
  officialStatus: "closed",
  postedAt: val("2026-07-03", "verified_official", ["hy-2027-1-notice"]),
  applicationWindow: val<{ start: string; end: string }>(null, "unknown", ["hy-2027-1-schedule"], "본모집 접수 기간은 일정 이미지와 PDF에만 있어 이번 추출에서 확인하지 못했어요. 공고기간은 2026-07-03~07-30."),
  resultDate: val<string>(null, "unknown", ["hy-2027-1-schedule"]),
  selectionMethod: val("서류 종합평가: 누적 GPA와 어학성적을 평가. 동점이면 GPA → 총 이수학점 → 어학성적 순. 희망 대학은 최대 15개까지 입력.", "verified_official", ["hy-2027-1-notice-pdf-en"], "배점 비율은 이번 추출에서 확인하지 못했어요."),
  commonEligibilityRules: [
    rule("hy-campus", "campus", "eq", "seoul", "서울캠퍼스 재학생 또는 휴학생으로 해외유학에 결격사유가 없는 자"),
    rule("hy-terms-min", "completed_terms_min", "gte", 2, "지원 시점에 2개 학기 이상 이수", { decoded: true }),
    rule("hy-terms-max", "completed_terms_max", "lte", 6, "2026년 1학기까지 6개 학기 이하 이수(건축학부 8개 학기). 6개 학기(건축 8)를 마친 경우 2026년 2학기 휴학 필수·한 학기만 지원", { decoded: true }),
    rule("hy-gpa", "gpa_min", "gte", 2.5, "누적 평균평점 2.5 이상(4.5 만점). 편입생은 전 대학·본교 평점 모두 2.5 이상", { scale: 4.5 }),
    rule("hy-prior", "prior_exchange", "lte", 1, "파견교환 이력이 없거나 기존 파견이 한 학기인 자(단과대 주관 프로그램 포함 총 1년까지)"),
    rule("hy-consecutive", "consecutive_exchange", "custom", null, "한 학기 파견에 지원해 합격한 자는 연속된 다음 학기에 지원 불가"),
    rule("hy-final-term", "final_regular_term", "custom", null, "마지막 정규학기에는 파견 불가"),
    rule("hy-transfer", "transfer_terms", "gte", 1, "편입생은 본교에서 1개 학기 이상 이수"),
    rule("hy-major", "major_restriction", "not_in", ["double_degree"], "다중전공·부전공 이수자는 지원 가능, 복수전공(복수학위) 이수자는 지원 불가", { decoded: true }),
    rule("hy-language", "language", "custom", null, "한양대 최소 어학 기준(권역별 표)과 파견교 기준을 모두 충족. 어학성적은 파견 시작일 기준 2년 이내, 영국 1년 파견은 IELTS(Academic)만 인정", { decoded: true }),
  ],
  cancellationRules: val(["파견대학 배정 후 상대교가 프로그램을 취소하면 다음 모집에 재지원 가능", "그 밖의 취소(개인 사유, 온라인 옵션 등)는 이후 국제처 프로그램 참여 불가", "지원 기간 이후 대학·기간 변경 불가"], "verified_official", ["hy-2027-1-notice", "hy-2027-1-notice-pdf-en"]),
  tuition: val("한양대 등록금 납부, 파견교 등록금 면제. 주거·생활비 등은 본인 부담", "verified_official", ["hy-2027-1-notice-pdf-en"]),
  creditRecognition: val(
    [
      "파견 중 취득 학점은 소속 학과 심의 후 전공 또는 교양으로 인정(학기당 상한 있음 — 원문 PDF 확인)",
      "본교 기이수·유사 과목은 인정 불가",
      "환산: 유럽 ECTS × 0.5(반올림), 쿼터·트라이메스터 학점 × 0.5(반올림), 그 밖의 대학 1학점 = 한양대 1학점(과목별 계산)",
      "성적표에는 PASS/FAIL로 표기되고 평점 계산에서 제외",
      "귀국 후 다음 학기 말까지 인정 절차 진행(봄 파견 2월 말, 가을 파견 8월 말)",
    ],
    "verified_official",
    ["hy-2027-1-notice-pdf-en"],
    "환산 규칙은 안내용이에요. 이번 버전은 인정학점을 계산하지 않고 미정으로 둬요(PLAN 10장).",
  ),
  sourceRefs: ["hy-2027-1-notice", "hy-2027-1-notice-pdf-en", "hy-2027-1-schedule"],
};

const next: HanyangExchangeCycle = {
  id: "hy-2027-2-forecast",
  label: "2027학년도 2학기 파견교환 모집(공고 전)",
  targetHomeTerm: { year: 2027, season: 2 },
  officialStatus: "forecast",
  postedAt: { ...val<string>(null, "unknown", []), validity: { ...val(null, "unknown", []).validity, applicationCycleId: "hy-2027-2-forecast", exchangeTermId: "2027-2" } },
  applicationWindow: { ...val<{ start: string; end: string }>(null, "unknown", [], "공식 공고 전 — 국제처 파견교환 공지에서 확인 필요"), validity: { ...val(null, "unknown", []).validity, applicationCycleId: "hy-2027-2-forecast", exchangeTermId: "2027-2" } },
  resultDate: val<string>(null, "unknown", []),
  selectionMethod: val<string>(null, "unknown", [], "공고 전"),
  commonEligibilityRules: [],
  cancellationRules: val<string[]>(null, "unknown", []),
  tuition: val<string>(null, "unknown", []),
  creditRecognition: val<string[]>(null, "unknown", []),
  sourceRefs: [],
};

// ── offering ────────────────────────────────────────────
const s = (v: unknown) => String(v ?? "").trim();
const isoDate = (v: unknown): string | null => {
  const t = s(v);
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  const m = t.match(/^(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})/);
  return m ? `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}` : null;
};
const slug = (name: string) =>
  name
    .toLowerCase()
    .replace(/\(.*?\)/g, "")
    .replace(/^the /, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);

function gpaOf(t: string): { min: number; scale: number } | null {
  if (/recommend/i.test(t)) return null; // 권장값은 최소 기준이 아니다
  const m = t.match(/(\d(?:\.\d+)?)\s*(?:GPA\s*minimum\s*)?(?:\/|out of)\s*(\d(?:\.\d+)?)/i);
  return m ? { min: Number(m[1]), scale: Number(m[2]) } : null;
}
const firstNum = (t: string, lo: number, hi: number) => {
  for (const m of t.matchAll(/\d+(?:\.\d+)?/g)) {
    const n = Number(m[0]);
    if (n >= lo && n <= hi) return n;
  }
  return null;
};
const SUB = /(minimum .* in|no band|each|component|sub-?score|Listening|Speaking|Writing|Reading)/i;
function languageOf(r: Record<string, unknown>): ExchangeLanguageRequirement[] {
  const out: ExchangeLanguageRequirement[] = [];
  const t120 = s(r.toefl120);
  const t6 = s(r.toefl6);
  const ielts = s(r.ielts);
  const na = (t: string) => !t || /^(n\/?a|na|-|none)$/i.test(t);
  if (!na(t120)) out.push({ test: "TOEFL_IBT", scaleVersion: "120점 만점(2026-01 이전 체계)", total: /^https?:/.test(t120) ? null : firstNum(t120, 60, 120), subscoresRequired: SUB.test(t120) ? true : null, raw: t120 });
  if (!na(t6) && t6 !== t120) out.push({ test: "TOEFL_IBT_2026", scaleVersion: "6점 만점(2026-01 이후 체계)", total: /^https?:/.test(t6) ? null : firstNum(t6, 1, 6), subscoresRequired: SUB.test(t6) ? true : null, raw: t6 });
  if (!na(ielts)) out.push({ test: "IELTS_ACADEMIC", scaleVersion: "9.0 만점", total: /^https?:/.test(ielts) ? null : firstNum(ielts, 4, 9), subscoresRequired: SUB.test(ielts) ? true : null, raw: ielts });
  return out;
}

/** 엑셀의 수강불가 학과 원문 → 정보시스템·컴퓨터 계열 접근(서비스 분석). "없음"을 수강 가능으로 바꾸지 않는다 */
function courseAccessOf(closed: string, id: string): PartnerOffering["courseAccess"] {
  const computing = /(comput|ccds|\bcomp\b|informat|course codes beginning with S)/i;
  let access: "limited" | "unknown" = "unknown";
  const conditions: string[] = [];
  if (/^https?:/.test(closed)) conditions.push("수강 제한 목록이 링크로만 제공돼요 — 링크에서 컴퓨터·정보시스템 과목이 있는지 확인이 필요해요.");
  else if (/only have Computer Sciences/i.test(closed)) conditions.push("파견교가 컴퓨터과학 학과만 운영한다고 적었어요. 교환학생에게 열린 실제 과목은 따로 확인해야 해요.");
  else if (computing.test(closed)) {
    access = "limited";
    conditions.push("수강불가 학과·과목에 컴퓨팅 계열이 들어 있어요(엑셀 원문). 정보시스템 전공 과목 수강이 제한될 수 있어요.");
  } else conditions.push("엑셀의 수강불가 목록에 컴퓨터 계열이 없지만, 그것만으로 수강 가능을 확정하지 않아요. 최신 교환학생 과목 목록 확인이 필요해요.");
  return [
    {
      id: `${id}-cs-access`,
      scope: "department",
      target: "컴퓨터·정보시스템 계열",
      access,
      appliesTo: "2027-1(파견교 엑셀 기준)",
      effectiveTerm: "2027-1",
      conditions,
      source: { ...val(closed || null, "service_analysis", []), derivation: "엑셀 '수강불가 학과' 셀 원문을 키워드로 분류한 서비스 분석" },
    },
  ];
}

const offerings: PartnerOffering[] = raw.rows.map((r) => {
  const row = Number(r.row);
  const id = `hy-2027-1-${slug(s(r.name))}`;
  const refId = `hy-2027-1-xlsx-r${row}`;
  sources.push({
    id: refId,
    title: `2027-1 파견교 정보 엑셀(서울) — ${s(r.name)}`,
    url: `${FILE_BASE}2.+2027-1%ED%95%99%EA%B8%B0+%ED%8C%8C%EA%B2%AC%EA%B5%90+%EC%A0%95%EB%B3%B4_%EB%B3%B8%EB%AA%A8%EC%A7%91%28%EA%B3%B5%EC%A7%80%EC%9A%A9%29_%EC%84%9C%EC%9A%B8_2026.07.09_%EC%B6%94%EA%B0%80.xlsx/1c57cfe8-27ac-dd71-d8f8-4a148c5c4cf5?status=0&download=true`,
    evidenceKind: "hanyang_partner_xlsx",
    publishedAt: "2026-07-09",
    updatedAt: null,
    checkedAt: CHECKED,
    fileName: "2. 2027-1학기 파견교 정보_본모집(공지용)_서울_2026.07.09_추가.xlsx",
    sheet: raw._source.sheet,
    cellRange: `A${row}:AG${row}`,
    excerptSummary: `${s(r.name)} 행(순번 ${s(r.no)}) — TO·학제·지원자격·수업·기숙사·일정`,
    reviewer: null,
  });
  const refs = [refId];
  const v = <T,>(value: T | null, note?: string, truth: TruthState = "verified_official") => val(value, truth, refs, note);
  const gpaRaw = s(r.gpa);
  const gpa = gpaOf(gpaRaw);
  const dur = s(r.duration);
  const start = isoDate(r.start);
  const end = isoDate(r.end);
  const nat = s(r.nationality);
  const onCampus = s(r.onCampus).toUpperCase();
  const quota = Number(s(r.quota));
  return {
    id,
    universityName: s(r.name),
    country: s(r.country),
    region: s(r.region),
    applicationCycleId: CYCLE,
    hostAcademicPeriod: "2027 Spring",
    academicSystem: v(s(r.system) || null),
    durationOptions: v<Array<"one_term" | "one_year">>(dur.includes("1년") ? ["one_term", "one_year"] : dur.includes("1학기") ? ["one_term"] : null, s(r.durationNote) || undefined),
    quota: v(Number.isFinite(quota) && s(r.quota) !== "" ? quota : null, "배정 TO(서울). 정원 정보이며 합격 가능성이 아니에요."),
    gpa: v(gpa, gpa ? undefined : /한양대 선발 기준/.test(gpaRaw) ? "파견교 별도 GPA 기준 없이 한양대 선발 기준을 따름(엑셀 원문)" : "숫자 기준으로 읽을 수 없는 원문 — 원문 확인 필요"),
    gpaRaw,
    language: languageOf(r),
    nationalityRestriction: v(nat && nat !== "없음" ? (nat === "자국민지원불가" ? "파견교 국가 국적자는 지원 불가" : nat) : null, nat === "없음" ? "국적 제한 없음(엑셀)" : undefined),
    closedDepartments: v(s(r.closedDepts) || null),
    courseAccess: courseAccessOf(s(r.closedDepts), id),
    creditLoad: v(s(r.minCredits) || s(r.maxCredits) ? { min: s(r.minCredits), max: s(r.maxCredits) } : null),
    housing: {
      onCampus: onCampus === "O" ? "available_not_guaranteed" : onCampus === "X" ? "unavailable" : "unknown",
      source: v(s(r.onCampus) || null, "엑셀 On-campus 표기. O는 교내 기숙사 신청 가능 여부이며 배정 보장이 아니에요."),
    },
    calendar: v(start && end ? { start, end } : null, "파견교 2027 Spring 개강·종강(엑셀)"),
    deadlines: { nomination: v(isoDate(r.nominationDeadline), "한양대가 파견교에 추천(노미네이션)하는 마감"), application: v(isoDate(r.applicationDeadline), "학생이 파견교에 직접 지원하는 마감") },
    links: { exchange: /^https?:/.test(s(r.site)) ? s(r.site) : null, courses: /^https?:/.test(s(r.courseLink)) ? s(r.courseLink) : null },
    notes: [s(r.durationNote), s(r.otherReq), s(r.courseNote)].filter((x) => x && !/^https?:/.test(x)),
    sourceRefs: refs,
    reviewStatus: "candidate",
  };
});

sources.push({
  id: "hy-2027-1-xlsx-gpa",
  title: "2027-1 파견교 정보 엑셀(서울) — 평균평점(GPA) 변환 시트",
  url: sources.find((x) => x.evidenceKind === "hanyang_partner_xlsx")!.url,
  evidenceKind: "hanyang_partner_xlsx",
  publishedAt: "2026-07-09",
  updatedAt: null,
  checkedAt: CHECKED,
  fileName: "2. 2027-1학기 파견교 정보_본모집(공지용)_서울_2026.07.09_추가.xlsx",
  sheet: "평균평점(GPA) 변환",
  cellRange: "C5:C7",
  excerptSummary: "4.5 만점 성적을 4.3·4.0·100점 만점으로 비례 변환하는 수식(C5=(C4*4.3)/4.5, C6=(C4*4)/4.5, C7=(C4*100)/4.5). 5.0 만점 변환은 없음.",
  reviewer: null,
});
const gpaConversions = {
  ...val(
    [
      { scale: 4.3, formula: "gpa45 * 4.3 / 4.5" },
      { scale: 4.0, formula: "gpa45 * 4 / 4.5" },
      { scale: 100, formula: "gpa45 * 100 / 4.5" },
    ],
    "verified_official",
    ["hy-2027-1-xlsx-gpa"],
    "한양대 엑셀의 변환기 수식이에요. 파견교가 이 변환을 그대로 쓰는지는 확인되지 않았어요. 5.0 만점 변환은 없어요.",
  ),
};
const catalog: ExchangeCatalog = { catalogVersion: "exchange-hy-2027-1-2026-11-08", reviewedAt: CHECKED, sources, cycles: [cycle, next], offerings, gpaConversions };
writeFileSync("src/data/fixtures/exchange-2027-1.json", JSON.stringify(catalog, null, 2) + "\n");
console.log(`offerings ${offerings.length}, sources ${sources.length}`);
