"use client";

import { ClipboardPaste, PencilLine, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Course, DatasetV2 } from "@/contracts/types";
import { readClipboard } from "../importSources";
import type { Draft } from "../plan";
import {
  applyTranscriptImport,
  isPersonalRow,
  type CourseStatus,
  type DetectedCourseRow,
  type DetectedValue,
  importProblem,
  importSummary,
  parseTranscriptRows,
  rowsFromText,
  type SourceRow,
  type TranscriptImportDraft,
  type TranscriptImportSource,
} from "../transcriptImport";
import { Button } from "./ui";

type Mode = "paste" | null;

/**
 * 01 아 — 이수 현황 가져오기. 붙여넣기 → 인식 → 검토 → 확인하면 한 번에 반영.
 * 검토에서 확인하기 전에는 입력값을 바꾸지 않는다(브라우저 저장도 확인 뒤에만).
 */
export function TranscriptImport({
  draft,
  update,
  dataset,
  onManual,
}: {
  draft: Draft;
  update: (fn: (d: Draft) => Draft) => void;
  dataset: DatasetV2 | null;
  onManual: () => void;
}) {
  const [mode, setMode] = useState<Mode>(null);
  const [review, setReview] = useState<TranscriptImportDraft | null>(null);
  const [applied, setApplied] = useState<string | null>(null);
  const courses = useMemo(() => dataset?.courses ?? [], [dataset]);

  const analyze = (rows: SourceRow[], source: TranscriptImportSource) => {
    setApplied(null);
    setReview(parseTranscriptRows(rows, courses, source));
  };

  const has = draft.earnedCredits !== null && draft.earnedMajorCredits !== null;

  return (
    <div>
      {has && !mode && (
        <div className="mb-6 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-[10px] border border-sage/60 bg-sage/10 px-5 py-3 text-[15px]">
          <span>
            지금 값 — 총 <b>{draft.earnedCredits}</b>학점 · 전공 <b>{draft.earnedMajorCredits}</b>학점 · 학과 과목 <b>{draft.completedCourseCodes.length}</b>개
            {draft.targetCredits !== null && <> · 목표 {draft.targetCredits}학점</>}
          </span>
          {applied && <span className="text-sage-ink">{applied}</span>}
        </div>
      )}
      <div role="radiogroup" aria-label="이수 현황 가져오기 방법" className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-3">
        <BigOption icon={<ClipboardPaste size={22} />} selected={mode === "paste"} onClick={() => setMode("paste")} title="복사한 성적표 붙여넣기" desc="포털 성적·졸업사정 화면에서 Ctrl+A → Ctrl+C" />
        <BigOption icon={<PencilLine size={22} />} selected={false} onClick={onManual} title="직접 수정하기" desc="학점·과목을 하나씩 고치기" />
      </div>
      <p className="mt-3 text-[13px] text-muted">이 브라우저 안에서만 읽어요. 성적표 원문은 저장하거나 어디로도 보내지 않고, 확인한 숫자와 과목만 저장해요.</p>

      {mode === "paste" && <PastePanel onRows={analyze} />}

      {review && (
        <ReviewDialog
          draft={draft}
          result={review}
          courses={courses}
          onCancel={() => setReview(null)}
          onApply={(next, summary) => {
            update((d) => ({ ...d, ...next, coursesConfirmed: true, targetSource: next.targetCredits !== d.targetCredits ? "graduation_check" : d.targetSource, progressMode: "import" }));
            setReview(null);
            setMode(null);
            setApplied(summary);
          }}
        />
      )}
    </div>
  );
}

function BigOption({ icon, title, desc, selected, onClick }: { icon: ReactNode; title: string; desc: string; selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onClick}
      className={`flex min-h-[88px] min-w-0 cursor-pointer items-center gap-4 rounded-[10px] border-2 px-5 py-4 text-left transition-colors ${
        selected ? "border-pen bg-pen/[0.08]" : "border-line bg-paper hover:border-ink/40"
      }`}
    >
      <span className="shrink-0 text-pen">{icon}</span>
      <span className="min-w-0">
        <span className="block text-[17px] font-semibold">{title}</span>
        <span className="block text-[13px] text-ink-soft">{desc}</span>
      </span>
    </button>
  );
}

