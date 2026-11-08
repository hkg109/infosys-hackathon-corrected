import { fileURLToPath } from "node:url";
import type { DatasetV2, MilitaryCatalog } from "../../src/contracts/types";
import { fixtureDataset } from "../../src/data/fixtures";
import { CAREER_TRACKS } from "../../src/contracts/careers";

export function validateFixture(dataset: DatasetV2): string[] {
  const errors: string[] = [];
  const courseCodes = new Set<string>();
  const duplicateCourseCodes = new Set<string>();

  for (const course of dataset.courses) {
    if (courseCodes.has(course.code)) duplicateCourseCodes.add(course.code);
    courseCodes.add(course.code);
  }

  for (const code of duplicateCourseCodes) {
    errors.push(`중복 과목 코드: ${code}`);
  }

  const sourceIds = new Set(dataset.sources.map((source) => source.id));

  for (const tag of dataset.careerTags) {
    if (!courseCodes.has(tag.courseCode)) {
      errors.push(`존재하지 않는 과목을 가리키는 careerTag: ${tag.courseCode}`);
    }
  }

  for (const course of dataset.courses) {
    if (!sourceIds.has(course.sourceId)) {
      errors.push(`과목 ${course.code}의 sourceId가 존재하지 않음: ${course.sourceId}`);
    }
  }

  for (const rule of dataset.rules) {
    if (rule.sourceId !== null && !sourceIds.has(rule.sourceId)) {
      errors.push(`학사 규칙 ${rule.key}의 sourceId가 존재하지 않음: ${rule.sourceId}`);
    }
  }

  if (!dataset.recommendation) {
    errors.push("진로 추천 설정이 존재하지 않음");
  } else {
    const tracks = new Set<string>();
    for (const career of dataset.recommendation.careers) {
      if (tracks.has(career.track)) errors.push(`중복 진로 추천 설정: ${career.track}`);
      tracks.add(career.track);
      for (const core of career.coreCourses) {
        if (!courseCodes.has(core.courseCode)) {
          errors.push(`진로 ${career.track}의 핵심 과목이 존재하지 않음: ${core.courseCode}`);
        }
        if (core.reason.trim().length === 0) {
          errors.push(`진로 ${career.track}의 핵심 과목 추천 이유가 비어 있음: ${core.courseCode}`);
        }
      }
    }
    for (const track of CAREER_TRACKS) {
      if (!tracks.has(track)) errors.push(`진로 추천 설정 누락: ${track}`);
    }
  }

  for (const rule of dataset.creditCapRules ?? []) {
    if (!sourceIds.has(rule.sourceRef.sourceId)) errors.push(`상한 규칙 ${rule.id}의 sourceId가 존재하지 않음: ${rule.sourceRef.sourceId}`);
    if (rule.status === "verified" && rule.sourceRef.pages.length === 0) errors.push(`확인된 상한 규칙 ${rule.id}에 원문 쪽수가 없음`);
  }

  if (dataset.military) errors.push(...validateMilitary(dataset.military));
  return errors;
}

const isDate = (s: string | null | undefined) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);

/**
 * 군 복무 트랙·자격증 검토 자료 검사.
 * - 중복 ID, 존재하지 않는 트랙·자격증 참조 금지
 * - verified에는 확인일, 공식 관계에는 출처 URL·적용연도 필요
 * - 점수가 없는 관계를 0점으로 저장하지 않음
 * - 복무기간을 verified로 두려면 출처가 있어야 함
 */
