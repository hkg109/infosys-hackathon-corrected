import type { Dataset, VerifyStatus } from "@/contracts/types";

export interface CatalogVersionRow {
  version: string;
  campus: string;
  department: string;
  curriculum: string;
  collected_at: string;
  published_at: string | null;
  unknowns: string[] | null;
}

export interface CourseRow {
  course_code: string;
  name: string;
  credits: number | string;
  recommended_year: number | null;
  semester: 0 | 1 | 2 | null;
  offering_end_year: number | null;
  category: string | null;
  prerequisites: string[] | null;
  prerequisite_status: VerifyStatus;
  source_id: string;
}

export interface CareerTagRow {
  course_code: string;
  group: "common" | "security" | "data";
  reason: string;
}

export interface AcademicRuleRow {
  rule_key: string;
  value: string | number;
  status: VerifyStatus;
  source_id: string | null;
  note: string;
}

export interface DataSourceRow {
  id: string;
  title: string;
  url: string;
  kind: "api" | "public_page" | "manual";
}

export interface CatalogDbRows {
  version: CatalogVersionRow;
  courses: CourseRow[];
  careerTags: CareerTagRow[];
  rules: AcademicRuleRow[];
  sources: DataSourceRow[];
}

/** Supabase 조회 결과를 공통 계약으로 바꾸는 순수 변환 함수. */
export function dbRowsToDataset(rows: CatalogDbRows): Dataset {
  const { version } = rows;

  return {
    catalogVersion: version.version,
    campus: version.campus,
    department: version.department,
    curriculum: version.curriculum,
    collectedAt: version.collected_at,
    publishedAt: version.published_at,
    unknowns: version.unknowns ?? [],
    courses: rows.courses.map((course) => ({
      code: course.course_code,
      name: course.name,
      credits: Number(course.credits),
      recommendedYear: course.recommended_year,
      semester: course.semester,
      offeringEndYear: course.offering_end_year,
      category: course.category,
      prerequisites: course.prerequisites ?? [],
      prerequisiteStatus: course.prerequisite_status,
      sourceId: course.source_id,
    })),
    careerTags: rows.careerTags.map((tag) => ({
      courseCode: tag.course_code,
      group: tag.group,
      reason: tag.reason,
    })),
    rules: rows.rules.map((rule) => ({
      key: rule.rule_key,
      value: rule.value,
      status: rule.status,
      sourceId: rule.source_id,
      note: rule.note,
    })),
    sources: rows.sources.map((source) => ({
      id: source.id,
      title: source.title,
      url: source.url,
      kind: source.kind,
      checkedAt: version.collected_at,
    })),
  };
}
