/* Tests for the OCR image preparation in recipe-card.js.
 *
 * Tesseract needs enough pixels and contrast for the thin print on a recipe
 * card, so every page is redrawn at about 2000 px on its long side (small
 * photos up to twice their size) in grey and with more contrast.
 *
 * Run with: node tests/card_ocr_photo_test.js
 */

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const CARD = path.join(
  __dirname,
  "..",
  "custom_components",
  "recipe_box",
  "www",
  "recipe-card.js"
);
const source = fs.readFileSync(CARD, "utf8");

const state = {
  canvas: null,
  context: null,
  scaled: null,
  closed: false,
  blob: null,
  blobType: "",
  blobQuality: 0,
};

const makeCanvas = () => {
  const canvas = {
    width: 0,
    height: 0,
    getContext(kind) {
      assert.equal(kind, "2d");
      const context = {
        filter: "none",
        imageSmoothingEnabled: false,
        imageSmoothingQuality: "low",
        drawImage(bitmap, x, y, width, height) {
          state.scaled = { width, height };
        },
      };
      state.context = context;
      return context;
    },
    toBlob(resolve, type, quality) {
      state.blobType = type;
      state.blobQuality = quality;
      resolve(state.blob);
    },
  };
  state.canvas = canvas;
  return canvas;
};

const context = {
  console: { info() {} },
  HTMLElement: class {
    attachShadow() {
      return {};
    }
  },
  customElements: { get: () => undefined, define: () => {} },
  CustomEvent: class {},
  document: { createElement: () => makeCanvas() },
  setTimeout: () => 0,
  clearTimeout: () => {},
  window: { customCards: [] },
};
context.createImageBitmap = async () => ({
  width: state.width,
  height: state.height,
  close() {
    state.closed = true;
  },
});

vm.runInContext(
  `${source}\nthis.ocrPhoto = ocrPhoto;`,
  vm.createContext(context)
);

const reset = (width, height) => {
  state.width = width;
  state.height = height;
  state.canvas = null;
  state.context = null;
  state.scaled = null;
  state.closed = false;
  state.blob = { type: "image/jpeg", size: 1024 };
  state.blobType = "";
  state.blobQuality = 0;
};

const run = async () => {
  // 1. A small phone photo is doubled and turned into a grey, contrasted JPEG
  //    so thin print survives the scan.
  reset(300, 424);
  const file = { name: "seite.jpg" };
  const prepared = await context.ocrPhoto(file);
  assert.equal(state.canvas.width, 600);
  assert.equal(state.canvas.height, 848);
  assert.deepEqual(state.scaled, { width: 600, height: 848 });
  assert.equal(state.context.filter, "grayscale(1) contrast(1.6)");
  assert.equal(state.context.imageSmoothingEnabled, true);
  assert.equal(state.context.imageSmoothingQuality, "high");
  assert.equal(state.blobType, "image/jpeg");
  assert.equal(state.blobQuality, 0.95);
  assert.equal(state.closed, true, "the bitmap is released");
  assert.equal(prepared, state.blob);
  assert.notEqual(prepared, file);

  // 2. A normal 990 × 1400 photo is raised to 2000 px on its long side.
  reset(990, 1400);
  await context.ocrPhoto(file);
  assert.equal(state.canvas.width, 1414);
  assert.equal(state.canvas.height, 2000);

  // 3. Very large photos are still shrunk to the maximum side.
  reset(3000, 2000);
  await context.ocrPhoto(file);
  assert.equal(state.canvas.width, 2400);
  assert.equal(state.canvas.height, 1600);

  // 4. Without a canvas the original file is used.
  reset(300, 424);
  const originalCreate = context.document.createElement;
  context.document.createElement = () => ({
    getContext: () => null,
    toBlob: () => {},
  });
  assert.equal(await context.ocrPhoto(file), file);
  context.document.createElement = originalCreate;

  // 5. A broken decoder also leaves the scan working with the original file.
  reset(300, 424);
  const originalBitmap = context.createImageBitmap;
  context.createImageBitmap = async () => {
    throw new Error("cannot decode");
  };
  assert.equal(await context.ocrPhoto(file), file);
  context.createImageBitmap = originalBitmap;

  console.log("card_ocr_photo_test: 5 checks passed");
};

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
