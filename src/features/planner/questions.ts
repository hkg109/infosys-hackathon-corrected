import { INPUT_STEPS, type StepId } from "./inputSteps";
import { exPrefsOf, wantsExchange } from "./exchangePrefs";
import { katusaOn, prefsOf } from "./militaryPrefs";
import { type Draft, MIN_ANSWERS, needsMilitary } from "./plan";
import { answeredCount } from "./recommend";

/** 지금 답에 따라 보이는 질문(조건부 질문은 필요할 때만) */
export function visibleSteps(d: Draft): StepId[] {
  return INPUT_STEPS.map((s) => s.id).filter((id) => {
    switch (id) {
      case "credits":
      case "major":
      case "courses":
        return d.progressMode === "manual";
      case "quiz":
        return d.career === "unsure";
      case "military-branch":
      case "military-goal":
      case "katusa":
        return needsMilitary(d);
      case "katusa-evidence":
        return needsMilitary(d) && katusaOn(prefsOf(d));
      case "exchange-when":
      case "exchange-length":
      case "exchange-goal":
      case "exchange-language":
      case "exchange-life":
        return wantsExchange(d);
      default:
        return true;
    }
  });
}

/** 다음으로 넘어가기 전에 막을 문제. 없으면 null. 선택 질문(이름·입학연도·목표학점)은 비워도 된다. */
export function stepProblem(step: StepId, d: Draft): string | null {
  switch (step) {
    case "completed":
      return d.completedTerms === null ? "마친 학기 수를 골라 주세요." : null;
    case "transcript":
      if (d.progressMode === "manual") return null;
      if (d.earnedCredits === null || d.earnedMajorCredits === null)
        return d.progressMode === "import" && d.completedCourseCodes.length > 0
          ? "과목은 가져왔어요. 총·전공 이수학점만 적어 주세요."
          : "성적표를 가져와 총·전공 학점을 확인하거나 ‘직접 수정하기’를 골라 주세요.";
      if (d.earnedCredits < 0 || d.earnedMajorCredits < 0) return "학점은 0 이상이어야 해요.";
      return d.earnedMajorCredits > d.earnedCredits ? "전공학점은 총 이수학점 안에 포함돼요. 총학점보다 클 수 없어요." : null;
    case "start":
      return d.startTerm === null ? "시작 학기를 골라 주세요." : null;
    case "credits":
      if (d.earnedCredits === null) return "총 이수학점을 적어 주세요. 신입생이면 0이에요.";
      return d.earnedCredits < 0 ? "학점은 0 이상이어야 해요." : null;
    case "major":
      if (d.earnedMajorCredits === null) return "전공학점을 적어 주세요. 없으면 0이에요.";
      if (d.earnedMajorCredits < 0) return "학점은 0 이상이어야 해요.";
      if (d.earnedCredits !== null && d.earnedMajorCredits > d.earnedCredits)
        return "전공학점은 총 이수학점 안에 포함돼요. 총학점보다 클 수 없어요.";
      return null;
    case "target":
      return d.targetCredits !== null && d.targetCredits <= 0 ? "목표학점은 0보다 커야 해요." : null;
    case "career":
      return d.career === null ? "관심 진로를 고르거나 ‘잘 모르겠어요’를 눌러 주세요." : null;
    case "quiz":
      return answeredCount(d.answers) < MIN_ANSWERS ? `질문에 ${MIN_ANSWERS}개 이상 답해 주세요.` : null;
    case "pace":
      return d.paceCredits === null ? "학기당 학점을 골라 주세요." : null;
    case "late":
      if (d.paceStyle === null) return "학점 배치 방식을 골라 주세요.";
      if (d.paceStyle === "custom") {
        const c = d.customPace;
        if (!c) return "학년별 학점을 적어 주세요.";
        if ([c.early, c.year3, c.year4].some((n) => !Number.isInteger(n) || n < 1 || n > 30)) return "학기당 학점은 1~30 사이로 적어 주세요.";
      }
      return null;
    case "military":
      return d.military.status === null ? "군 복무 상황을 골라 주세요." : null;
    case "military-branch":
      return prefsOf(d).branch === null ? "선호하는 군을 고르거나 ‘상관없음’을 눌러 주세요." : null;
    case "military-goal":
      if (prefsOf(d).goal === null) return "가장 중요한 것을 하나 골라 주세요. 모르면 ‘아직 모름’도 괜찮아요.";
      return d.military.timing === "fixed" && !d.military.startDate ? "이미 정해진 입영일을 적거나 ‘정해진 입영일’을 꺼 주세요." : null;
    case "katusa":
      return prefsOf(d).katusa === null ? "카투사 생각을 골라 주세요." : null;
    case "leave":
      if (d.leave.mode === null) return "휴학 계획을 골라 주세요.";
      return d.leave.mode === "pick" && d.leave.ordinal === null ? "휴학할 시점을 골라 주세요." : null;
    case "exchange":
      return exPrefsOf(d).intent === null && d.exchange.mode === null ? "교환학생 생각을 골라 주세요." : null;
    case "exchange-when": {
      const p = exPrefsOf(d);
      if (p.when === null) return "가고 싶은 시기를 고르거나 ‘아직 모르겠어요’를 눌러 주세요.";
      return p.when === "fixed" && !p.fixedTerm ? "학기를 하나 골라 주세요." : null;
    }
    case "exchange-length":
      return exPrefsOf(d).duration === null ? "기간을 골라 주세요." : null;
    case "exchange-goal":
      return exPrefsOf(d).priorities.length === 0 ? "가장 중요한 것을 하나 이상(최대 2개) 골라 주세요." : null;
    case "exchange-language": {
      const p = exPrefsOf(d);
      if (p.languageStatus === null) return "어학 준비 상태를 골라 주세요.";
      if (p.gpa !== null && (p.gpa < 0 || p.gpa > 4.5)) return "누적 평점은 0~4.5 사이로 적어 주세요.";
      return null;
    }
    case "exchange-life": {
      const p = exPrefsOf(d);
      return p.budget === null || p.housing === null ? "예산과 주거를 하나씩 골라 주세요(모르면 ‘아직 모르겠어요’)." : null;
    }
    case "priority":
      return d.priority === null ? "가장 중요한 것을 하나 골라 주세요." : null;
    default:
      return null;
  }
}

/** 질문에 답했는지(진행률·목차 체크용) */
export function stepAnswered(step: StepId, d: Draft): boolean {
  switch (step) {
    case "name":
      return d.name !== "";
    case "admission":
      return d.admissionYear !== null;
    case "courses":
      return d.coursesConfirmed || d.completedCourseCodes.length > 0;
    case "target":
      return d.targetCredits !== null;
    case "review":
      return false;
    case "katusa-evidence":
      return prefsOf(d).english !== null;
    default:
      return stepProblem(step, d) === null;
  }
}