export function validateMilitary(m: MilitaryCatalog): string[] {
  const errors: string[] = [];
  const dup = (kind: string, ids: string[]) => {
    const seen = new Set<string>();
    for (const id of ids) {
      if (seen.has(id)) errors.push(`중복 ${kind} ID: ${id}`);
      seen.add(id);
    }
    return seen;
  };
  const trackIds = dup("군 트랙", m.tracks.map((t) => t.id));
  const certIds = dup("자격증", m.certificates.map((c) => c.id));

  for (const t of m.tracks) {
    if (t.status === "verified" && !isDate(t.checkedAt)) errors.push(`군 트랙 ${t.id}: verified인데 확인일이 없음`);
    if (t.status === "verified" && t.sources.length === 0) errors.push(`군 트랙 ${t.id}: verified인데 공식 출처가 없음`);
    for (const s of t.sources) {
      if (!/^https:\/\//.test(s.url)) errors.push(`군 트랙 ${t.id}: 출처 URL 형식 오류 ${s.url}`);
      if (!isDate(s.checkedAt)) errors.push(`군 트랙 ${t.id}: 출처 확인일 형식 오류`);
    }
    if (t.serviceMonths === null && t.serviceMonthsStatus === "verified") errors.push(`군 트랙 ${t.id}: 복무기간이 없는데 verified`);
    if (t.serviceMonths !== null && t.serviceMonthsStatus === "verified" && t.sources.length === 0)
      errors.push(`군 트랙 ${t.id}: 복무기간 verified인데 출처가 없음`);
  }

  for (const c of m.certificates) {
    if (c.status === "verified" && (!isDate(c.checkedAt) || !c.officialUrl)) errors.push(`자격증 ${c.id}: verified인데 확인일 또는 공식 페이지가 없음`);
    for (const a of c.aliases)
      if (a.status === "verified" && !a.sourceUrl) errors.push(`자격증 ${c.id}: 별칭 ${a.name}을 verified로 두려면 출처가 필요`);
  }

  for (const r of m.relations) {
    const at = `관계 ${r.militaryTrackId}↔${r.certificateId}`;
    if (!trackIds.has(r.militaryTrackId)) errors.push(`${at}: 존재하지 않는 군 트랙`);
    if (!certIds.has(r.certificateId)) errors.push(`${at}: 존재하지 않는 자격증`);
    if (!/^https:\/\//.test(r.sourceUrl)) errors.push(`${at}: 공식 인정 관계에 출처 URL이 없음`);
    if (r.status === "verified" && !isDate(r.checkedAt)) errors.push(`${at}: verified인데 확인일이 없음`);
    if ((r.relation === "score" || r.relation === "eligibility") && !r.appliesTo) errors.push(`${at}: 적용 모집연도·회차가 없음`);
    if (r.points === 0 && r.relation === "score" && !/0점/.test(r.criterion)) errors.push(`${at}: 점수 미확인을 0점으로 저장한 것으로 보임`);
  }

  for (const s of m.scoringRules) {
    if (!trackIds.has(s.militaryTrackId)) errors.push(`배점 기준 ${s.id}: 존재하지 않는 군 트랙`);
    if (s.status === "verified" && !isDate(s.source.checkedAt)) errors.push(`배점 기준 ${s.id}: verified인데 확인일이 없음`);
    if (!s.appliesTo) errors.push(`배점 기준 ${s.id}: 적용 범위가 없음`);
  }

  // 모집회차·중복지원·선발 처리·추가모집: 공고가 없는 회차에 날짜를 만들지 않고, 회차를 정하지 않은 중복지원 규칙을 두지 않는다
  const cycleIds = new Set((m.recruitmentCycles ?? []).map((c) => c.id));
  const okUrl = (u: string) => /^https:\/\//.test(u);
  for (const c of m.recruitmentCycles ?? []) {
    const at = `모집회차 ${c.id}`;
    if (!trackIds.has(c.programId)) errors.push(`${at}: 존재하지 않는 군 트랙`);
    const dates = [c.applicationStart, c.applicationEnd, c.resultDate, c.enlistment];
    if (c.publicationStatus === "unknown" && dates.some((d) => d !== null)) errors.push(`${at}: 공고 미발표 회차에 날짜가 있음`);
    if (c.publicationStatus === "official" && (!c.source || !okUrl(c.source.url) || !isDate(c.source.checkedAt))) errors.push(`${at}: 공식 회차에 출처·확인일이 없음`);
    if (c.publicationStatus === "expected" && !c.note) errors.push(`${at}: 예상 회차에 근거 설명이 없음`);
    for (const d of dates) if (d !== null && !isDate(d)) errors.push(`${at}: 날짜 형식 오류 ${d}`);
  }
  for (const r of m.concurrentRules ?? []) {
    const at = `중복지원 규칙 ${r.id}`;
    if (!trackIds.has(r.leftProgramId) || (r.rightProgramId !== "*" && !trackIds.has(r.rightProgramId))) errors.push(`${at}: 존재하지 않는 군 트랙`);
    if (r.appliesToCycleIds.length === 0) errors.push(`${at}: 적용 회차가 없음(다른 연도에 일반화 금지)`);
    for (const id of r.appliesToCycleIds) if (!cycleIds.has(id)) errors.push(`${at}: 없는 회차 ${id}`);
    if (!okUrl(r.source.url) || !isDate(r.source.checkedAt)) errors.push(`${at}: 출처·확인일 없음`);
  }
  for (const r of m.selectionRules ?? []) {
    const at = `선발 처리 규칙 ${r.id}`;
    if (!trackIds.has(r.whenSelectedProgramId) || !trackIds.has(r.affectedProgramId)) errors.push(`${at}: 존재하지 않는 군 트랙`);
    for (const id of r.appliesToCycleIds) if (!cycleIds.has(id)) errors.push(`${at}: 없는 회차 ${id}`);
    if (!okUrl(r.source.url)) errors.push(`${at}: 출처 없음`);
  }
  for (const r of m.supplementalRules ?? []) {
    const at = `추가모집 규칙 ${r.id}`;
    if (!trackIds.has(r.programId)) errors.push(`${at}: 존재하지 않는 군 트랙`);
    if (r.guaranteeSpecificProgram !== false) errors.push(`${at}: 특정 특기를 보장하면 안 됨`);
    if (!okUrl(r.source.url)) errors.push(`${at}: 출처 없음`);
  }

  for (const r of m.careerCertificates) {
    if (!CAREER_TRACKS.includes(r.career)) errors.push(`진로 자격증 추천: 알 수 없는 진로 ${r.career}`);
    if (!certIds.has(r.certificateId)) errors.push(`진로 자격증 추천: 존재하지 않는 자격증 ${r.certificateId}`);
  }
  return errors;
}

function main() {
  const errors = validateFixture(fixtureDataset);
  if (errors.length === 0) {
    console.log("fixture 검사 통과");
    return;
  }

  console.error(`fixture 검사 실패 (${errors.length}건)`);
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
