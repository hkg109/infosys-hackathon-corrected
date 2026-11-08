// 브라우저 안 OCR(tesseract.js)에 필요한 파일을 public/ocr/로 복사한다.
// 외부 CDN 없이 오프라인으로 시연하기 위해서다. 결과물은 커밋하지 않는다(.gitignore).
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

const root = process.cwd();
const out = join(root, "public", "ocr");
const files = [
  ["node_modules/tesseract.js/dist/worker.min.js", "worker.min.js"],
  ["node_modules/tesseract.js-core/tesseract-core-lstm.wasm.js", "core/tesseract-core-lstm.wasm.js"],
  ["node_modules/tesseract.js-core/tesseract-core-simd-lstm.wasm.js", "core/tesseract-core-simd-lstm.wasm.js"],
  ["node_modules/tesseract.js-core/tesseract-core-relaxedsimd-lstm.wasm.js", "core/tesseract-core-relaxedsimd-lstm.wasm.js"],
  ["node_modules/@tesseract.js-data/kor/4.0.0_best_int/kor.traineddata.gz", "lang/kor.traineddata.gz"],
  ["node_modules/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz", "lang/eng.traineddata.gz"],
];
for (const [from, to] of files) {
  const src = join(root, from);
  if (!existsSync(src)) {
    console.warn(`[ocr] 없음: ${from} — 스크린샷 가져오기를 쓸 수 없어요. npm install을 확인하세요.`);
    continue;
  }
  const dest = join(out, to);
  mkdirSync(dirname(dest), { recursive: true });
  copyFileSync(src, dest);
}
console.log("[ocr] public/ocr 준비 완료");
