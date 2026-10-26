// Copia a public/ocr/ SOLO los recursos de Tesseract.js necesarios para
// reconocer texto en el navegador sin depender de CDN de terceros:
//   - worker.min.js                     (tesseract.js)
//   - tesseract-core-*lstm.wasm.js      (tesseract.js-core, variantes SIMD y no-SIMD, solo LSTM)
//   - lang/eng.traineddata.gz           (@tesseract.js-data/eng, modelo 4.0.0_best_int)
import { copyFileSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const root = process.cwd();
const out = join(root, 'public', 'ocr');

function pkgDir(name) {
  return dirname(require.resolve(`${name}/package.json`));
}

const files = [
  [join(pkgDir('tesseract.js'), 'dist', 'worker.min.js'), join(out, 'worker.min.js')],
  [join(pkgDir('tesseract.js-core'), 'tesseract-core-simd-lstm.wasm.js'), join(out, 'tesseract-core-simd-lstm.wasm.js')],
  [join(pkgDir('tesseract.js-core'), 'tesseract-core-lstm.wasm.js'), join(out, 'tesseract-core-lstm.wasm.js')],
  [join(pkgDir('@tesseract.js-data/eng'), '4.0.0_best_int', 'eng.traineddata.gz'), join(out, 'lang', 'eng.traineddata.gz')],
];

let total = 0;
for (const [from, to] of files) {
  if (!existsSync(from)) {
    console.error(`[ocr:assets] No se encuentra ${from}. ¿Has ejecutado npm install?`);
    process.exit(1);
  }
  mkdirSync(dirname(to), { recursive: true });
  copyFileSync(from, to);
  total += statSync(to).size;
}
console.log(`[ocr:assets] ${files.length} archivos copiados a public/ocr (${(total / 1024 / 1024).toFixed(1)} MB)`);
