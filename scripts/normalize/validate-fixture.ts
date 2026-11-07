import { fileURLToPath } from "node:url";
import type { DatasetV2 } from "../../src/contracts/types";
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
