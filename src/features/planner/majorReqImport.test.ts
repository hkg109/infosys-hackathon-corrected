import { describe, expect, it } from "vitest";
import { fixtureDataset } from "@/data/fixtures";
import { blankDraft, draftToInputV2 } from "./plan";
import { applyTranscriptImport, parseTranscriptRows, rowsFromVision, type SourceRow } from "./transcriptImport";

const rows = (lines: string[][]): SourceRow[] => lines.map((cells, index) => ({ index, cells, raw: cells.join("\t") }));

describe("졸업사정 전공 요건 가져오기", () => {
  it("스크린샷 인식 요약의 전공 요건(기준)과 400단위 취득을 후보로 읽고, 전공 취득학점과 섞지 않는다", () => {
    const vr = rowsFromVision([
      {
        rows: [],
        summary: { earnedCredits: null, majorCredits: null, targetCredits: 130, majorRequiredCredits: 81, majorLowerRequiredCredits: 69, majorUpperRequiredCredits: 12, majorUpperEarnedCredits: 3 },
        unreadable: false,
      },
    ]);
    const d = parseTranscriptRows(vr, fixtureDataset.courses, "image_ai");
    expect(d.majorRequired.map((v) => v.value)).toEqual([81]);
    expect(d.majorLowerRequired.map((v) => v.value)).toEqual([69]);
    expect(d.majorUpperRequired.map((v) => v.value)).toEqual([12]);
    expect(d.majorUpperEarned.map((v) => v.value)).toEqual([3]);
    expect(d.earnedMajorCredits).toEqual([]);
    expect(d.targetCredits.map((v) => v.value)).toEqual([130]);
  });

  it("배당·취득 열이 있는 표에서는 열 이름으로 나눠 읽는다", () => {
    const d = parseTranscriptRows(rows([["구분", "배당", "취득"], ["졸업학점", "130", "40"], ["전공 100~300단위", "69", "21"], ["전공 400단위", "12", "3"]]), fixtureDataset.courses, "clipboard_text");
    expect(d.majorLowerRequired.map((v) => v.value)).toEqual([69]);
    expect(d.majorUpperRequired.map((v) => v.value)).toEqual([12]);
    expect(d.majorUpperEarned.map((v) => v.value)).toEqual([3]);
  });

  it("반영하면 개인 졸업사정 값으로 저장되고 엔진 입력으로 넘어간다", () => {
    const cur = { earnedCredits: 40, earnedMajorCredits: 20, targetCredits: 130, completedCourseCodes: [] };
    const next = applyTranscriptImport(cur, { earnedCredits: null, earnedMajorCredits: null, targetCredits: null, majorRequired: 81, majorLowerRequired: 69, majorUpperRequired: 12, earnedUpperMajorCredits: 3, completedCodes: [], mode: "merge" });
    expect(next.majorRequirement).toEqual({ major: 81, lower: 69, upper: 12, source: "graduation_check" });
    const draft = { ...blankDraft("2026-11-08"), ...next };
    const v2 = draftToInputV2(draft, fixtureDataset, ["finance"]);
    expect(v2.majorRequirement).toEqual({ majorCredits: 81, lowerLevelCredits: 69, upperLevelCredits: 12, source: "graduation_check" });
    expect(v2.progress.earnedUpperMajorCredits).toBe(3);
  });
});
