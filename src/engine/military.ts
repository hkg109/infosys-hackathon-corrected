import type {
  CertificateInfo,
  ConfirmStatus,
  KatusaStatus,
  MilitaryCatalog,
  MilitaryCertificateRelation,
  MilitaryPlanInput,
  MilitaryScenario,
  MilitaryScenarioResolution,
  MilitaryTrackInfo,
} from "@/contracts/types";

/** 카투사 트랙 ID(검토 자료와 같은 값) */
export const KATUSA_TRACK_ID = "katusa";
/** 카투사 결과 대기·미정일 때 대체 트랙이 없으면 쓰는 기본 대체 트랙 */
export const DEFAULT_FALLBACK_TRACK_ID = "army-general";

export const KATUSA_STATUS_LABEL: Record<KatusaStatus, string> = {
  not_applying: "지원하지 않음",
  preparing: "지원 준비 중",
  applied_waiting: "지원 완료·결과 대기",
  selected: "선발됨",
  not_selected: "선발되지 않음",
  undecided: "아직 결정하지 않음",
};

/** 결과가 확정되지 않은 카투사 상태 → 조건부 + 대체 시나리오 */
const PENDING: KatusaStatus[] = ["preparing", "applied_waiting", "undecided"];

/**
 * 복무기간: 공식 확인값(verified) > 사용자 예상값(user_assumption) > null(기간 확인 필요).
 * 조사 메모의 기간을 기본값으로 채우지 않는다.
 */
export function scenarioMonths(
  track: MilitaryTrackInfo | null,
  userMonths: number | null,
): { months: number | null; status: ConfirmStatus } {
  if (track && track.serviceMonths !== null && track.serviceMonthsStatus === "verified")
    return { months: track.serviceMonths, status: "verified" };
  if (userMonths !== null) return { months: userMonths, status: "user_assumption" };
  return { months: null, status: "unknown" };
}

function scenario(
  track: MilitaryTrackInfo | null,
  role: MilitaryScenario["role"],
  userMonths: number | null,
): MilitaryScenario {
  const name = track?.officialName ?? "군 복무";
  const label =
    role === "conditional"
      ? `${name} 선발 시(조건부)`
      : role === "fallback"
        ? `카투사 미선발 시 · ${name}`
        : name;
  const m = scenarioMonths(track, userMonths);
  return { trackId: track?.id ?? null, role, label, months: m.months, monthsStatus: m.status };
}

/**
 * 군 복무 트랙과 카투사 우선 희망을 후보로 펼칠 시나리오로 바꾼다.
 * - 우선 희망 꺼짐: 고른 트랙을 그대로 비교(카투사 상태는 순위·일정에 영향 없음)
 * - 우선 + 선발됨: 카투사만 기본 계획에 쓰고 나머지는 대안
 * - 우선 + 준비·대기·미정: "카투사 선발 시" 조건부 + "선발되지 않을 경우" 대체 트랙(합격을 가정해 하나로 확정하지 않는다)
 * - 우선 + 선발되지 않음·지원 안 함: 카투사를 빼고 나머지로 비교
 * 합격 가능성은 계산하지 않는다.
 */
