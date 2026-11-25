/* Tests for the OCR image preparation in recipe-card.js.
 *
 * Tesseract needs enough pixels and contrast for the thin print on a recipe
 * card, so every page is redrawn at about 2000 px on its long side (small
 * photos up to twice their size) in grey, contrasted, and split into black
 * and white at the Otsu threshold. A grey version stays available as a
 * fallback for pages with hard shadows.
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
  width: 300,
  height: 424,
  canvas: null,
  context: null,
  scaled: null,
  closed: false,
  pixels: null,
  written: null,
  blob: null,
  blobType: "",
  blobQuality: 0,
  readBack: true,
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
        drawImage(bitmap, ...args) {
          /* Either (x, y, w, h) or the source rectangle plus (x, y, w, h). */
          state.scaled =
            args.length >= 8
              ? { width: args[6], height: args[7] }
              : { width: args[2], height: args[3] };
        },
        getImageData() {
          if (!state.readBack) throw new Error("tainted");
          return { data: Uint8ClampedArray.from(state.pixels) };
        },
        putImageData(image) {
          state.written = image.data;
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
  `${source}\nthis.ocrPhoto = ocrPhoto;\nthis.ocrPhotoGrey = ocrPhotoGrey;\nthis.ocrTitleCrop = ocrTitleCrop;\nthis.ocrWithTitle = ocrWithTitle;`,
  vm.createContext(context)
);

/* One dark and one light tone, so Otsu has something to split. */
const PIXELS = [0, 0, 0, 255, 255, 255, 255, 255];

const reset = (width, height) => {
  state.width = width;
  state.height = height;
  state.canvas = null;
  state.context = null;
  state.scaled = null;
  state.closed = false;
  state.pixels = PIXELS.slice();
  state.written = null;
  state.blob = { type: "image/png", size: 1024 };
  state.blobType = "";
  state.blobQuality = 0;
  state.readBack = true;
};

const run = async () => {
  const file = { name: "seite.jpg" };

  // 1. A small phone photo is doubled, turned grey and split into pure black
  //    and white so thin print keeps a firm edge.
  reset(300, 424);
  const prepared = await context.ocrPhoto(file);
  assert.equal(state.canvas.width, 600);
  assert.equal(state.canvas.height, 848);
  assert.deepEqual(state.scaled, { width: 600, height: 848 });
  assert.equal(state.context.filter, "grayscale(1) contrast(1.6)");
  assert.equal(state.context.imageSmoothingEnabled, true);
  assert.equal(state.context.imageSmoothingQuality, "high");
  assert.deepEqual(
    Array.from(state.written || []),
    [0, 0, 0, 255, 255, 255, 255, 255]
  );
  assert.equal(state.blobType, "image/png");
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

  // 4. The grey fallback keeps the mid tones and stays a JPEG.
  reset(300, 424);
  const grey = await context.ocrPhotoGrey(file);
  assert.equal(state.written, null, "the grey version is not binarised");
  assert.equal(state.blobType, "image/jpeg");
  assert.equal(grey, state.blob);

  // 5. If the pixels cannot be read back (e.g. a tainted canvas), the grey
  //    image is returned instead of the unprocessed file.
  reset(300, 424);
  state.readBack = false;
  const unreadable = await context.ocrPhoto(file);
  assert.equal(unreadable, state.blob);
  assert.equal(state.blobType, "image/jpeg");

  // 6. Without a canvas the original file is used.
  reset(300, 424);
  const originalCreate = context.document.createElement;
  context.document.createElement = () => ({
    getContext: () => null,
    toBlob: () => {},
  });
  assert.equal(await context.ocrPhoto(file), file);
  context.document.createElement = originalCreate;

  // 7. A broken decoder also leaves the scan working with the original file.
  reset(300, 424);
  const originalBitmap = context.createImageBitmap;
  context.createImageBitmap = async () => {
    throw new Error("cannot decode");
  };
  assert.equal(await context.ocrPhoto(file), file);
  context.createImageBitmap = originalBitmap;

  // 6. The title pass reads only the upper 45 % of the page, at up to three
  //    times the size, and keeps the stronger contrast.
  reset(800, 1130);
  const crop = await context.ocrTitleCrop(file);
  assert.equal(state.canvas.width, 2400);
  assert.equal(state.canvas.height, 1527);
  assert.deepEqual(state.scaled, { width: 2400, height: 1527 });
  assert.equal(state.context.filter, "grayscale(1) contrast(1.8)");
  assert.equal(state.blobType, "image/png");
  assert.equal(state.closed, true);
  assert.equal(crop, state.blob);

  // 7. A large page is capped at 2600 px on its long side.
  reset(1200, 1700);
  await context.ocrTitleCrop(file);
  assert.equal(state.canvas.width, 2600);
  assert.equal(state.canvas.height, Math.round(765 * (2600 / 1200)));

  // 8. The crop title only fills a gap; a title from the page pass wins.
  const kept = context.ocrWithTitle({ title: "Omas Käsespätzle" }, "Anderer Titel");
  assert.equal(kept.title, "Omas Käsespätzle");
  const filled = context.ocrWithTitle(
    { title: "" },
    "SCHNELLER HIMBEER-KOKOS-QUARK\nFür 1 Portion"
  );
  assert.equal(filled.title, "Schneller Himbeer-Kokos-Quark");
  const stillEmpty = context.ocrWithTitle({ title: "" }, "Für 1 Portion");
  assert.equal(stillEmpty.title, "");

  // 9. A page that cannot be decoded leaves no crop to read.
  reset(800, 1130);
  context.createImageBitmap = async () => {
    throw new Error("cannot decode");
  };
  assert.equal(await context.ocrTitleCrop(file), null);
  context.createImageBitmap = originalBitmap;

  console.log("card_ocr_photo_test: 9 checks passed");
};

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
