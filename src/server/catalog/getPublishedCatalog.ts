import type { CatalogContext, CatalogResponse, Dataset, VerifyStatus } from "@/contracts/types";
import { fixtureDataset } from "@/data/fixtures";
import { getReadClient } from "./supabase";

export const DEFAULT_CONTEXT: CatalogContext = {
  campus: "서울",
  department: "정보시스템학과",
  curriculum: "2024-2027",
};

const now = () => new Date().toISOString();

/**
 * 자료 출처는 CATALOG_SOURCE로 명시적으로 고른다.
 * - fixture: 개발용 검토 자료(기본값)
 * - supabase: 게시된 DB 버전. 실패해도 fixture로 몰래 대체하지 않는다.
 */
export async function getPublishedCatalog(context: CatalogContext = DEFAULT_CONTEXT): Promise<CatalogResponse> {
  const source = process.env.CATALOG_SOURCE ?? "fixture";

  if (source === "fixture") {
    return {
      status: "ready",
      dataset: fixtureDataset,
      origin: "fixture",
      fetchedAt: now(),
      warnings: ["개발용 fixture 자료입니다. DB 게시본이 아닙니다."],
    };
  }

  const db = getReadClient();
  if (!db) {
    return { status: "unavailable", dataset: null, origin: null, fetchedAt: now(), warnings: ["DB 연결 정보가 없습니다."] };
  }

  try {
    const dataset = await loadFromDb(db, context);
    if (!dataset)
      return { status: "empty", dataset: null, origin: "db", fetchedAt: now(), warnings: ["게시된 자료 버전이 없습니다."] };
    return { status: "ready", dataset, origin: "db", fetchedAt: now(), warnings: [] };
  } catch (e) {
    console.error("[catalog] DB 조회 실패", e);
    return { status: "unavailable", dataset: null, origin: null, fetchedAt: now(), warnings: ["DB 조회에 실패했습니다."] };
  }
}

async function loadFromDb(db: NonNullable<ReturnType<typeof getReadClient>>, ctx: CatalogContext): Promise<Dataset | null> {
  const { data: version, error } = await db
    .from("catalog_versions")
    .select("*")
    .eq("campus", ctx.campus)
    .eq("department", ctx.department)
    .eq("curriculum", ctx.curriculum)
    .eq("status", "published")
    .maybeSingle();
  if (error) throw error;
  if (!version) return null;

  const [courses, tags, rules, sources] = await Promise.all([
    db.from("courses").select("*").eq("catalog_version_id", version.id),
    db.from("career_tags").select("*").eq("catalog_version_id", version.id),
    db.from("academic_rules").select("*").eq("catalog_version_id", version.id),
    db.from("data_sources").select("*"),
  ]);
  for (const r of [courses, tags, rules, sources]) if (r.error) throw r.error;

  return {
    catalogVersion: version.version,
    campus: version.campus,
    department: version.department,
    curriculum: version.curriculum,
    collectedAt: version.collected_at,
    publishedAt: version.published_at,
    unknowns: version.unknowns ?? [],
    courses: (courses.data ?? []).map((c) => ({
      code: c.course_code,
      name: c.name,
      credits: Number(c.credits),
      recommendedYear: c.recommended_year,
      semester: c.semester,
      offeringEndYear: c.offering_end_year,
      category: c.category,
      prerequisites: c.prerequisites ?? [],
      prerequisiteStatus: c.prerequisite_status as VerifyStatus,
      sourceId: c.source_id,
    })),
    careerTags: (tags.data ?? []).map((t) => ({ courseCode: t.course_code, group: t.group, reason: t.reason })),
    rules: (rules.data ?? []).map((r) => ({
      key: r.rule_key,
      value: r.value,
      status: r.status,
      sourceId: r.source_id,
      note: r.note,
    })),
    sources: (sources.data ?? []).map((s) => ({
      id: s.id,
      title: s.title,
      url: s.url,
      kind: s.kind,
      checkedAt: version.collected_at,
    })),
  };
}
