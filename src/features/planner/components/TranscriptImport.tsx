"use client";

import { ImageUp, PencilLine, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { Course, DatasetV2, TranscriptImageReply } from "@/contracts/types";
import { imageProblem, imagesFromClipboard, MAX_IMAGES, toJpegBase64 } from "../importSources";
import { readTranscriptImage } from "@/client/transcriptImage";
import type { Draft } from "../plan";
import {
  applyTranscriptImport,
  type CourseStatus,
  type DetectedCourseRow,
  type DetectedValue,
  importProblem,
  importSummary,
  parseTranscriptRows,
  rowsFromVision,
  type SourceRow,
  type TranscriptImportDraft,
  type TranscriptImportSource,
} from "../transcriptImport";
import { Button } from "./ui";

type Mode = "image" | null;

/**
 * 01 아 — 이수 현황 가져오기. 스크린샷(Claude 이미지 인식, 동의 후 전송) → 검토 → 확인하면 한 번에 반영.
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
        </div>
      )}
      {applied && !mode && (
        <p role="status" className="mb-6 rounded-[8px] border border-sage-ink/40 bg-sage/30 px-5 py-3 text-[14px] text-sage-ink">
          {applied} · 이제 ‘다음’을 눌러 계속하세요.
        </p>
      )}
      <div role="radiogroup" aria-label="이수 현황 가져오기 방법" className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-3">
        <BigOption icon={<ImageUp size={22} />} selected={mode === "image"} onClick={() => setMode("image")} title="스크린샷으로 가져오기" desc="포털 성적 조회 화면을 학기별로 캡처해 붙여넣기" />
        <BigOption icon={<PencilLine size={22} />} selected={false} onClick={onManual} title="직접 수정하기" desc="학점·과목을 하나씩 고치기" />
      </div>
      <p className="mt-3 text-[13px] text-muted">캡처는 동의한 뒤에만 Claude로 보내 읽고, 저장하지 않아요. 읽은 결과는 확인 창에서 확인한 뒤에만 반영돼요.</p>

      {mode === "image" && <ImagePanel onRows={analyze} />}

      {review && (
        <ReviewDialog
          draft={draft}
          result={review}
          courses={courses}
          onCancel={() => {
            setReview(null);
            requestAnimationFrame(() => document.querySelector<HTMLButtonElement>("[data-read-transcript]")?.focus());
          }}
          onApply={(next, summary) => {
            update((d) => ({ ...d, ...next, coursesConfirmed: true, targetSource: next.targetCredits !== d.targetCredits ? "graduation_check" : d.targetSource, progressMode: "import" }));
            setReview(null);
            setMode(null);
            setApplied(summary);
            requestAnimationFrame(() => document.querySelector<HTMLButtonElement>("[data-input-next]")?.focus());
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

function ImagePanel({ onRows }: { onRows: (rows: SourceRow[], s: TranscriptImportSource) => void }) {
  const [files, setFiles] = useState<Array<{ id: number; file: File; url: string }>>([]);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const nextId = useRef(1);
  const zone = useRef<HTMLDivElement>(null);
  const filesRef = useRef(files);
  filesRef.current = files;
  // 미리보기 URL은 화면을 떠날 때 해제한다
  useEffect(() => () => filesRef.current.forEach((f) => URL.revokeObjectURL(f.url)), []);
  useEffect(() => zone.current?.focus(), []);

  const add = (list: File[]) => {
    setProblem(null);
    const ok: typeof files = [];
    for (const f of list) {
      const p = imageProblem(f);
      if (p) {
        setProblem(p);
        continue;
      }
      ok.push({ id: nextId.current++, file: f, url: URL.createObjectURL(f) });
    }
    setFiles((cur) => [...cur, ...ok].slice(0, MAX_IMAGES));
  };
  const remove = (id: number) =>
    setFiles((cur) => {
      const f = cur.find((x) => x.id === id);
      if (f) URL.revokeObjectURL(f.url);
      return cur.filter((x) => x.id !== id);
    });

  const read = async () => {
    setProblem(null);
    const replies: TranscriptImageReply[] = [];
    for (let i = 0; i < files.length; i++) {
      setBusy(`${i + 1} / ${files.length}장 읽는 중…`);
      const img = await toJpegBase64(files[i].file).catch(() => null);
      if (!img) {
        setProblem(`${i + 1}번째 이미지를 열지 못했어요.`);
        continue;
      }
      const r = await readTranscriptImage({ mediaType: img.mediaType, data: img.data });
      if (!r.ok) {
        setBusy(null);
        setProblem(
          r.reason === "no_key"
            ? "스크린샷 읽기가 아직 켜져 있지 않아요(서버 설정 필요). ‘직접 수정하기’로 입력해 주세요."
            : r.reason === "rate_limited"
              ? "잠시 요청이 많아요. 1분 뒤 다시 시도해 주세요."
              : `${i + 1}번째 이미지를 읽지 못했어요. 다시 시도하거나 ‘직접 수정하기’로 입력해 주세요.`,
        );
        return;
      }
      if (r.reply.unreadable) setProblem(`${i + 1}번째 이미지는 성적 화면으로 읽히지 않았어요. 더 선명하게 캡처해 주세요.`);
      replies.push(r.reply);
    }
    setBusy(null);
    const rows = rowsFromVision(replies);
    if (rows.length === 0) {
      setProblem("읽은 과목이 없어요. 성적 조회 표가 잘 보이게 다시 캡처해 주세요.");
      return;
    }
    onRows(rows, "image_ai");
  };

  return (
    <div className="mt-6 max-w-[980px]">
      <div
        ref={zone}
        tabIndex={0}
        aria-label="스크린샷 붙여넣기 영역"
        onPaste={(e) => {
          const imgs = imagesFromClipboard(e.clipboardData);
          if (imgs.length > 0) {
            e.preventDefault();
            add(imgs);
          } else setProblem("이미지가 아니에요. 캡처(스크린샷)를 복사해 붙여넣어 주세요.");
        }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          add([...e.dataTransfer.files]);
        }}
        className="rounded-[10px] border-2 border-dashed border-pen/50 bg-pen/[0.03] p-5 outline-none focus-visible:border-pen"
      >
        {files.length === 0 ? (
          <div className="grid min-h-[160px] place-items-center text-center text-[14px] text-ink-soft">
            <div>
              <ImageUp size={28} className="mx-auto mb-2 text-pen" aria-hidden />
              포털 성적 조회 화면을 학기별로 캡처해서 여기를 누르고 <b>Ctrl+V</b>로 붙여넣거나, 이미지 파일을 끌어다 놓으세요.
              <br />
              여러 장(최대 {MAX_IMAGES}장)을 한꺼번에 읽어요.
            </div>
          </div>
        ) : (
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-3">
            {files.map((f, i) => (
              <li key={f.id} className="relative min-w-0 rounded-[8px] border border-line bg-paper p-1.5">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={f.url} alt={`성적표 캡처 ${i + 1}`} className="h-[110px] w-full rounded object-cover object-top" />
                <span className="mt-1 block truncate text-[11px] text-muted">
                  {i + 1}. {f.file.name || "붙여넣은 이미지"}
                </span>
                <button type="button" onClick={() => remove(f.id)} aria-label={`${i + 1}번째 이미지 빼기`} className="absolute top-1 right-1 cursor-pointer rounded-full bg-ink/70 p-1 text-paper hover:bg-ink">
                  <X size={13} aria-hidden />
                </button>
              </li>
            ))}
            {files.length < MAX_IMAGES && <li className="grid min-h-[130px] place-items-center rounded-[8px] border border-dashed border-line text-center text-[12px] text-muted">Ctrl+V로 더 붙이기</li>}
          </ul>
        )}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3 text-[14px]">
        <label className="relative inline-flex cursor-pointer items-center gap-2 overflow-hidden rounded-[6px] border-[1.5px] border-ink/70 px-4 py-2 font-medium focus-within:ring-2 focus-within:ring-pen hover:bg-paper-2">
          <ImageUp size={16} aria-hidden /> 이미지 파일 고르기
          <input type="file" multiple accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(e) => add([...(e.target.files ?? [])])} />
        </label>
        <span className="text-[12px] text-muted">이름·학번 부분은 잘라내거나 가려도 돼요.</span>
      </div>

      <label className="mt-5 flex max-w-[760px] cursor-pointer items-start gap-2 rounded-[8px] border border-line bg-paper-2/50 p-3 text-[13px]">
        <input type="checkbox" className="mt-0.5" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
        <span>
          캡처 이미지를 <b>Anthropic(Claude)</b>에 보내 글자를 읽는 데 동의해요. 이 서비스는 이미지와 읽은 원문을 저장하지 않고, 확인 창에서 내가 확인한 과목·학점만 이 브라우저에 저장해요.
        </span>
      </label>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button data-read-transcript="true" kind="ink" disabled={files.length === 0 || !consent || busy !== null} onClick={read}>
          {busy ?? `읽어서 확인하기${files.length > 0 ? ` (${files.length}장)` : ""}`}
        </Button>
        {problem && (
          <span role="alert" className="text-[13px] text-red">
            {problem}
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
  const [reqMajor, setReqMajor] = useState<number | null>(initialNumber(result.majorRequired, draft.majorRequirement?.major ?? null));
  const [reqLower, setReqLower] = useState<number | null>(initialNumber(result.majorLowerRequired, draft.majorRequirement?.lower ?? null));
  const [reqUpper, setReqUpper] = useState<number | null>(initialNumber(result.majorUpperRequired, draft.majorRequirement?.upper ?? null));
  const [upperEarned, setUpperEarned] = useState<number | null>(initialNumber(result.majorUpperEarned, draft.earnedUpperMajorCredits ?? null));
  const showMajorReq =
    result.majorRequired.length + result.majorLowerRequired.length + result.majorUpperRequired.length + result.majorUpperEarned.length > 0 ||
    draft.majorRequirement != null;
  const [rows, setRows] = useState<Row[]>(() => [
    ...result.completed.map((r) => ({ ...r, group: "completed" as const, status: "completed" as const, chosen: r.matchedCourseCode })),
    ...result.ambiguous.map((r) => ({ ...r, group: "ambiguous" as const, status: "exclude" as const, chosen: r.matchKind === "ocr_suggestion" ? null : r.matchedCourseCode })),
    ...result.inProgress.map((r) => ({ ...r, group: "inProgress" as const, status: "in_progress" as const, chosen: r.matchedCourseCode })),
    ...result.notCompleted.map((r) => ({ ...r, group: "notCompleted" as const, status: r.detectedStatus, chosen: r.matchedCourseCode })),
  ]);
  const [mode, setMode] = useState<"merge" | "replace">("merge");
  const [tried, setTried] = useState(false);
  const [mounted, setMounted] = useState(false);
  const dialog = useRef<HTMLDivElement>(null);
  const earnedInput = useRef<HTMLInputElement>(null);
  const majorInput = useRef<HTMLInputElement>(null);
  const cancelRef = useRef(onCancel);
  cancelRef.current = onCancel;
  const courseName = (code: string | null) => courses.find((c) => c.code === code)?.name ?? code ?? "—";

  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (!mounted) return;
    dialog.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        cancelRef.current();
        return;
      }
      if (e.key !== "Tab" || !dialog.current) return;
      const focusable = Array.from(dialog.current.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex="-1"])'));
      const first = focusable[0];
      const last = focusable.at(-1);
      if (e.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [mounted]);

  const completedCodes = rows.filter((r) => r.status === "completed" && r.chosen).map((r) => r.chosen!);
  const choice = {
    earnedCredits: earned,
    earnedMajorCredits: major,
    targetCredits: target,
    majorRequired: reqMajor,
    majorLowerRequired: reqLower,
    majorUpperRequired: reqUpper,
    earnedUpperMajorCredits: upperEarned,
    completedCodes,
    mode,
  };
  const current = {
    earnedCredits: draft.earnedCredits,
    earnedMajorCredits: draft.earnedMajorCredits,
    targetCredits: draft.targetCredits,
    completedCourseCodes: draft.completedCourseCodes,
    majorRequirement: draft.majorRequirement ?? null,
    earnedUpperMajorCredits: draft.earnedUpperMajorCredits ?? null,
  };
  const problem = importProblem(choice, current);
  const next = applyTranscriptImport(current, choice);
  const added = next.completedCourseCodes.filter((c) => !draft.completedCourseCodes.includes(c)).length;
  const removed = draft.completedCourseCodes.filter((c) => !next.completedCourseCodes.includes(c)).length;
  const unresolved = rows.filter((r) => r.group === "ambiguous" && r.status === "completed" && !r.chosen).length;

  const setRow = (id: string, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const apply = () => {
    setTried(true);
    if (problem || unresolved > 0) {
      const missing = earned === null ? earnedInput.current : major === null ? majorInput.current : null;
      missing?.scrollIntoView({ block: "center" });
      missing?.focus();
      return;
    }
    onApply(next, `가져오기 반영 — 과목 +${added}${removed ? ` −${removed}` : ""} · 총 ${next.earnedCredits}학점 · 전공 ${next.earnedMajorCredits}학점`);
  };

  if (!mounted) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto overscroll-contain bg-ink/40 p-6 print:hidden" role="presentation">
      <div
        ref={dialog}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="import-title"
        className="flex max-h-[calc(100dvh-48px)] w-[min(1100px,calc(100vw-48px))] min-h-0 flex-col rounded-[12px] border-[1.5px] border-ink bg-paper shadow-2xl outline-none"
      >
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-line px-7 py-5">
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

        <div className="grid min-h-0 flex-1 gap-8 overflow-y-auto px-7 py-6">
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
              <NumberField label="총 이수학점" value={earned} onChange={setEarned} found={result.earnedCredits} hint="포털 졸업사정·성적 조회의 취득학점 합계" required showError={tried && earned === null} inputRef={earnedInput} />
              <NumberField label="전공 이수학점" value={major} onChange={setMajor} found={result.earnedMajorCredits} hint="총학점에 포함 — 더하지 않아요" required showError={tried && major === null} inputRef={majorInput} />
              <NumberField label="목표(졸업 기준) 총학점" value={target} onChange={setTarget} found={result.targetCredits} hint="개인 졸업사정 값(모르면 비워 두세요)" />
            </div>
            {showMajorReq && (
              <>
                <h4 className="mt-5 mb-2 text-[15px] font-semibold">전공 요건(졸업사정 기준)</h4>
                <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4">
                  <NumberField label="전공학점 기준" value={reqMajor} onChange={setReqMajor} found={result.majorRequired} hint="졸업사정의 ‘전공학점’" />
                  <NumberField label="전공 100~300단위 기준" value={reqLower} onChange={setReqLower} found={result.majorLowerRequired} hint="졸업사정의 ‘전공 100~300단위’" />
                  <NumberField label="전공 400단위 기준" value={reqUpper} onChange={setReqUpper} found={result.majorUpperRequired} hint="졸업사정의 ‘전공 400단위’" />
                  <NumberField label="전공 400단위 이수학점" value={upperEarned} onChange={setUpperEarned} found={result.majorUpperEarned} hint="모르면 비워 두세요(이수 과목으로 추정)" />
                </div>
              </>
            )}
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

        <footer className="flex shrink-0 flex-wrap items-center justify-between gap-4 rounded-b-[12px] border-t border-line bg-paper px-7 py-4">
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
    </div>,
    document.body,
  );
}

type Pick4 = ReturnType<typeof applyTranscriptImport>;

function NumberField({ label, value, onChange, found, hint, required = false, showError = false, inputRef }: { label: string; value: number | null; onChange: (v: number | null) => void; found: DetectedValue[]; hint: string; required?: boolean; showError?: boolean; inputRef?: React.Ref<HTMLInputElement> }) {
  return (
    <label className={`grid min-w-0 gap-1.5 rounded-[8px] border p-4 ${required && value === null ? "border-red bg-red-soft/20" : "border-line"}`}>
      <span className="text-[14px] font-semibold">{label}{required && <span className="ml-1 text-[12px] text-red">필수</span>}</span>
      <span className="flex items-baseline gap-2">
        <input
          ref={inputRef}
          type="number"
          inputMode="numeric"
          min={0}
          max={250}
          aria-invalid={showError}
          value={value ?? ""}
          placeholder="직접 입력"
          onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
          className="!w-[140px] font-serif !text-[22px] font-bold tabular-nums"
        />
        <span className="text-[14px] text-ink-soft">학점</span>
      </span>
      <span className="text-[11px] text-muted">{hint}</span>
      {required && value === null && <span className="text-[12px] text-red">성적표에서 찾지 못했어요 — 직접 적어 주세요.</span>}
      {showError && <span role="alert" className="text-[12px] font-medium text-red">반영하려면 이 학점을 적어 주세요.</span>}
      {found.length > 0 && (
        <span className="text-[11px] break-words text-pen">
          성적표에서 찾은 값: {found.map((v) => `${v.value}(행 ${v.sourceRow + 1})`).join(", ")}
        </span>
      )}
    </label>
  );
}
