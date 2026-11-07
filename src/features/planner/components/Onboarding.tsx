"use client";

import { ClipboardPaste } from "lucide-react";
import { useState } from "react";
import type { Dataset, PlanInput, Season } from "@/contracts/types";
import { validatePlanInput } from "@/engine";
import { blankInput, todayISO } from "../defaults";
import { TRACKS } from "../labels";
import { findCoursesInText } from "../parseTranscript";
import { blankProfile, completedTermsLabel, curriculumCovers, type Profile } from "../profile";
import { BreakEditor } from "./BreakEditor";
import { Button, Field, Segmented } from "./ui";

const MILITARY: Array<[Profile["military"], string]> = [
  ["planned", "앞으로 다녀올 예정"],
  ["none", "해당 없음(마침·면제 포함)"],
];

/**
 * 내 정보 입력. 처음 방문할 때와 "내 정보 수정" 때 함께 쓴다.
 * 샘플 값 없이 사용자가 입력한 정보로만 계획을 만든다.
 */
export function Onboarding({
  dataset,
  initialInput,
  initialProfile,
  onDone,
  onCancel,
}: {
  dataset: Dataset | null;
  initialInput?: PlanInput | null;
  initialProfile?: Profile | null;
  onDone: (input: PlanInput, profile: Profile) => void;
  onCancel?: () => void;
}) {
  const editing = !!initialInput;
  const [draft, setDraft] = useState<PlanInput>(() => initialInput ?? blankInput(todayISO()));
  const [profile, setProfile] = useState<Profile>(() => initialProfile ?? blankProfile());
  const [tried, setTried] = useState(false);
  const [paste, setPaste] = useState("");
  const [pasteResult, setPasteResult] = useState<string | null>(null);

  const set = (patch: Partial<PlanInput>) => setDraft((d) => ({ ...d, ...patch }));
  const setP = (patch: Partial<Profile>) => setProfile((p) => ({ ...p, ...patch }));
  const num = (v: string) => (v === "" ? 0 : Number(v));
  const error = validatePlanInput(draft);
  const thisYear = Number(todayISO().slice(0, 4));
  const years = Array.from({ length: 9 }, (_, i) => thisYear - 7 + i).reverse();
  const covers = dataset ? curriculumCovers(dataset.curriculum, profile.admissionYear) : null;

  const courses = dataset ? [...dataset.courses].sort((a, b) => (a.recommendedYear ?? 9) - (b.recommendedYear ?? 9)) : [];
  const toggle = (code: string) =>
    set({
      completedCourseCodes: draft.completedCourseCodes.includes(code)
        ? draft.completedCourseCodes.filter((c) => c !== code)
        : [...draft.completedCourseCodes, code],
    });

  const applyPaste = () => {
    const found = findCoursesInText(paste, courses);
    const added = found.filter((c) => !draft.completedCourseCodes.includes(c));
    set({ completedCourseCodes: [...draft.completedCourseCodes, ...added] });
    setPasteResult(
      found.length === 0
        ? "학과 자료에 있는 과목을 찾지 못했어요. 학수번호나 과목명이 포함되게 복사해 주세요."
        : `전공 과목 ${found.length}개를 찾았어요${added.length < found.length ? ` (새로 체크 ${added.length}개)` : ""}. 아래 목록에서 확인하세요.`,
    );
  };

  const submit = () => {
    setTried(true);
    if (!error) onDone(draft, { ...profile, name: profile.name.trim() });
  };

  return (
    <div className="mx-auto max-w-[760px] py-2">
      <h1 className="text-[28px] font-semibold tracking-tight text-ink">{editing ? "내 정보 수정" : "내 정보로 학기 계획 만들기"}</h1>
      <p className="mt-2 mb-8 text-[13px] text-muted">
        지금까지 들은 과목과 앞으로의 일정을 알려주면 학기별로 무엇을 들을지 배치해 드려요. 입력한 정보는 이 브라우저에만 저장되고 어디에도 보내지 않습니다.
      </p>

      <ol className="grid gap-8">
        <Step n={1} title="나에 대해 알려주세요">
          <div className="grid gap-3 sm:grid-cols-[1fr_1fr]">
            <Field label="이름 또는 닉네임(선택)">
              <input value={profile.name} maxLength={20} placeholder="화면 인사말에만 쓰여요" onChange={(e) => setP({ name: e.target.value })} />
            </Field>
            <Field label="입학연도(학번)">
              <select
                value={profile.admissionYear ?? ""}
                onChange={(e) => setP({ admissionYear: e.target.value === "" ? null : Number(e.target.value) })}
              >
                <option value="">선택 안 함</option>
                {years.map((y) => (
                  <option key={y} value={y}>
                    {y}년 ({String(y).slice(2)}학번)
                  </option>
                ))}
              </select>
            </Field>
          </div>
          {covers === false && dataset && (
            <p className="mt-2 text-xs text-warm-ink">
              지금 자료는 {dataset.curriculum} 교육과정입니다. {profile.admissionYear}년 입학생에게 적용되는 교육과정은 학사안내에서 확인하세요.
            </p>
          )}
          <p className="mt-4 mb-2 text-xs text-muted">희망 진로</p>
          <Segmented label="희망 진로" options={TRACKS} value={draft.track} onChange={(track) => set({ track })} />
          <p className="mt-2 text-xs text-muted">서비스가 나눈 진로 분류이며 학교 공식 트랙이 아닙니다.</p>
        </Step>

        <Step n={2} title="지금까지 얼마나 들었나요?">
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="마친 학기">
              <select value={draft.completedTerms} onChange={(e) => set({ completedTerms: Number(e.target.value) })}>
                {Array.from({ length: 13 }, (_, i) => (
                  <option key={i} value={i}>
                    {completedTermsLabel(i)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="총 이수학점">
              <input type="number" inputMode="numeric" min={0} max={250} value={draft.earnedCredits} onChange={(e) => set({ earnedCredits: num(e.target.value) })} />
            </Field>
            <Field label="그중 전공학점">
              <input type="number" inputMode="numeric" min={0} max={250} value={draft.earnedMajorCredits} onChange={(e) => set({ earnedMajorCredits: num(e.target.value) })} />
            </Field>
          </div>
          <p className="mt-2 text-xs text-muted">휴학한 학기는 빼고 실제로 다닌 학기만 세어 주세요.</p>

          {courses.length > 0 && (
            <div className="mt-5 rounded-xl border border-line bg-panel p-4">
              <p className="flex items-center gap-2 text-[13px] font-semibold">
                <ClipboardPaste size={15} aria-hidden /> 성적표 붙여넣기로 이수 과목 채우기
              </p>
              <p className="mt-1 mb-2.5 text-xs text-muted">
                한양인 → 성적 조회 화면의 표를 드래그해 복사한 뒤 붙여넣으세요. 학수번호나 과목명이 일치하는 전공 과목만 체크하고, 성적은 읽지 않아요.
              </p>
              <textarea
                value={paste}
                onChange={(e) => setPaste(e.target.value)}
                rows={4}
                placeholder={"예)\nCSE1002  전산학개론  3  A+\nITE1012  정보시스템개론  3  A0"}
                className="w-full resize-y rounded-md border border-line bg-bg px-2.5 py-2 text-[13px]"
                aria-label="성적표 붙여넣기"
              />
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <Button onClick={applyPaste} disabled={!paste.trim()}>
                  이수 과목 찾기
                </Button>
                {pasteResult && (
                  <span role="status" className="text-xs text-ink">
                    {pasteResult}
                  </span>
                )}
              </div>

              <details className="mt-3 border-t border-line pt-3" open={draft.completedCourseCodes.length > 0}>
                <summary className="cursor-pointer text-[13px] text-brand">
                  직접 고르기 · 체크한 전공 과목 {draft.completedCourseCodes.length}개
                </summary>
                <div className="mt-2.5 grid gap-1 sm:grid-cols-2">
                  {courses.map((c) => (
                    <label key={c.code} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-[13px] hover:bg-bg">
                      <input type="checkbox" checked={draft.completedCourseCodes.includes(c.code)} onChange={() => toggle(c.code)} />
                      <span className="min-w-0 truncate">{c.name}</span>
                      <span className="ml-auto text-[11px] text-muted tabular-nums">{c.recommendedYear ? `${c.recommendedYear}학년` : ""}</span>
                    </label>
                  ))}
                </div>
              </details>
            </div>
          )}
        </Step>

        <Step n={3} title="언제부터, 몇 학점까지 계획할까요?">
          <div className="grid gap-3 sm:grid-cols-4">
            <Field label="시작 연도">
              <input type="number" inputMode="numeric" min={2024} max={2040} value={draft.startTerm.year} onChange={(e) => set({ startTerm: { ...draft.startTerm, year: num(e.target.value) } })} />
            </Field>
            <Field label="시작 학기">
              <select value={draft.startTerm.season} onChange={(e) => set({ startTerm: { ...draft.startTerm, season: Number(e.target.value) as Season } })}>
                <option value={1}>1학기</option>
                <option value={2}>2학기</option>
              </select>
            </Field>
            <Field label="목표 총학점">
              <input
                type="number"
                inputMode="numeric"
                min={1}
                max={250}
                placeholder="모르면 비워두기"
                value={draft.targetCredits ?? ""}
                onChange={(e) => set({ targetCredits: e.target.value === "" ? null : Number(e.target.value) })}
              />
            </Field>
            <Field label="학기당 최대">
              <select value={draft.creditCap} onChange={(e) => set({ creditCap: Number(e.target.value) })}>
                {[9, 12, 15, 18, 21].map((n) => (
                  <option key={n} value={n}>
                    {n}학점
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <p className="mt-2 text-xs text-muted">
            졸업 총학점은 아직 확인된 자료가 없어 직접 입력받아요. 비워두면 예상 완료 학기는 계산하지 않습니다.
          </p>
        </Step>

        <Step n={4} title="군 복무나 휴학 계획이 있나요?">
          <p className="mb-2 text-xs text-muted">군 복무</p>
          <Segmented
            label="군 복무"
            options={MILITARY}
            value={profile.military}
            onChange={(military) => {
              setP({ military });
              if (military === "none") set({ breaks: draft.breaks.filter((b) => b.kind !== "military") });
            }}
          />
          <div className="mt-4">
            <BreakEditor
              key={profile.military}
              breaks={draft.breaks}
              preset={profile.military === "planned" && !draft.breaks.some((b) => b.kind === "military") ? "military" : undefined}
              onChange={(breaks) => set({ breaks })}
            />
          </div>
        </Step>
      </ol>

      {tried && error && (
        <p role="alert" className="mt-6 rounded-lg bg-warm px-3 py-2.5 text-[13px] text-warm-ink">
          {error}
        </p>
      )}
      <div className="mt-9 flex justify-end gap-2">
        {onCancel && <Button onClick={onCancel}>취소</Button>}
        <Button primary onClick={submit} className="px-5">
          {editing ? "저장하고 로드맵 보기" : "내 로드맵 만들기"}
        </Button>
      </div>
    </div>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <li className="grid grid-cols-[28px_minmax(0,1fr)] gap-3.5">
      <span className="grid size-7 place-items-center rounded-full bg-brand text-xs font-semibold text-contrast tabular-nums">{n}</span>
      <div className="min-w-0 pt-0.5">
        <h2 className="mb-3 text-[16px] font-semibold text-ink">{title}</h2>
        {children}
      </div>
    </li>
  );
}
