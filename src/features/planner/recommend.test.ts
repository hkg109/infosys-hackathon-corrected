import { describe, expect, it } from "vitest";
import { fixtureDataset } from "@/data/fixtures";
import { answeredCount, QUIZ, recommendCareers } from "./recommend";

const pick = (optionIndex: number) => Object.fromEntries(QUIZ.map((q) => [q.id, q.options[optionIndex].id]));

describe("recommendCareers", () => {
  it("모든 답이 한 방향이면 그 진로가 1순위", () => {
    expect(recommendCareers(pick(2))[0].track).toBe("security");
    expect(recommendCareers(pick(1))[0].track).toBe("data");
    expect(recommendCareers(pick(4))[0].track).toBe("business");
  });

  it("같은 답이면 같은 결과, 답이 없으면 고정 순서", () => {
    expect(recommendCareers(pick(0))).toEqual(recommendCareers(pick(0)));
    expect(recommendCareers({}).map((m) => m.track)).toEqual(["software", "data", "security", "consulting", "business"]);
  });

  it("이미 들은 진로 과목은 점수와 근거에 더한다", () => {
    const base = recommendCareers({}, [], fixtureDataset);
    const withWeb = recommendCareers({}, ["ITE2020", "ITE2021"], fixtureDataset);
    const sw = (ms: typeof base) => ms.find((m) => m.track === "software")!;
    expect(sw(withWeb).score).toBeGreaterThan(sw(base).score);
    expect(sw(withWeb).reasons[0]).toContain("웹시스템프로그래밍1");
  });

  it("답한 질문 수를 센다(없는 선택지는 세지 않음)", () => {
    expect(answeredCount({ project: "app", team: "nope" })).toBe(1);
  });
});
