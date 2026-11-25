# Gebündelte Texterkennung

Diese Dateien liegen absichtlich in der Integration, damit der Foto-Scanner
ohne Internet und ohne externen Dienst arbeitet. Es wird kein Foto und kein
Text übertragen; die Erkennung läuft im Browser (WebAssembly).

| Datei | Herkunft | Version | Lizenz |
| --- | --- | --- | --- |
| `tesseract.min.js` | [tesseract.js](https://github.com/naptha/tesseract.js) | 6.0.1 | Apache-2.0 |
| `worker.min.js` | tesseract.js | 6.0.1 | Apache-2.0 |
| `core/tesseract-core-simd-lstm.wasm.js` | [tesseract.js-core](https://github.com/naptha/tesseract.js-core) | 6.0.0 | Apache-2.0 |
| `lang/deu.traineddata` | [tessdata_fast](https://github.com/tesseract-ocr/tessdata_fast) | aktueller Stand | Apache-2.0 |

`core/tesseract-core-simd-lstm.wasm.js` enthält den WASM-Kern bereits
eingebettet; eine separate `.wasm`-Datei wird nicht geladen. Der Kern setzt
WebAssembly-SIMD voraus (Chrome/Edge ab 91, Safari ab 16.4, Firefox ab 89).

Der Quelltext der Projekte steht unter Apache License 2.0:
<https://www.apache.org/licenses/LICENSE-2.0>.
