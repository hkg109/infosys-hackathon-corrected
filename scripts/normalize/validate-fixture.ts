import { fileURLToPath } from "node:url";
import type { Dataset } from "../../src/contracts/types";
import { fixtureDataset } from "../../src/data/fixtures";

export function validateFixture(dataset: Dataset): string[] {
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