// ── 붙여넣기 ─────────────────────────────────────────────

function PastePanel({ onRows }: { onRows: (rows: SourceRow[], s: TranscriptImportSource) => void }) {
  const [text, setText] = useState("");
  const [pastes, setPastes] = useState(0);
  const [note, setNote] = useState<string | null>(null);
  // 붙여넣을 때마다 아래에 이어 붙인다(학기마다 따로 복사해 여러 번 붙여넣기). 확인 창은 버튼을 눌러야 열린다.
  const append = (chunk: string, label: string) => {
    if (!chunk.trim()) return;
    setText((t) => (t.trim() ? `${t.replace(/\s+$/, "")}\n${chunk}` : chunk));
    setPastes((n) => n + 1);
    setNote(label);
  };
  return (
    <div className="mt-6 max-w-[860px]">
      <textarea
        autoFocus
        value={text}
        rows={9}
        aria-label="성적표 붙여넣기"
        placeholder={"포털 성적 조회 화면에서 한 학기씩 Ctrl+A → Ctrl+C 한 뒤, 여기에 Ctrl+V 하세요.\n여러 학기는 붙여넣기를 반복하면 아래로 이어 붙어요. 다 붙였으면 ‘읽어서 확인하기’를 누르세요."}
        onChange={(e) => setText(e.target.value)}
        onPaste={(e) => {
          const c = readClipboard(e.clipboardData);
          e.preventDefault();
          if (c.kind === "image") {
            setNote("이미지는 읽지 않아요. 포털 화면에서 Ctrl+A → Ctrl+C로 글자를 복사해 붙여넣어 주세요.");
            return;
          }
          // 이름·학번 같은 개인정보 행은 입력칸에 펼치지 않는다. 표는 셀을 탭으로 이어 행 구조를 유지한다
          const rows = c.rows.filter((r) => !isPersonalRow(r));
          append(rows.map((r) => r.cells.join("\t")).join("\n"), `${pastes + 1}번째 붙여넣기 — ${rows.length}줄을 더했어요. 더 붙이거나 ‘읽어서 확인하기’를 누르세요.`);
        }}
        className="w-full resize-y font-mono !text-[13px]"
      />
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Button kind="ink" disabled={!text.trim()} onClick={() => onRows(rowsFromText(text), "clipboard_text")}>
          읽어서 확인하기{pastes > 1 ? ` (${pastes}번 붙여넣음)` : ""}
        </Button>
        {text.trim() && (
          <Button
            kind="ghost"
            onClick={() => {
              setText("");
              setPastes(0);
              setNote(null);
            }}
          >
            모두 지우기
          </Button>
        )}
        {note && (
          <span role="status" className="text-[13px] text-ink-soft">
            {note}
          </span>
        )}
      </div>
    </div>
  );
}

// ── 검토 ─────────────────────────────────────────────────

type Row = DetectedCourseRow & { group: "completed" | "inProgress" | "notCompleted" | "ambiguous"; status: CourseStatus | "exclude"; chosen: string | null };

const STATUS_LABEL: Record<CourseStatus | "exclude", string> = {
  completed: "완료",
  in_progress: "수강 중",
  failed: "미이수(F)",
  withdrawn: "철회(W)",
  unknown: "확인 필요",
  exclude: "넣지 않음",
};

/** 성적표에서 확실히 하나만 찾았으면 그 값, 아니면 지금 입력값을 기본으로 */
function initialNumber(values: DetectedValue[], current: number | null): number | null {
  return values.length === 1 && values[0].confidence !== "low" ? values[0].value : current;
}

