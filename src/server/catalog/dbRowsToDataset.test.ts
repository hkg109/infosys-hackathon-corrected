import { describe, expect, it } from "vitest";
import { dbRowsToDataset, type CatalogDbRows } from "./dbRowsToDataset";

const rows: CatalogDbRows = {
  version: {
    version: "test-v1",
    campus: "서울",
    department: "정보시스템학과",
    curriculum: "2024-2027",
    collected_at: "2026-11-01",
    published_at: "2026-11-02T03:00:00.000Z",
    unknowns: ["졸업요건"],
  },
  courses: [
    {
      course_code: "ITE1001",
      name: "테스트 과목",
      credits: "3.0",
      recommended_year: 1,
      semester: 1,
      offering_end_year: null,
      category: null,
      prerequisites: ["CSE1000"],
      prerequisite_status: "verified",
      source_id: "source-1",
    },
  ],
  careerTags: [{ course_code: "ITE1001", group: "common", reason: "공통 기초" }],
  rules: [
    {
      rule_key: "graduation.totalCredits",
      value: "unknown",
      status: "unknown",
      source_id: null,
      note: "확인 전",
    },
  ],
  sources: [
    {
      id: "source-1",
      title: "테스트 출처",
      url: "https://example.com/catalog",
      kind: "public_page",
    },
  ],
};

describe("dbRowsToDataset", () => {
  it("DB 행 이름과 값을 Dataset 계약으로 변환한다", () => {
    expect(dbRowsToDataset(rows)).toEqual({
      catalogVersion: "test-v1",
      campus: "서울",
      department: "정보시스템학과",
      curriculum: "2024-2027",
      collectedAt: "2026-11-01",
      publishedAt: "2026-11-02T03:00:00.000Z",
      unknowns: ["졸업요건"],
      courses: [
        {
          code: "ITE1001",
          name: "테스트 과목",
          credits: 3,
          recommendedYear: 1,
          semester: 1,
          offeringEndYear: null,
          category: null,
          prerequisites: ["CSE1000"],
          prerequisiteStatus: "verified",
          sourceId: "source-1",
        },
      ],
      careerTags: [{ courseCode: "ITE1001", group: "common", reason: "공통 기초" }],
      rules: [
        {
          key: "graduation.totalCredits",
          value: "unknown",
          status: "unknown",
          sourceId: null,
          note: "확인 전",
        },
      ],
      sources: [
        {
          id: "source-1",
          title: "테스트 출처",
          url: "https://example.com/catalog",
          kind: "public_page",
          checkedAt: "2026-11-01",
        },
      ],
    });
  });

  it("nullable JSON 배열은 빈 배열로 정규화하고 입력을 변경하지 않는다", () => {
    const nullableRows: CatalogDbRows = {
      ...rows,
      version: { ...rows.version, unknowns: null },
      courses: [{ ...rows.courses[0], prerequisites: null }],
    };

    const dataset = dbRowsToDataset(nullableRows);

    expect(dataset.unknowns).toEqual([]);
    expect(dataset.courses[0].prerequisites).toEqual([]);
    expect(nullableRows.version.unknowns).toBeNull();
    expect(nullableRows.courses[0].prerequisites).toBeNull();
  });
});