export function resolveMilitaryScenarios(
  plan: MilitaryPlanInput | null | undefined,
  catalog: MilitaryCatalog | undefined,
  userMonths: number | null,
): MilitaryScenarioResolution {
  const byId = new Map((catalog?.tracks ?? []).map((t) => [t.id, t]));
  const picked = (plan?.trackIds ?? []).filter((id) => byId.has(id));
  const tracks = picked.map((id) => byId.get(id)!);
  const generic = (): MilitaryScenario[] => [scenario(null, "normal", userMonths)];

  if (!plan || !plan.katusaPriority) {
    return {
      scenarios: tracks.length > 0 ? tracks.map((t) => scenario(t, "normal", userMonths)) : generic(),
      excluded: [],
      alternatives: [],
    };
  }

  const katusa = byId.get(KATUSA_TRACK_ID) ?? null;
  const others = tracks.filter((t) => t.id !== KATUSA_TRACK_ID);
  const status = plan.katusaStatus;

  if (!katusa)
    return {
      scenarios: others.length > 0 ? others.map((t) => scenario(t, "normal", userMonths)) : generic(),
      excluded: [{ trackId: KATUSA_TRACK_ID, reason: "카투사 검토 자료가 없어 비교에서 뺐습니다." }],
      alternatives: [],
    };

  if (status === "selected")
    return { scenarios: [scenario(katusa, "primary", userMonths)], excluded: [], alternatives: others.map((t) => t.id) };

  if (status === "not_selected" || status === "not_applying")
    return {
      scenarios: others.length > 0 ? others.map((t) => scenario(t, "normal", userMonths)) : generic(),
      excluded: [
        {
          trackId: KATUSA_TRACK_ID,
          reason:
            status === "not_selected"
              ? "카투사에 선발되지 않았다고 해서 기본 후보에서 뺐습니다."
              : "카투사에 지원하지 않는다고 해서 기본 후보에서 뺐습니다.",
        },
      ],
      alternatives: [],
    };

  if (PENDING.includes(status)) {
    const fallbackTracks = others.length > 0 ? others : byId.has(DEFAULT_FALLBACK_TRACK_ID) ? [byId.get(DEFAULT_FALLBACK_TRACK_ID)!] : [];
    const fallbacks = fallbackTracks.length > 0 ? fallbackTracks.map((t) => scenario(t, "fallback", userMonths)) : [scenario(null, "fallback", userMonths)];
    return { scenarios: [scenario(katusa, "conditional", userMonths), ...fallbacks], excluded: [], alternatives: [] };
  }
  return { scenarios: generic(), excluded: [], alternatives: [] };
}

// ── 자격증 ──────────────────────────────────────────────

export interface CertificateMatch {
  certificate: CertificateInfo;
  /** 이 군 트랙에서 공식 관계가 확인된 것(출처 있음). 없으면 빈 배열 */
  officialRelations: MilitaryCertificateRelation[];
  /** 공식 관계가 없거나 미확인일 때 화면에 보여 줄 문장 */
  note: string;
}

/**
 * 보유 자격증과 군 트랙의 공식 관계만 찾는다. 점수를 합산하거나 합격 가능성을 계산하지 않는다.
 * verified + 출처 URL이 있는 관계만 "공식 관계"로 본다.
 */
export function matchCertificates(
  trackId: string,
  certificateIds: string[],
  catalog: MilitaryCatalog | undefined,
): CertificateMatch[] {
  if (!catalog) return [];
  return certificateIds.flatMap((id) => {
    const certificate = catalog.certificates.find((c) => c.id === id);
    if (!certificate) return [];
    const officialRelations = catalog.relations.filter(
      (r) => r.militaryTrackId === trackId && r.certificateId === id && r.status === "verified" && r.sourceUrl.length > 0,
    );
    return [
      {
        certificate,
        officialRelations,
        note:
          officialRelations.length > 0
            ? "공식 자료에서 이 모집 분야와의 관계를 확인했습니다."
            : "이 모집 분야에서 공식 인정·배점 관계를 확인하지 못했습니다. 확인 필요",
      },
    ];
  });
}

/** 현재 명칭·구 명칭·별칭으로 자격증 찾기(대소문자·공백 무시). 별칭이 맞으면 어떤 별칭인지 함께 돌려준다. */
export function findCertificate(
  query: string,
  catalog: MilitaryCatalog | undefined,
): Array<{ certificate: CertificateInfo; matchedAlias: string | null }> {
  const norm = (s: string) => s.replace(/\s+/g, "").toLowerCase();
  const q = norm(query);
  if (!q || !catalog) return [];
  return catalog.certificates.flatMap((c): Array<{ certificate: CertificateInfo; matchedAlias: string | null }> => {
    if (norm(c.officialName).includes(q)) return [{ certificate: c, matchedAlias: null }];
    const alias = c.aliases.find((a) => norm(a.name).includes(q));
    return alias ? [{ certificate: c, matchedAlias: alias.name }] : [];
  });
}