function ReviewDialog({
  draft,
  result,
  courses,
  onCancel,
  onApply,
}: {
  draft: Draft;
  result: TranscriptImportDraft;
  courses: Course[];
  onCancel: () => void;
  onApply: (next: Pick4, summary: string) => void;
}) {
  const [earned, setEarned] = useState<number | null>(initialNumber(result.earnedCredits, draft.earnedCredits));
  const [major, setMajor] = useState<number | null>(initialNumber(result.earnedMajorCredits, draft.earnedMajorCredits));
  const [target, setTarget] = useState<number | null>(initialNumber(result.targetCredits, draft.targetCredits));
  const [rows, setRows] = useState<Row[]>(() => [
    ...result.completed.map((r) => ({ ...r, group: "completed" as const, status: "completed" as const, chosen: r.matchedCourseCode })),
    ...result.ambiguous.map((r) => ({ ...r, group: "ambiguous" as const, status: "exclude" as const, chosen: r.matchKind === "ocr_suggestion" ? null : r.matchedCourseCode })),
    ...result.inProgress.map((r) => ({ ...r, group: "inProgress" as const, status: "in_progress" as const, chosen: r.matchedCourseCode })),
    ...result.notCompleted.map((r) => ({ ...r, group: "notCompleted" as const, status: r.detectedStatus, chosen: r.matchedCourseCode })),
  ]);
  const [mode, setMode] = useState<"merge" | "replace">("merge");
  const [tried, setTried] = useState(false);
  const dialog = useRef<HTMLDivElement>(null);
  const courseName = (code: string | null) => courses.find((c) => c.code === code)?.name ?? code ?? "—";

  useEffect(() => {
    dialog.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onCancel();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onCancel]);

  const completedCodes = rows.filter((r) => r.status === "completed" && r.chosen).map((r) => r.chosen!);
  const choice = {
    earnedCredits: earned,
    earnedMajorCredits: major,
    targetCredits: target,
    completedCodes,
    mode,
  };
  const current = { earnedCredits: draft.earnedCredits, earnedMajorCredits: draft.earnedMajorCredits, targetCredits: draft.targetCredits, completedCourseCodes: draft.completedCourseCodes };
  const problem = importProblem(choice, current);
  const next = applyTranscriptImport(current, choice);
  const added = next.completedCourseCodes.filter((c) => !draft.completedCourseCodes.includes(c)).length;
  const removed = draft.completedCourseCodes.filter((c) => !next.completedCourseCodes.includes(c)).length;
  const unresolved = rows.filter((r) => r.group === "ambiguous" && r.status === "completed" && !r.chosen).length;

  const setRow = (id: string, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const apply = () => {
    setTried(true);
    if (problem || unresolved > 0) return;
    onApply(next, `가져오기 반영 — 과목 +${added}${removed ? ` −${removed}` : ""}${choice.earnedCredits !== null ? ` · 총 ${choice.earnedCredits}학점` : ""}`);
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-ink/40 print:hidden" role="presentation">
      <div
        ref={dialog}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="import-title"
        className="mx-auto my-6 w-[min(1100px,calc(100vw-32px))] rounded-[12px] border-[1.5px] border-ink bg-paper shadow-2xl outline-none"
      >
        <header className="flex items-start justify-between gap-4 border-b border-line px-7 py-5">
          <div className="min-w-0">
            <p className="font-hand text-[20px] leading-none text-pen">가져온 내용 확인</p>
            <h2 id="import-title" className="mt-1 font-serif text-[24px] font-bold">
              {importSummary(result)}
            </h2>
            <p className="mt-1 text-[13px] text-muted">
              확인을 누르기 전에는 지금 입력이 바뀌지 않아요.{result.personalRowsSkipped > 0 && ` 이름·학번 등 개인정보 행 ${result.personalRowsSkipped}개는 읽지 않았어요.`}
            </p>
          </div>
          <button type="button" onClick={onCancel} aria-label="가져오기 취소" className="shrink-0 cursor-pointer rounded p-1.5 text-ink-soft hover:bg-paper-2">
            <X size={20} aria-hidden />
          </button>
        </header>

        <div className="grid gap-8 px-7 py-6">
          {result.warnings.length > 0 && (
            <ul className="grid gap-1 border-l-[3px] border-red bg-red-soft/30 px-4 py-2.5 text-[13px]">
              {result.warnings.map((w) => (
                <li key={w}>· {w}</li>
              ))}
            </ul>
          )}

          <section>
            <h3 className="mb-3 font-serif text-[18px] font-bold">학점</h3>
            <div className="grid grid-cols-[repeat(auto-fit,minmax(250px,1fr))] gap-4">
              <NumberField label="총 이수학점" value={earned} onChange={setEarned} found={result.earnedCredits} hint="포털 졸업사정·성적 조회의 취득학점 합계" />
              <NumberField label="전공 이수학점" value={major} onChange={setMajor} found={result.earnedMajorCredits} hint="총학점에 포함 — 더하지 않아요" />
              <NumberField label="목표(졸업 기준) 총학점" value={target} onChange={setTarget} found={result.targetCredits} hint="개인 졸업사정 값(모르면 비워 두세요)" />
            </div>
            <p className="mt-2 text-[12px] text-muted">찾은 학과 과목의 학점 합은 {result.courseCreditSum}학점이에요(교양·타과·인정 학점이 빠져 있어 총 이수학점으로 쓰지 않아요).</p>
          </section>

          <section>
            <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
              <h3 className="font-serif text-[18px] font-bold">학과 과목 {rows.length}개</h3>
              <p className="text-[13px] text-ink-soft">
                완료로 반영 {completedCodes.length}개 · 지금 입력 {draft.completedCourseCodes.length}개
              </p>
            </div>
            {rows.length === 0 ? (
              <p className="text-[14px] text-muted">학과 자료와 맞는 과목을 찾지 못했어요. 아래 ‘읽지 못한 행’을 확인하거나 직접 수정하세요.</p>
            ) : (
              <div className="overflow-x-auto rounded-[8px] border border-line">
                <table className="w-full min-w-[720px] text-[13px]">
                  <thead className="bg-paper-2 text-left text-[12px] text-muted">
                    <tr>
                      <th className="px-3 py-2 font-medium">원문 행</th>
                      <th className="px-3 py-2 font-medium">찾은 과목</th>
                      <th className="px-3 py-2 font-medium">성적</th>
                      <th className="w-[150px] px-3 py-2 font-medium">반영</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.id} className={`border-t border-rule ${r.group === "ambiguous" ? "bg-marker/15" : ""}`}>
                        <td className="max-w-[300px] px-3 py-2 align-top">
                          <span className="block break-words text-ink-soft">{r.rawText}</span>
                          <span className="text-[11px] text-muted">행 {r.sourceRow + 1}</span>
                        </td>
                        <td className="px-3 py-2 align-top">
                          {r.matchKind === "ocr_suggestion" ? (
                            <label className="grid gap-1">
                              <span className="text-[11px] text-red">‘{r.detectedCode}’를 읽었어요 — 맞는 과목을 골라 주세요</span>
                              <select value={r.chosen ?? ""} onChange={(e) => setRow(r.id, { chosen: e.target.value || null, status: e.target.value ? "completed" : "exclude" })} className="!py-1 !text-[13px]">
                                <option value="">선택 안 함</option>
                                {r.candidateCodes.map((c) => (
                                  <option key={c} value={c}>
                                    {c} {courseName(c)}
                                  </option>
                                ))}
                              </select>
                            </label>
                          ) : (
                            <>
                              <span className="font-medium">{courseName(r.chosen)}</span> <span className="text-[11px] text-muted">{r.chosen}</span>
                              <span className="block text-[11px] text-muted">{r.matchKind === "exact_code" ? "학수번호 일치" : r.matchKind === "exact_name" ? "과목명 일치" : "과목명(기호 무시) 일치"}</span>
                            </>
                          )}
                        </td>
                        <td className="px-3 py-2 align-top tabular-nums">{r.detectedGrade ?? "—"}</td>
                        <td className="px-3 py-2 align-top">
                          <select
                            aria-label={`${courseName(r.chosen)} 반영 상태`}
                            value={r.status === "completed" || r.status === "in_progress" ? r.status : "exclude"}
                            onChange={(e) => setRow(r.id, { status: e.target.value as Row["status"] })}
                            className="!py-1 !text-[13px]"
                            disabled={r.matchKind === "ocr_suggestion" && !r.chosen}
                          >
                            <option value="completed">완료로 반영</option>
                            <option value="in_progress">수강 중(반영 안 함)</option>
                            <option value="exclude">{r.status === "failed" || r.status === "withdrawn" ? STATUS_LABEL[r.status] : "넣지 않음"}</option>
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {result.unrecognizedLines.length > 0 && (
            <details className="text-[13px]">
              <summary className="cursor-pointer font-medium">읽지 못한 행 {result.unrecognizedLines.length}개 — 교양·타과·인정 과목일 수 있어요(버리지 않고 보여 드려요)</summary>
              <ul className="mt-2 grid max-h-[240px] gap-0.5 overflow-y-auto rounded border border-line bg-paper-2/50 p-3 font-mono text-[12px] text-ink-soft">
                {result.unrecognizedLines.map((l, i) => (
                  <li key={i} className="break-words">
                    {l}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>

        <footer className="sticky bottom-0 flex flex-wrap items-center justify-between gap-4 rounded-b-[12px] border-t border-line bg-paper px-7 py-4">
          <fieldset className="flex flex-wrap items-center gap-4 text-[13px]">
            <legend className="sr-only">기존 과목과 합치는 방법</legend>
            <label className="flex cursor-pointer items-center gap-1.5">
              <input type="radio" name="import-mode" checked={mode === "merge"} onChange={() => setMode("merge")} /> 기존 과목에 합치기
            </label>
            <label className={`flex cursor-pointer items-center gap-1.5 ${mode === "replace" ? "font-semibold text-red" : ""}`}>
              <input type="radio" name="import-mode" checked={mode === "replace"} onChange={() => setMode("replace")} /> 기존 과목을 이걸로 교체
            </label>
            <span className="text-ink-soft">
              → 과목 +{added}
              {removed > 0 && <b className="text-red"> −{removed}</b>}
            </span>
          </fieldset>
          <div className="flex items-center gap-2">
            {tried && (problem || unresolved > 0) && (
              <span role="alert" className="text-[13px] text-red">
                {problem ?? "글자가 헷갈리는 과목을 골라 주세요."}
              </span>
            )}
            <Button kind="ghost" onClick={onCancel}>
              취소
            </Button>
            <Button kind={mode === "replace" ? "stamp" : "ink"} onClick={apply}>
              {mode === "replace" ? "교체해서 반영" : "확인하고 한 번에 반영"}
            </Button>
          </div>
        </footer>
      </div>
    </div>
  );
}

type Pick4 = ReturnType<typeof applyTranscriptImport>;

function NumberField({ label, value, onChange, found, hint }: { label: string; value: number | null; onChange: (v: number | null) => void; found: DetectedValue[]; hint: string }) {
  return (
    <label className="grid min-w-0 gap-1.5 rounded-[8px] border border-line p-4">
      <span className="text-[14px] font-semibold">{label}</span>
      <span className="flex items-baseline gap-2">
        <input
          type="number"
          inputMode="numeric"
          min={0}
          max={250}
          value={value ?? ""}
          placeholder="직접 입력"
          onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
          className="!w-[140px] font-serif !text-[22px] font-bold tabular-nums"
        />
        <span className="text-[14px] text-ink-soft">학점</span>
      </span>
      <span className="text-[11px] text-muted">{hint}</span>
      {found.length > 0 && (
        <span className="text-[11px] break-words text-pen">
          성적표에서 찾은 값: {found.map((v) => `${v.value}(행 ${v.sourceRow + 1})`).join(", ")}
        </span>
      )}
    </label>
  );
}
