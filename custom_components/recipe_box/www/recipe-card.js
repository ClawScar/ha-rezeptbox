/* Rezeptbox – Lovelace cards
 *
 * Detail card:
 *   type: custom:recipe-box-card
 *   entity: sensor.lasagne
 *
 * List card (all recipes, import new ones, click one to open it):
 *   type: custom:recipe-box-list
 *   title: Rezepte                # optional
 *   entities:                    # optional, defaults to all recipes
 *     - sensor.lasagne
 *     - sensor.curry
 *   show_image: true             # optional
 *   show_steps: true             # optional
 *   show_import: true            # optional, shows the import field (accepts multiple URLs)
 *   show_delete: true            # optional, shows the delete buttons
 *
 * The list card splits into three tabs: recipes (import, backup, search and
 * list), the form for an own recipe and the week plan.
 *
 * The detail view shows a -/+ control for the servings and rescales the
 * ingredient amounts live. The shopping list button passes the chosen
 * servings along, so the shopping list also gets the scaled amounts.
 */

const CARD_VERSION = "2.9.0-beta.7";
const DETAIL_TYPE = "recipe-box-card";
const LIST_TYPE = "recipe-box-list";
const PANEL_TYPE = "recipe-box-panel";
const INTEGRATION = "recipe_box";

/* The cards and the sidebar page follow Home Assistant's language: English
 * when it runs in English, German for everything else. tr() keeps both texts
 * next to each other at every call site, so none can be forgotten. */
let UI_LANG = "de";
let localizeCustomCards = null;
const tr = (de, en) => (UI_LANG === "en" ? en : de);
const uiLocale = () => (UI_LANG === "en" ? "en-GB" : "de-DE");
const uiCollator = () => (UI_LANG === "en" ? "en" : "de");
const setUiLanguage = (hass) => {
  const language = String((hass && hass.language) || "de").toLowerCase();
  const next = language.startsWith("en") ? "en" : "de";
  if (next === UI_LANG) return next;
  UI_LANG = next;
  if (localizeCustomCards) localizeCustomCards();
  return next;
};

const HTML_ESCAPES = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

const escapeHtml = (value) =>
  String(value ?? "").replace(/[&<>"']/g, (character) => HTML_ESCAPES[character]);

const formatMinutes = (value) => {
  const minutes = Number(value);
  if (!Number.isFinite(minutes) || minutes <= 0) return "";
  const hours = Math.floor(minutes / 60);
  const rest = Math.round(minutes % 60);
  const shortMin = tr("Min.", "min");
  if (!hours) return `${rest} ${shortMin}`;
  const shortHour = tr("Std.", "h");
  return rest
    ? `${hours} ${shortHour} ${rest} ${shortMin}`
    : `${hours} ${shortHour}`;
};

const formatRating = (value, count) => {
  const rating = Number(value);
  if (!Number.isFinite(rating) || rating <= 0) return "";
  const votes = Number(count);
  return `★ ${rating.toFixed(1)}${
    Number.isFinite(votes) && votes > 0 ? ` (${votes})` : ""
  }`;
};

const formatServings = (value) => {
  const servings = Number(value);
  if (!Number.isFinite(servings) || servings <= 0) return "";
  return `${servings} ${
    servings === 1 ? tr("Portion", "serving") : tr("Portionen", "servings")
  }`;
};

const FRACTION_TEXT = {
  "½": "1/2",
  "¼": "1/4",
  "¾": "3/4",
  "⅓": "1/3",
  "⅔": "2/3",
  "⅛": "1/8",
  "⅜": "3/8",
  "⅝": "5/8",
  "⅞": "7/8",
};

const UNITS = [
  "Messerspitze",
  "Päckchen",
  "Packungen",
  "Packung",
  "Portionen",
  "Portion",
  "Handvoll",
  "Scheiben",
  "Scheibe",
  "Stangen",
  "Stange",
  "Zweige",
  "Zweig",
  "Blätter",
  "Blatt",
  "Zehen",
  "Zehe",
  "Dosen",
  "Dose",
  "Gläser",
  "Glas",
  "Tassen",
  "Tasse",
  "Becher",
  "Würfel",
  "Stiele",
  "Stiel",
  "Stück",
  "Stk.",
  "Prisen",
  "Prise",
  "Bund",
  "Msp.",
  "EL",
  "TL",
  "kg",
  "mg",
  "ml",
  "cl",
  "dl",
  "cm",
  "g",
  "l",
  "cups",
  "cup",
  "tbsp",
  "tsp",
  "oz",
  "lb",
  "pinch",
];

const escapeRegExp = (value) =>
  String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const UNIT_PLURALS = {
  "Prise": "Prisen",
  "Messerspitze": "Messerspitzen",
  "Dose": "Dosen",
  "Packung": "Packungen",
  "Scheibe": "Scheiben",
  "Zehe": "Zehen",
  "Glas": "Gläser",
  "Tasse": "Tassen",
  "Blatt": "Blätter",
  "Zweig": "Zweige",
  "Stange": "Stangen",
  "Stiel": "Stiele",
  "Portion": "Portionen",
};

// Ingredient nouns that change between singular and plural with the amount.
// Keys are lowercase so compounds such as "Gemüsezwiebel" and "Süßkartoffel"
// keep working; only the head noun of an ingredient name is inflected, role
// text after a comma and the words before it stay untouched.
const INGREDIENT_PLURALS = {
  "ei": "eier",
  "zwiebel": "zwiebeln",
  "tomate": "tomaten",
  "kartoffel": "kartoffeln",
  "karotte": "karotten",
  "möhre": "möhren",
  "gurke": "gurken",
  "schote": "schoten",
  "schalotte": "schalotten",
  "zehe": "zehen",
  "apfel": "äpfel",
  "birne": "birnen",
  "banane": "bananen",
  "zitrone": "zitronen",
  "limette": "limetten",
  "orange": "orangen",
  "beere": "beeren",
  "kirsche": "kirschen",
  "pflaume": "pflaumen",
  "pfirsich": "pfirsiche",
  "aprikose": "aprikosen",
  "dattel": "datteln",
  "feige": "feigen",
  "aubergine": "auberginen",
  "kürbis": "kürbisse",
  "rübe": "rüben",
  "pastinake": "pastinaken",
  "pilz": "pilze",
  "champignon": "champignons",
  "olive": "oliven",
  "erbse": "erbsen",
  "bohne": "bohnen",
  "linse": "linsen",
  "mandel": "mandeln",
  "nuss": "nüsse",
  "semmel": "semmeln",
  "filet": "filets",
  "steak": "steaks",
  "chili": "chilis",
};

const INGREDIENT_SINGULARS = Object.fromEntries(
  Object.entries(INGREDIENT_PLURALS).map(([singular, plural]) => [plural, singular])
);

// Grammatical gender of the known ingredient nouns (m, f, n). It decides the
// strong adjective ending when portions shrink back to the singular
// ("2 ganze Äpfel" -> "1 ganzer Apfel", "2 kleine Eier" -> "1 kleines Ei").
const INGREDIENT_GENDERS = {
  "ei": "n",
  "zwiebel": "f",
  "tomate": "f",
  "kartoffel": "f",
  "karotte": "f",
  "möhre": "f",
  "gurke": "f",
  "schote": "f",
  "schalotte": "f",
  "zehe": "f",
  "apfel": "m",
  "birne": "f",
  "banane": "f",
  "zitrone": "f",
  "limette": "f",
  "orange": "f",
  "beere": "f",
  "kirsche": "f",
  "pflaume": "f",
  "pfirsich": "m",
  "aprikose": "f",
  "dattel": "f",
  "feige": "f",
  "aubergine": "f",
  "kürbis": "m",
  "rübe": "f",
  "pastinake": "f",
  "pilz": "m",
  "champignon": "m",
  "olive": "f",
  "erbse": "f",
  "bohne": "f",
  "linse": "f",
  "mandel": "f",
  "nuss": "f",
  "semmel": "f",
  "filet": "n",
  "steak": "n",
  "chili": "m",
};

const matchWordCase = (source, replacement) =>
  source[0] === source[0].toUpperCase()
    ? replacement[0].toUpperCase() + replacement.slice(1)
    : replacement;

const replaceWordEnding = (word, ending, replacement) => {
  const start = word.length - ending.length;
  return `${word.slice(0, start)}${matchWordCase(word.slice(start), replacement)}`;
};

const matchingForm = (word, plural) => {
  const key = word.toLowerCase();
  const forms = plural ? INGREDIENT_PLURALS : INGREDIENT_SINGULARS;
  for (const [ending, replacement] of Object.entries(forms)) {
    if (key === ending || (ending.length >= 4 && key.endsWith(ending))) {
      return { ending, replacement };
    }
  }
  return null;
};

const inflectedWord = (word, plural) => {
  const form = matchingForm(word, plural);
  return form ? replaceWordEnding(word, form.ending, form.replacement) : null;
};

const ingredientGender = (word, plural) => {
  const form = matchingForm(word, plural);
  if (!form) return null;
  return INGREDIENT_GENDERS[plural ? form.ending : form.replacement] || null;
};

// Strong adjective endings; in the plural they all become a plain "-e".
const STRONG_ADJECTIVE_ENDINGS = ["er", "es", "en", "em"];
const MODIFIER_ENDINGS = ["e", "er", "es", "en", "em"];
const GENDER_ENDINGS = { m: "er", f: "e", n: "es" };

const inflectModifier = (text, modifier, ending) => {
  const word = modifier[0];
  if (
    word.length < 4 ||
    word[0] !== word[0].toLowerCase() ||
    !MODIFIER_ENDINGS.some((suffix) => word.endsWith(suffix))
  ) {
    return text;
  }
  const strong = STRONG_ADJECTIVE_ENDINGS.some((suffix) => word.endsWith(suffix));
  const stem = word.slice(0, strong ? -2 : -1);
  if (!/^\p{L}+$/u.test(stem)) return text;
  const rest = text.slice(modifier.index + word.length);
  return `${text.slice(0, modifier.index)}${stem}${ending}${rest}`;
};

// The noun may stand alone ("Zwiebel"), at the end of a phrase with an
// adjective ("ganzer Apfel") or in front of a qualifier ("Zwiebel rot").
// The adjective follows the noun's gender when portions shrink again.
const inflectName = (name, plural) => {
  let headEnd = name.length;
  for (const separator of [",", ";", "("]) {
    const index = name.indexOf(separator);
    if (index !== -1) headEnd = Math.min(headEnd, index);
  }
  const head = name.slice(0, headEnd).trimEnd();
  const words = [...head.matchAll(/\S+/g)];
  for (let index = 0; index < words.length; index += 1) {
    const word = words[index];
    const inflected = inflectedWord(word[0], plural);
    if (inflected === null) continue;
    const text = `${name.slice(0, word.index)}${inflected}${name.slice(
      word.index + word[0].length
    )}`;
    if (!index) return text;
    let ending = "e";
    if (!plural) {
      const gender = ingredientGender(word[0], false);
      if (!gender) return text;
      ending = GENDER_ENDINGS[gender];
    }
    return inflectModifier(text, words[index - 1], ending);
  }
  return name;
};

// The original line stays untouched at the recipe's own amount, so a recipe
// that already says "2 Eier" is not rewritten. Going below two pluralizes back
// to the singular.
const displayName = (item, amount) => {
  const name = String((item && item.name) || "");
  if (!name) return name;
  const value = Number(amount ?? (item && item.amount));
  if (!Number.isFinite(value)) return name;
  if (value >= 2) return inflectName(name, true);
  const original = Number(item && item.amount);
  if (Number.isFinite(original) && original >= 2) return inflectName(name, false);
  return name;
};

const displayUnit = (item, amount) => {
  const unit = String((item && item.unit) || "");
  const plural = UNIT_PLURALS[unit];
  if (!plural) return unit;
  const value = Number(amount ?? (item && item.amount));
  return Number.isFinite(value) && value >= 2 ? plural : unit;
};

const UNIT_PATTERN = [...UNITS]
  .sort((first, second) => second.length - first.length)
  .map(escapeRegExp)
  .join("|");

const AMOUNT_TOKEN = "\\d+\\s+\\d+\\/\\d+|\\d+\\/\\d+|\\d+(?:[.,]\\d+)?";
const INGREDIENT_LINE_RE = new RegExp(
  `^(?<amount>${AMOUNT_TOKEN})` +
    `(?:\\s*(?:-|–|bis)\\s*(?<amountMax>${AMOUNT_TOKEN}))?` +
    `\\s*(?:(?<unit>${UNIT_PATTERN})\\.?(?=\\s|$)\\s*)?` +
    "(?<name>.+)$",
  "i"
);

const normalizeFractions = (value) =>
  String(value ?? "")
    .replace(/[½¼¾⅓⅔⅛⅜⅝⅞]/g, (character) => ` ${FRACTION_TEXT[character]}`)
    .replace(/\s+/g, " ")
    .trim();

const parseAmountValue = (value) => {
  const text = String(value ?? "")
    .trim()
    .replace(",", ".");
  const mixed = text.match(/^(\d+)\s+(\d+)\/(\d+)$/);
  if (mixed) {
    const denominator = Number(mixed[3]);
    return denominator ? Number(mixed[1]) + Number(mixed[2]) / denominator : null;
  }
  const fraction = text.match(/^(\d+)\/(\d+)$/);
  if (fraction) {
    const denominator = Number(fraction[2]);
    return denominator ? Number(fraction[1]) / denominator : null;
  }
  const number = Number(text);
  return Number.isFinite(number) && number > 0 ? number : null;
};

const formatAmountValue = (value) =>
  String(Math.round(Number(value) * 100) / 100).replace(".", ",");

const parseIngredientLine = (text, group = "") => {
  const source = normalizeFractions(String(text ?? "").trim());
  const item = {
    amount: null,
    amount_max: null,
    amount_text: "",
    unit: "",
    name: source,
    usage: "",
    text: String(text ?? "").trim(),
    group,
  };
  const match = source.match(INGREDIENT_LINE_RE);
  if (!match) return item;

  const amount = parseAmountValue(match.groups.amount);
  if (amount === null) return item;

  item.amount = amount;
  item.amount_text = formatAmountValue(amount);
  const amountMax = parseAmountValue(match.groups.amountMax);
  if (amountMax !== null && amountMax > amount) item.amount_max = amountMax;
  item.unit = (match.groups.unit || "").trim();
  item.name = (match.groups.name || "").trim() || source;
  return item;
};

const ingredientText = (item, amountText, unit, amount) => {
  const text = amountText ?? (item && item.amount_text) ?? "";
  const display = unit === undefined ? displayUnit(item) : unit;
  const line = [text, display, displayName(item, amount)]
    .filter(Boolean)
    .join(" ");
  const usage = String((item && item.usage) || "");
  if (!usage || !line) return line || String((item && item.text) || "");
  return usage.startsWith(",") || usage.startsWith(";")
    ? `${line}${usage}`
    : `${line}, ${usage}`;
};

const scaleIngredient = (item, factor) => {
  const amount = Number(item && item.amount);
  const scale = Number(factor);
  if (!Number.isFinite(amount) || amount <= 0 || !Number.isFinite(scale) || scale <= 0) {
    return ingredientText(item);
  }
  if (Math.abs(scale - 1) < 1e-9) {
    return String((item && item.text) || ingredientText(item));
  }
  const scaled = amount * scale;
  let amountText = formatAmountValue(scaled);
  let largest = scaled;
  const amountMax = Number(item.amount_max);
  if (Number.isFinite(amountMax) && amountMax > amount) {
    const scaledMax = amountMax * scale;
    amountText = `${amountText}–${formatAmountValue(scaledMax)}`;
    largest = Math.max(largest, scaledMax);
  }
  return ingredientText(item, amountText, displayUnit(item, largest), largest);
};

const structuredIngredients = (attributes) => {
  const structured = Array.isArray(attributes.ingredients_structured)
    ? attributes.ingredients_structured.filter(
        (item) => item && typeof item === "object"
      )
    : [];
  if (structured.length) return structured;

  return (Array.isArray(attributes.ingredients) ? attributes.ingredients : [])
    .filter(Boolean)
    .map((text) => parseIngredientLine(String(text)));
};

const SESSION_PREFIX = "recipe_box:session:";

const isWebUrl = (value) => /^https?:\/\//i.test(String(value || ""));

const readSession = (entityId) => {
  try {
    const raw = window.localStorage.getItem(`${SESSION_PREFIX}${entityId}`);
    const data = raw ? JSON.parse(raw) : null;
    return data && typeof data === "object" ? data : {};
  } catch (error) {
    return {};
  }
};

const loadSession = (entityId) => {
  const data = readSession(entityId);
  const servings = Number(data.servings);
  return {
    servings: Number.isFinite(servings) && servings > 0 ? servings : null,
    checked: new Set(
      Array.isArray(data.checked) ? data.checked.map((item) => String(item)) : []
    ),
  };
};

const writeSession = (entityId, session) => {
  try {
    window.localStorage.setItem(
      `${SESSION_PREFIX}${entityId}`,
      JSON.stringify({
        servings: session.servings || null,
        checked: [...session.checked],
      })
    );
  } catch (error) {
    /* localStorage may be unavailable (private mode); the session is kept in memory */
  }
};

const TIMERS = new Map();
const TIMER_RE =
  /(\d+(?:[.,]\d+)?)\s*(Minuten?|Min\.?|Stunden?|Std\.?|Sekunden?|Sek\.?)/gi;

const stepTimers = (text) => {
  const minutes = [];
  for (const match of String(text || "").matchAll(TIMER_RE)) {
    let value = Number(String(match[1]).replace(",", "."));
    const unit = match[2].toLowerCase();
    if (unit.startsWith("std") || unit.startsWith("stunde")) value *= 60;
    else if (unit.startsWith("sek")) value /= 60;
    if (Number.isFinite(value) && value >= 1 && value <= 600) {
      minutes.push(Math.round(value));
    }
  }
  return [...new Set(minutes)].slice(0, 2);
};

const timerLabel = (remaining) => {
  const total = Math.max(0, Math.ceil(remaining / 1000));
  const minutes = String(Math.floor(total / 60)).padStart(2, "0");
  const seconds = String(total % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
};

const beep = () => {
  try {
    const Audio = window.AudioContext || window.webkitAudioContext;
    if (!Audio) return;
    const context = new Audio();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.frequency.value = 880;
    gain.gain.value = 0.08;
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    setTimeout(() => {
      oscillator.stop();
      context.close();
    }, 600);
  } catch (error) {
    /* sound is a bonus, timers work without it */
  }
};

const timerKey = (entityId, index, minutes) => `${entityId}|${index}|${minutes}`;

const startStepTimer = (entityId, index, minutes, button) => {
  const key = timerKey(entityId, index, minutes);
  const running = TIMERS.get(key);
  if (running) {
    clearInterval(running.interval);
    TIMERS.delete(key);
    if (button) button.textContent = `⏱ ${minutes} ${tr("Min.", "min")}`;
    return;
  }

  const endsAt = Date.now() + minutes * 60000;
  const tick = () => {
    const left = endsAt - Date.now();
    if (left <= 0) {
      clearInterval(interval);
      TIMERS.delete(key);
      if (button) button.textContent = tr("Fertig ✓", "Done ✓");
      beep();
      return;
    }
    if (button) button.textContent = `⏱ ${timerLabel(left)}`;
  };
  const interval = setInterval(tick, 1000);
  TIMERS.set(key, { endsAt, interval });
  tick();
};

const restoreTimers = (root, entityId) => {
  root.querySelectorAll("button.step-timer").forEach((button) => {
    const index = Number(button.getAttribute("data-timer"));
    const minutes = Number(button.getAttribute("data-minutes"));
    const running = TIMERS.get(timerKey(entityId, index, minutes));
    if (running && running.endsAt > Date.now()) {
      button.textContent = `⏱ ${timerLabel(running.endsAt - Date.now())}`;
    }
  });
};

const nutritionHtml = (attributes) => {
  const nutrition = attributes.nutrition;
  if (!nutrition || typeof nutrition !== "object") return "";
  const rows = Object.entries(nutrition)
    .filter(([, value]) => value)
    .slice(0, 8);
  if (!rows.length) return "";
  return `<div class="section"><h3>${tr("Nährwerte", "Nutrition")}</h3><div class="nutrition">${rows
    .map(
      ([label, value]) =>
        `<span><b>${escapeHtml(label)}</b> ${escapeHtml(value)}</span>`
    )
    .join("")}</div></div>`;
};

const updateHintHtml = (attributes) => {
  const error = String((attributes && attributes.update_error) || "");
  if (!error) return "";
  return `<p class="error">${tr(
    "Letzter Abruf fehlgeschlagen",
    "Last refresh failed"
  )} (${escapeHtml(error)}). ${tr(
    "Angezeigt wird die gespeicherte Version.",
    "Showing the saved version."
  )}</p>`;
};

const mealPlanEntries = (hass) => {
  for (const state of Object.values((hass && hass.states) || {})) {
    const attributes = state.attributes || {};
    if (Array.isArray(attributes.plan) && !attributes.source_url) {
      return attributes.plan;
    }
  }
  return [];
};

const isoDate = (date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate()
  ).padStart(2, "0")}`;

const weekDays = (count = 7, offset = 0) => {
  const today = new Date();
  const days = [];
  for (let index = 0; index < count; index += 1) {
    const shift = offset + index;
    const date = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate() + shift
    );
    days.push({
      iso: isoDate(date),
      isToday: shift === 0,
      label: date.toLocaleDateString(uiLocale(), {
        weekday: "short",
        day: "2-digit",
        month: "2-digit",
      }),
    });
  }
  return days;
};

const rangeDayLabel = (iso) => {
  const date = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(date.getTime())) return String(iso || "");
  return date.toLocaleDateString(uiLocale(), {
    day: "2-digit",
    month: "2-digit",
  });
};

const planRangeLabel = (offset = 0) => {
  const days = weekDays(7, offset);
  return `${rangeDayLabel(days[0].iso)} – ${rangeDayLabel(days[6].iso)}`;
};

/* The plan window starts today. Scrolling back is limited to the oldest
 * planned day, so the arrows never wander into empty months. */
const planOffsetBounds = (entries = []) => {
  const today = isoDate(new Date());
  let min = 0;
  for (const entry of entries) {
    const date = String((entry && entry.date) || "");
    if (!date || date >= today) continue;
    const days = Math.round(
      (new Date(`${date}T12:00:00`) - new Date(`${today}T12:00:00`)) /
        86400000
    );
    min = Math.min(min, Math.floor(days / 7) * 7);
  }
  return { min, max: 84 };
};

const stepPlanOffset = (offset, step, entries) => {
  const { min, max } = planOffsetBounds(entries);
  return Math.max(min, Math.min(max, offset + step));
};

/* Days without a recipe: the plan should also allow leftovers or eating out. */
const PLAN_NOTES = [
  {
    id: "leftovers",
    icon: "mdi:recycle",
    label: () => tr("Reste", "Leftovers"),
  },
  {
    id: "away",
    icon: "mdi:silverware-fork-knife",
    label: () => tr("Auswärts", "Eating out"),
  },
];

const noteOptionValue = (id) => `note:${id}`;

const noteFromValue = (value) =>
  PLAN_NOTES.find((note) => noteOptionValue(note.id) === String(value || "")) ||
  null;

const noteForLabel = (label) =>
  PLAN_NOTES.find((note) => note.label() === String(label || "")) || null;

const planEntryLabel = (entry) =>
  String((entry && (entry.label || entry.title)) || "");

const planCallData = (date, entityId, context = {}) => {
  const note = noteFromValue(entityId);
  if (note) {
    return { service: "plan_recipe", data: { date, label: note.label() } };
  }
  if (!entityId) return { service: "clear_meal_plan", data: { date } };
  return { service: "plan_recipe", data: { date, entity_id: entityId } };
};

const planNotice = (date, entityId, context = {}) => {
  const note = noteFromValue(entityId);
  if (!entityId) return tr("Tag geleert.", "Day cleared.");
  const label = shortDayLabel(date);
  const replaces = String(context.replaces || "");
  if (replaces) {
    return tr(
      `${label}: ${replaces} ersetzt.`,
      `${label}: replaced ${replaces}.`
    );
  }
  if (note) {
    return tr(
      `${label}: ${note.label()} eingetragen.`,
      `${label}: ${note.label()} added.`
    );
  }
  return tr(`Für ${label} eingeplant.`, `Planned for ${label}.`);
};

/* The planned weekdays of one recipe, shown in its row in the recipe list. */
const upcomingPlanDates = (hass, sourceUrl, limit = 3) => {
  const today = isoDate(new Date());
  const source = String(sourceUrl || "");
  if (!source) return [];
  const dates = mealPlanEntries(hass)
    .filter(
      (entry) =>
        String(entry.date || "") >= today &&
        String(entry.source_url || "") === source
    )
    .map((entry) => String(entry.date))
    .sort();
  if (!dates.length) return [];
  const labels = dates.slice(0, limit).map(dayChipLabel);
  if (dates.length > limit) labels.push(`+${dates.length - limit}`);
  return labels;
};

const RANDOM_HISTORY_KEY = "recipe_box:random";

/* Favorites are stored by the integration, so every browser and user of this
 * Home Assistant installation sees the same stars. */
const favoritesFromEntries = (entries) => {
  const favorites = new Set();
  (entries || []).forEach(({ state }) => {
    const attributes = (state && state.attributes) || {};
    if (!attributes.favorite) return;
    const url = String(attributes.source_url || "");
    if (url) favorites.add(url);
  });
  return favorites;
};

const readRandomHistory = () => {
  try {
    const raw = JSON.parse(
      window.localStorage.getItem(RANDOM_HISTORY_KEY) || "[]"
    );
    return Array.isArray(raw) ? raw.map(String).filter(Boolean) : [];
  } catch (error) {
    return [];
  }
};

const rememberRandomPick = (sourceUrl) => {
  const key = String(sourceUrl || "");
  if (!key) return [];
  const history = [
    key,
    ...readRandomHistory().filter((item) => item !== key),
  ].slice(0, 20);
  try {
    window.localStorage.setItem(RANDOM_HISTORY_KEY, JSON.stringify(history));
  } catch (error) {
    /* no persistence, the pick still works */
  }
  return history;
};

/* "Was kochen?" prefers favorites and avoids the last few suggestions. */
const pickRandomEntry = (pool, favorites, history, random = Math.random) => {
  if (!pool.length) return null;
  const recent = new Set(history.slice(0, 3));
  const sourceOf = (entry) =>
    String(((entry && entry.state && entry.state.attributes) || {}).source_url || "");
  let candidates = pool.filter((entry) => !recent.has(sourceOf(entry)));
  if (!candidates.length) candidates = pool;
  const weights = candidates.map((entry) =>
    favorites.has(sourceOf(entry)) ? 3 : 1
  );
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  let roll = random() * total;
  for (let index = 0; index < candidates.length; index += 1) {
    roll -= weights[index];
    if (roll < 0) return candidates[index];
  }
  return candidates[candidates.length - 1];
};

const filterBarHtml = (entries, filter) => {
  const tags = [
    ...new Set(
      entries.flatMap(({ state }) =>
        ((state.attributes || {}).tags || []).filter(Boolean)
      )
    ),
  ].sort((first, second) => first.localeCompare(second, uiCollator()));
  const tagOptions = tags
    .map(
      (tag) =>
        `<option value="${escapeHtml(tag)}"${
          filter.tag === tag ? " selected" : ""
        }>${escapeHtml(tag)}</option>`
    )
    .join("");
  return `<div class="filter-bar">
    <input class="filter-search" type="search" placeholder="${tr("Rezepte durchsuchen", "Search recipes")}" value="${escapeHtml(
      filter.query
    )}">
    <button class="filter-favorites${
      filter.onlyFavorites ? " active" : ""
    }" type="button" aria-pressed="${Boolean(
      filter.onlyFavorites
    )}" title="${
      filter.onlyFavorites
        ? tr("Alle Rezepte anzeigen", "Show all recipes")
        : tr("Nur Favoriten anzeigen", "Show favorites only")
    }"><ha-icon icon="${
      filter.onlyFavorites ? "mdi:star" : "mdi:star-outline"
    }"></ha-icon>${tr("Nur Favoriten", "Favorites only")}</button>
    ${
      tags.length
        ? `<select class="filter-tag"><option value="">${tr("Alle Tags", "All tags")}</option>${tagOptions}</select>`
        : ""
    }
    <select class="filter-time">
      <option value="">${tr("Beliebige Zeit", "Any time")}</option>
      <option value="30"${filter.maxTime === "30" ? " selected" : ""}>${tr("bis 30 Min.", "up to 30 min")}</option>
      <option value="60"${filter.maxTime === "60" ? " selected" : ""}>${tr("bis 60 Min.", "up to 60 min")}</option>
    </select>
    <select class="filter-sort">
      <option value="title"${filter.sort === "title" ? " selected" : ""}>A–Z</option>
      <option value="time"${filter.sort === "time" ? " selected" : ""}>${tr("Schnellste zuerst", "Fastest first")}</option>
    </select>
    <button class="random" type="button">${tr("Was kochen?", "What to cook?")}</button>
  </div>`;
};

const isManualSource = (source) =>
  String(source || "").startsWith("manual://");

/* HEIC is the default photo format on iPhones. Safari can convert it, other
 * browsers cannot, and Home Assistant only stores JPEG, PNG and GIF. */
const heicPhotoMessage = () =>
  tr(
    "HEIC-Fotos kann dieser Browser nicht umwandeln. Bitte das Foto als JPG speichern oder direkt mit der Handy-Kamera aufnehmen.",
    "This browser cannot convert HEIC photos. Save the photo as JPG or take it with the phone camera."
  );

const looksHeic = (file) => {
  const type = String((file && file.type) || "").toLowerCase();
  const name = String((file && file.name) || "").toLowerCase();
  return (
    type === "image/heic" ||
    type === "image/heif" ||
    /\.(heic|heif)$/.test(name)
  );
};

/* Home Assistant rejects service calls with plain objects such as
 * {error, status_code, body} instead of Error instances, which used to leave
 * the user with an empty message. */
const errorText = (error) => {
  if (error === null || error === undefined) return "";
  if (typeof error === "string" || typeof error === "number") {
    return String(error);
  }
  const parts = [error.message, error.error, error.code]
    .filter((part) => typeof part === "string" || typeof part === "number")
    .map(String)
    .filter(Boolean);
  const text = [...new Set(parts)].join(": ");
  const status = error.status || error.status_code;
  if (typeof status === "number" && !text.includes(String(status))) {
    return [text, status].filter(Boolean).join(": ");
  }
  return text;
};

const photoErrorMessage = (error, file) => {
  if (looksHeic(file)) return heicPhotoMessage();
  const raw = errorText(error).trim();
  if (/413|too large|payload/i.test(raw)) {
    return tr(
      "Das Foto ist zu groß (maximal 10 MB).",
      "The photo is too large (10 MB maximum)."
    );
  }
  if (/404|not found/i.test(raw)) {
    return tr(
      "Home Assistant nimmt keine Fotos an. Bitte die Integration 'image_upload' aktivieren.",
      "Home Assistant is not accepting photos. Enable the 'image_upload' integration."
    );
  }
  if (/401|403|unauthori|forbidden/i.test(raw)) {
    return tr(
      "Der Foto-Upload wurde abgelehnt. Bitte neu anmelden.",
      "The photo upload was refused. Please sign in again."
    );
  }
  if (/400|bad request|invalid/i.test(raw)) {
    return tr(
      "Dieses Bildformat wird nicht unterstützt. Bitte JPG oder PNG verwenden.",
      "This image format is not supported. Please use JPG or PNG."
    );
  }
  return raw || tr("Upload fehlgeschlagen", "Upload failed");
};

/* A backup stays importable when photos were cleaned up, but recipes whose
 * own photo is gone would restore with a broken image. */
const missingImageWarning = (data) => {
  const missing = Array.isArray(data && data.missing_images)
    ? data.missing_images.length
    : 0;
  if (!missing) return "";
  return tr(
    ` – Achtung: fehlende Fotos bei ${missing} ${
      missing === 1 ? "Rezept" : "Rezepten"
    }.`,
    ` – Warning: missing photos for ${missing} ${
      missing === 1 ? "recipe" : "recipes"
    }.`
  );
};

/* Downscale in the browser: keeps uploads small and turns phone photos
 * into a format every browser and Home Assistant can read. */
const shrinkPhoto = async (file) => {
  const max = 1600;
  let source = null;
  let objectUrl = null;
  try {
    if (typeof createImageBitmap === "function") {
      source = await createImageBitmap(file);
    } else if (
      typeof Image === "function" &&
      typeof URL !== "undefined" &&
      URL.createObjectURL
    ) {
      objectUrl = URL.createObjectURL(file);
      source = new Image();
      source.src = objectUrl;
      await source.decode();
    }
    if (!source || typeof document === "undefined" || !document.createElement) {
      return file;
    }
    const width = source.width || max;
    const height = source.height || max;
    const scale = Math.min(1, max / Math.max(width, height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const context = canvas.getContext && canvas.getContext("2d");
    if (!context || typeof canvas.toBlob !== "function") return file;
    context.drawImage(source, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.85)
    );
    return blob || file;
  } catch (error) {
    return file;
  } finally {
    if (source && typeof source.close === "function") source.close();
    if (objectUrl && typeof URL !== "undefined") URL.revokeObjectURL(objectUrl);
  }
};

const uploadError = async (response) => {
  const status = Number(response && response.status) || 0;
  let detail = "";
  try {
    if (response && typeof response.text === "function") {
      detail = String(await response.text()).trim().slice(0, 200);
    }
  } catch (error) {
    detail = "";
  }
  const raw = [
    status ? String(status) : "",
    detail || (response && response.statusText) || "",
  ]
    .filter(Boolean)
    .join(": ");
  return new Error(raw || tr("Upload fehlgeschlagen", "Upload failed"));
};

/* Home Assistant only stores jpeg, png and gif. Some Android pickers hand
 * out files without a MIME type, so derive it from the file name. */
const UPLOAD_CONTENT_TYPES = ["image/jpeg", "image/png", "image/gif"];

const CONTENT_TYPE_BY_EXTENSION = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
};

const photoBlobFor = (blob, name) => {
  const type = String((blob && blob.type) || "").toLowerCase();
  if (UPLOAD_CONTENT_TYPES.includes(type)) return blob;
  const source = String(name || (blob && blob.name) || "");
  const match = /\.([a-z0-9]+)$/i.exec(source);
  const guessed = match
    ? CONTENT_TYPE_BY_EXTENSION[match[1].toLowerCase()]
    : "";
  if (!guessed || typeof Blob !== "function") return blob;
  return new Blob([blob], { type: guessed });
};

const photoFileName = (base, blob) => {
  const type = String((blob && blob.type) || "").toLowerCase();
  const extension = type === "image/png" ? "png" : type === "image/gif" ? "gif" : "jpg";
  return `rezeptbox-${base}.${extension}`;
};

/* Home Assistant's own image upload uses fetchWithAuth with the FormData as
 * body. hass.callApi serialises its payload as JSON, which turns the multipart
 * body into an empty object, so it must never be used here. */
const postPhoto = (hass, form) => {
  if (hass && typeof hass.fetchWithAuth === "function") {
    return hass.fetchWithAuth("/api/image/upload", {
      method: "POST",
      body: form,
    });
  }
  const path = "/api/image/upload";
  const url = hass && typeof hass.hassUrl === "function" ? hass.hassUrl(path) : path;
  const token =
    hass && hass.auth && hass.auth.data && hass.auth.data.access_token;
  if (typeof fetch !== "function") {
    throw new Error(
      tr("Dieser Browser kann keine Fotos hochladen.", "This browser cannot upload photos.")
    );
  }
  return fetch(url, {
    method: "POST",
    body: form,
    credentials: "same-origin",
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
};

const uploadPhoto = async (hass, file, shrink = shrinkPhoto) => {
  const blob = await shrink(file);
  if (blob === file && looksHeic(file)) {
    throw new Error(heicPhotoMessage());
  }
  const base = String((file && file.name) || "rezept")
    .replace(/\.[^.]+$/, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .slice(0, 40) || "rezept";
  const part = photoBlobFor(blob, file && file.name);
  const form = new FormData();
  /* The prefix marks the upload as ours, so the cleanup never touches
   * profile photos or images from other integrations. */
  form.append("file", part, photoFileName(base, part));

  let response = null;
  try {
    response = await postPhoto(hass, form);
  } catch (error) {
    throw new Error(
      tr(
        `Netzwerkfehler beim Foto-Upload: ${errorText(error) || "unbekannt"}`,
        `Network error during the photo upload: ${errorText(error) || "unknown"}`
      )
    );
  }
  if (!response || !response.ok) {
    throw await uploadError(response);
  }

  let result = null;
  try {
    result = await response.json();
  } catch (error) {
    throw new Error(
      tr(
        "Die Antwort von Home Assistant war nicht lesbar.",
        "The answer from Home Assistant could not be read."
      )
    );
  }
  if (!result || !result.id) {
    throw new Error(
      tr(
        "Der Upload hat keine Bild-ID geliefert.",
        "The upload did not return an image id."
      )
    );
  }
  return `/api/image/serve/${result.id}/original`;
};

/* --------------------------------------------------------------------------
 * Photo scan
 *
 * Tesseract runs in the browser with the German language data that ships next
 * to this card. Nothing leaves the device and no AI service is involved; the
 * text is only a suggestion that the form below shows for correction.
 * ------------------------------------------------------------------------ */
const OCR_BASE = "/recipe_box/ocr/";
const OCR_INGREDIENT_HEADING =
  /^(zutaten(?:liste)?|ingredients|you need|f\u00fcr die zutaten(?:liste)?)\b/i;
const OCR_STEP_HEADING =
  /^(zubereitung|anleitung|schritte|zubereitungsschritte|instructions|directions|preparation|method|steps)\b/i;
const OCR_SKIP_HEADING =
  /^(tipps?|hinweise|n\u00e4hrwerte|nutrition|beilagen|serving suggestion)\b/i;
const OCR_SERVINGS =
  /(\d{1,2})\s*(?:portionen?|personen?|servings?|people)\b/i;
const OCR_FOR_SERVINGS = /\bf(?:\u00fc|u)r\s+(\d{1,2})\b/i;
const OCR_NUMBERED_STEP = /^\d{1,2}\s*[.)]\s*/;
/* A bullet or an amount marks an ingredient line, also when the page break
 * swallowed the "Zutaten" heading. Steps start with a number and a dot. */
const OCR_INGREDIENT_START =
  /^\s*(?:[\u2022*+\u00b0\u00ab\u00bb\u2039\u203a~^=]|[-\u2013\u2014]\s|\d+(?:[.,]\d+)?\s*(?:g|kg|ml|l|el|tl|prise|prisen|bund|p\u00e4ckchen|packung|packungen|dose|dosen|st\u00fcck|stk)\b)/i;

/* The small lines above the title: a time label with its value, a time range
 * or a printed checkbox row. None of that belongs in the recipe. */
const OCR_TIME_LABEL =
  /^(?:gesamtzeit|kochzeit|backzeit|garzeit|arbeitszeit|zubereitungszeit|ruhezeit|zeit|dauer|menge|portion|portionen|personen)$/i;
const OCR_TIME_LINE =
  /^\d+(?:\s*[-\u2013]\s*\d+)?\s*(?:min(?:uten)?|std\.?|stunden?|h|sek(?:unden)?)\b/i;
const OCR_LABEL_LINE = /^[\p{Lu}\p{N}\s&/()+=.-]{3,24}:[\s=]*$/u;
/* A printed label whose colon the scan dropped, e.g. a "GEWÜRZE" field. */
const OCR_SECTION_LABEL = /^(?:gew(?:\u00fc|ue)rze|gewuerze|topping|garnitur)$/i;
const OCR_OPTIONAL_LINE = /^(?:\d{1,2}\s+)?optional\b[:\s]/i;

const ocrClean = (line) =>
  String(line || "")
    .replace(/\u00ad/g, "")
    .replace(/\|/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();

/* Tesseract leaves the card's decorative marks behind: "\u2026 Skyr E",
 * "\u2026 3", "\u2026 Kokosraspeln -", "\u2026 geben. =". Those trailing
 * single letters, digits and symbols are not part of the text. */
const OCR_STRAY_TOKEN = /^(?:[A-Za-z\u00c0-\u00ff]|\d{1,2}|[-\u2013\u2014=+*\u00b7\u2022\u00ab\u00bb%|]+)$/u;

const ocrTidy = (line) => {
  const parts = ocrClean(line).replace(/\s+=\s+/g, " ").split(" ").filter(Boolean);
  while (parts.length && OCR_STRAY_TOKEN.test(parts[parts.length - 1])) parts.pop();
  return parts.join(" ").replace(/[\s,;:=\-\u2013\u2014]+$/, "");
};

const ocrHeading = (line) => {
  const text = ocrClean(line).replace(/[:.!,;]+$/, "");
  if (OCR_INGREDIENT_HEADING.test(text)) return "ingredients";
  if (OCR_STEP_HEADING.test(text)) return "instructions";
  if (OCR_SKIP_HEADING.test(text)) return "skip";
  return "";
};

/* Bullets are printed in many shapes and Tesseract returns some of them as
 * ``°`` or ``*``. They must not end up in the ingredient name. */
const ocrStripBullet = (line) =>
  ocrClean(line)
    .replace(
      /^[\u2022\u00b7*+\-\u2013\u2014\u00b0\u00ab\u00bb\u2039\u203a~^=]+\s*/,
      ""
    )
    .replace(/^o\s+/i, "")
    .trim();

/* Two-column ingredient lists come back as one line with both columns. */
const ocrSplitColumns = (line) => {
  const text = ocrClean(line);
  /* The middle dot is a separator in subtitles ("Hauptgericht · 4
   * Portionen"), not a bullet, so only real bullet shapes split a line.
   * Tesseract returns bullets as °, « or » depending on the print and the
   * browser build, so all of those count. */
  const marks = [
    ...text.matchAll(/[\u2022*+\u00b0\u00ab\u00bb\u2039\u203a~]\s+/g),
  ].map((match) => match.index);
  if (marks.length < 2) return [text];
  const parts = [];
  const lead = text.slice(0, marks[0]).trim();
  if (lead) parts.push(lead);
  for (let index = 0; index < marks.length; index += 1) {
    const end = index + 1 < marks.length ? marks[index + 1] : text.length;
    parts.push(text.slice(marks[index], end).trim());
  }
  return parts;
};

const ocrIsNoise = (line, title) => {
  const text = ocrClean(line);
  if (!text) return true;
  if (!/[a-zA-Z\u00e4\u00f6\u00fc\u00c4\u00d6\u00dc\u00df]/.test(text)) return true;
  if (/^\d{1,3}(\s*\/\s*\d{1,3})?$/.test(text)) return true;
  if (/^(seite|page)\s*\d+/i.test(text)) return true;
  if (/^\p{Lu}-\p{L}{1,2}$/u.test(text)) return true;
  /* Lines made of short letter fragments without any number, e.g.
   * "Ge Ge RL —FFE DE mn ZZ Ge ee FF EEE GE", come from the drawings. */
  const tokens = text.split(/\s+/).filter((token) => /[\p{L}\p{N}]/u.test(token));
  const letters = tokens.map((token) => (token.match(/\p{L}/gu) || []).length);
  const longest = letters.length ? Math.max(...letters) : 0;
  if (!/\d/.test(text) && tokens.length >= 4 && longest <= 4) return true;
  if (!/\d/.test(text) && tokens.length >= 3 && longest <= 2) return true;
  if (title) {
    const shorten = (value) =>
      value
        .toLowerCase()
        .replace(/\s*[\u2013-]\s*(seite|page)\s*\d+$/, "")
        .replace(/[^a-z\u00e4\u00f6\u00fc\u00df0-9]+/g, " ")
        .trim();
    if (shorten(text) === shorten(title)) return true;
  }
  return false;
};

const OCR_CHECKBOX_TOKEN = /^(?:ja|nein|x|\u2713|\u2610|\u25a1)$/i;
const ocrIsCheckboxRow = (line) => {
  const text = ocrClean(line);
  /* Tesseract often keeps stray marks: "% Ja RI Nein 5". */
  if (/\bja\b/i.test(text) && /\bnein\b/i.test(text) && text.length <= 24) {
    return true;
  }
  const words = text.split(/\s+/).filter(Boolean);
  if (!words.length || words.length > 4 || text.length > 24) return false;
  if (!words.every((word) => OCR_CHECKBOX_TOKEN.test(word))) return false;
  return words.some((word) => /^(?:ja|nein)$/i.test(word));
};

/* A line can start the ingredient list without a "Zutaten" heading: either
 * it has a bullet or an amount, or it is "2 Zwiebeln" without a unit. */
const ocrLooksLikeIngredient = (line) => {
  const text = ocrClean(line);
  if (OCR_INGREDIENT_START.test(text)) return true;
  if (!/^\d+(?:[.,]\d+)?\s+\p{L}/u.test(text)) return false;
  if (OCR_SERVINGS.test(text) || OCR_FOR_SERVINGS.test(text)) return false;
  if (OCR_TIME_LINE.test(text)) return false;
  return true;
};

/* Section labels such as a printed "GEWÜRZE:" field are not ingredients. */
const ocrSectionSkip = (line) => {
  const text = ocrClean(line);
  if (!text) return true;
  if (OCR_LABEL_LINE.test(text)) return true;
  if (OCR_SECTION_LABEL.test(text.replace(/[:\s]+$/, ""))) return true;
  if (ocrIsCheckboxRow(text)) return true;
  if (OCR_TIME_LINE.test(text) && !OCR_INGREDIENT_START.test(text)) return true;
  return false;
};

/* The title is the longest meaningful line of the header block. That beats
 * a collection name, the time label and the servings line above it. */
const ocrTitleScore = (line) => {
  const text = ocrClean(line);
  if (!text) return 0;
  const plain = text.replace(/[:\s'\u2019]+$/, "");
  if (OCR_TIME_LABEL.test(plain)) return 0;
  if (OCR_TIME_LINE.test(text)) return 0;
  if (OCR_SERVINGS.test(text) || OCR_FOR_SERVINGS.test(text)) return 0;
  if (ocrIsCheckboxRow(text)) return 0;
  if (OCR_LABEL_LINE.test(text)) return 0;
  return text.length;
};

/* Printed cards often use capitals; the form looks better with a normal
 * title. Mixed-case lines stay exactly as recognised. */
const ocrTitleCase = (value) => {
  const text = ocrClean(value);
  if (!text || /\p{Ll}/u.test(text)) return text;
  return text
    .toLowerCase()
    .replace(
      /(^|[\s\-\u2013/])(\p{L})/gu,
      (_match, lead, letter) => `${lead}${letter.toUpperCase()}`
    );
};

const ocrServings = (lines) => {
  for (const line of (lines || []).slice(0, 15)) {
    const match = OCR_SERVINGS.exec(line) || OCR_FOR_SERVINGS.exec(line);
    if (!match) continue;
    const value = Number(match[1]);
    if (Number.isFinite(value) && value > 0 && value <= 100) return value;
  }
  return null;
};

const ocrMergeIngredient = (list, line) => {
  const text = ocrTidy(ocrStripBullet(line));
  if (!text) return;
  const previous = list[list.length - 1];
  const wrapped = /^[a-z\u00e4\u00f6\u00fc\u00df]/.test(text) || /,$/.test(text);
  if (previous && wrapped) {
    list[list.length - 1] = `${previous} ${text}`;
    return;
  }
  list.push(text);
};

const ocrMergeStep = (list, line) => {
  const text = ocrTidy(line);
  if (!text) return;
  const numbered = OCR_NUMBERED_STEP.test(text);
  const value = numbered ? text.replace(OCR_NUMBERED_STEP, "") : text;
  const previous = list[list.length - 1];
  const wrapped =
    !numbered &&
    previous &&
    (/^[a-z\u00e4\u00f6\u00fc\u00df]/.test(value) || !/[.!?]$/.test(previous));
  if (wrapped) {
    list[list.length - 1] = `${previous} ${value}`;
    return;
  }
  if (value) list.push(value);
};

/* Join the OCR text of all photographed pages into one recipe draft.
 * Headings may repeat on later pages; they continue the same section. */
const ocrRecipeFromPages = (pages) => {
  const sources = (pages || []).map((page) => String(page || ""));
  const result = {
    title: "",
    servings: null,
    ingredients: [],
    instructions: [],
  };
  let section = "";
  let sawHeading = false;

  const headerLines = [];
  let titleDone = false;
  const flushTitle = () => {
    if (titleDone) return;
    titleDone = true;
    let best = "";
    let bestScore = 0;
    for (const line of headerLines) {
      const score = ocrTitleScore(line);
      if (score > bestScore) {
        best = line;
        bestScore = score;
      }
    }
    if (!best) return;
    result.title = ocrTitleCase(
      best.replace(/^(rezept|recipe)\s*[:\-]\s*/i, "").trim()
    );
    result.servings = result.servings || ocrServings(headerLines);
  };

  sources.forEach((page, pageIndex) => {
    const raw = page.split(/\r?\n/).map(ocrClean);
    const lines = [];
    for (let index = 0; index < raw.length; index += 1) {
      let line = raw[index];
      if (!line) continue;
      /* A hyphen at the line end joins the next line. Before a lowercase
       * word it is a word break ("Spätz- le"), before a capitalised word it
       * separates a compound ("Himbeer-Kokos-" + "Quark"). */
      while (/[a-z\u00e4\u00f6\u00fc\u00df]-$/i.test(line) && raw[index + 1]) {
        const next = raw[index + 1].replace(/^\s+/, "");
        line = /^\p{Lu}/u.test(next)
          ? `${line}${next}`
          : `${line.slice(0, -1)}${next}`;
        index += 1;
      }
      lines.push(line);
    }

    if (pageIndex > 0) flushTitle();

    for (const line of lines) {
      for (const part of ocrSplitColumns(line)) {
        const text = ocrClean(part);
        if (!text) continue;
        const bare = ocrStripBullet(text);
        if (!bare) continue;

        const heading = ocrHeading(bare);
        if (heading) {
          flushTitle();
          section = heading;
          sawHeading = true;
          continue;
        }
        if (ocrIsNoise(bare, result.title)) continue;
        if (section === "skip") continue;

        if (!section) {
          if (sawHeading) continue;
          /* A numbered line or a real ingredient line starts the recipe even
           * without a printed heading. */
          if (OCR_NUMBERED_STEP.test(bare)) {
            flushTitle();
            section = "instructions";
            ocrMergeStep(result.instructions, bare);
            continue;
          }
          if (ocrLooksLikeIngredient(bare)) {
            flushTitle();
            section = "ingredients";
            ocrMergeIngredient(result.ingredients, bare);
            continue;
          }
          /* Everything above the first real section is the title block:
           * title, collection name, time, servings and checkbox rows. The
           * best line becomes the title, the rest is dropped. */
          headerLines.push(bare);
          continue;
        }

        if (ocrSectionSkip(bare)) continue;

        if (section === "ingredients") {
          /* A numbered line starts the steps, even without a heading. */
          if (OCR_NUMBERED_STEP.test(bare)) {
            section = "instructions";
            ocrMergeStep(result.instructions, bare);
          } else if (!OCR_OPTIONAL_LINE.test(bare)) {
            /* "OPTIONAL: ETWAS SÜSSE" is a note, not an ingredient. */
            ocrMergeIngredient(result.ingredients, bare);
          }
        } else if (section === "instructions") {
          /* A new page may continue the ingredients without repeating the
           * heading; bullets and amounts give that away. */
          if (OCR_INGREDIENT_START.test(bare)) {
            section = "ingredients";
            ocrMergeIngredient(result.ingredients, bare);
          } else {
            ocrMergeStep(result.instructions, bare);
          }
        }
      }
    }

    flushTitle();
    if (!result.servings) result.servings = ocrServings(lines);
  });

  if (!result.servings && sources[0]) {
    result.servings = ocrServings(sources[0].split(/\r?\n/));
  }
  const withoutDuplicates = (list) =>
    list.filter((item, index) => item && item !== list[index - 1]);
  return {
    title: result.title,
    servings: result.servings,
    ingredients: withoutDuplicates(result.ingredients),
    instructions: withoutDuplicates(result.instructions),
  };
};

const ocrPagesHtml = (pages) =>
  (pages || [])
    .map(
      (file, index) => `<li class="ocr-page">
        <span class="ocr-page-no">${index + 1}</span>
        <span class="ocr-page-name">${escapeHtml(
          (file && file.name) || tr(`Seite ${index + 1}`, `Page ${index + 1}`)
        )}</span>
        ${
          index === 0
            ? `<span class="ocr-page-photo">${tr("Rezeptfoto", "Photo")}</span>`
            : ""
        }
        <button class="ocr-page-remove" type="button" data-index="${index}" title="${tr(
          "Seite entfernen",
          "Remove page"
        )}" aria-label="${tr("Seite entfernen", "Remove page")}">×</button>
      </li>`
    )
    .join("");

let ocrLoader = null;
const loadTesseract = () => {
  if (typeof window !== "undefined" && window.Tesseract) {
    return Promise.resolve(window.Tesseract);
  }
  if (ocrLoader) return ocrLoader;
  ocrLoader = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `${OCR_BASE}tesseract.min.js`;
    script.async = true;
    script.onload = () =>
      window.Tesseract
        ? resolve(window.Tesseract)
        : reject(new Error(tr("Tesseract fehlt.", "Tesseract is missing.")));
    script.onerror = () => {
      ocrLoader = null;
      reject(
        new Error(
          tr(
            "Die Texterkennung konnte nicht geladen werden.",
            "The text recognition could not be loaded."
          )
        )
      );
    };
    document.head.appendChild(script);
  });
  return ocrLoader;
};

/* Tesseract needs enough pixels per letter: the thin print on a recipe card
 * fades away when a phone shrinks the photo. Every page is therefore rendered
 * at about 2000 px on its long side, small photos up to twice their size, in
 * grey and with more contrast. The grey values are then split into black and
 * white at the threshold that best separates paper and print (Otsu), which
 * gives thin strokes a firm edge. */
const OCR_TARGET_SIDE = 2000;
const OCR_MAX_SIDE = 2400;

const ocrThreshold = (pixels) => {
  const histogram = new Array(256).fill(0);
  for (let index = 0; index < pixels.length; index += 4) {
    histogram[
      Math.round(
        pixels[index] * 0.299 +
          pixels[index + 1] * 0.587 +
          pixels[index + 2] * 0.114
      )
    ] += 1;
  }
  const total = pixels.length / 4;
  let sum = 0;
  for (let grey = 0; grey < 256; grey += 1) sum += grey * histogram[grey];
  let weightDark = 0;
  let sumDark = 0;
  let best = -1;
  let threshold = 128;
  for (let grey = 0; grey < 256; grey += 1) {
    weightDark += histogram[grey];
    if (!weightDark) continue;
    const weightLight = total - weightDark;
    if (!weightLight) break;
    sumDark += grey * histogram[grey];
    const meanDark = sumDark / weightDark;
    const meanLight = (sum - sumDark) / weightLight;
    const between = weightDark * weightLight * (meanDark - meanLight) ** 2;
    if (between > best) {
      best = between;
      threshold = grey;
    }
  }
  return threshold;
};

const ocrPhoto = async (file, maxSide = OCR_MAX_SIDE, binarize = true) => {
  if (
    typeof document === "undefined" ||
    typeof createImageBitmap !== "function" ||
    typeof document.createElement !== "function"
  ) {
    return file;
  }
  try {
    const bitmap = await createImageBitmap(file);
    const longest = Math.max(bitmap.width, bitmap.height);
    const scale =
      longest < OCR_TARGET_SIDE
        ? Math.min(2, OCR_TARGET_SIDE / longest)
        : Math.min(1, maxSide / longest);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext && canvas.getContext("2d");
    if (!context) {
      if (typeof bitmap.close === "function") bitmap.close();
      return file;
    }
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    if ("filter" in context) {
      context.filter = "grayscale(1) contrast(1.6)";
    }
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    if (typeof bitmap.close === "function") bitmap.close();

    let type = binarize ? "image/png" : "image/jpeg";
    if (binarize) {
      try {
        const image = context.getImageData(0, 0, canvas.width, canvas.height);
        const threshold = ocrThreshold(image.data);
        const pixels = image.data;
        for (let index = 0; index < pixels.length; index += 4) {
          const grey =
            pixels[index] * 0.299 +
            pixels[index + 1] * 0.587 +
            pixels[index + 2] * 0.114;
          const value = grey <= threshold ? 0 : 255;
          pixels[index] = value;
          pixels[index + 1] = value;
          pixels[index + 2] = value;
          pixels[index + 3] = 255;
        }
        context.putImageData(image, 0, 0);
      } catch (error) {
        /* Pages that cannot be read back stay grey; Tesseract handles them. */
        type = "image/jpeg";
      }
    }
    const blob = await new Promise((resolve) =>
      canvas.toBlob(resolve, type, 0.95)
    );
    return blob || file;
  } catch (error) {
    return file;
  }
};

/* A page with hard shadows can lose whole lines to a global threshold; the
 * scan falls back to this grey version when the black-and-white pass stays
 * empty. */
const ocrPhotoGrey = (file, maxSide = OCR_MAX_SIDE) =>
  ocrPhoto(file, maxSide, false);

const manualFormHtml = (edit = null, pages = []) => `<div class="manual data-section">
  <h3>${edit ? tr("Rezept bearbeiten", "Edit recipe") : tr("Eigenes Rezept", "Own recipe")}</h3>
  <p class="tab-hint">${edit
    ? tr(
        `Änderungen gelten für „${edit.title}“.`, 
        `Changes apply to “${edit.title}”.`
      )
    : tr(
        "Zutaten und Zubereitung je eine Zeile.",
        "One ingredient and one step per line."
      )}</p>
  <div class="scan">
    <div class="scan-bar">
      <button class="scan-add scan-pick" type="button">${tr("Fotos wählen", "Choose photos")}</button>
      <button class="ocr-run" type="button"${pages.length ? "" : " disabled"}>${tr(
        "Text erkennen",
        "Read text"
      )}</button>
      <button class="ocr-clear" type="button"${pages.length ? "" : " hidden"}>${tr(
        "Liste leeren",
        "Clear list"
      )}</button>
    </div>
    <p class="scan-hint">${tr(
      "Gedruckte Rezeptkarten, eine oder mehrere Seiten. Das erste Foto wird das Rezeptfoto; Handschrift erkennt der Scanner nicht.",
      "Printed recipe cards, one or more pages. The first photo becomes the recipe photo; the scanner cannot read handwriting."
    )}</p>
    <ol class="ocr-pages">${ocrPagesHtml(pages)}</ol>
    <p class="scan-status" role="status"></p>
  </div>
  <div class="manual-body">
    <input class="manual-title" type="text" value="${escapeHtml(
      edit ? edit.title : ""
    )}" placeholder="${tr("Titel", "Title")}">
    <input class="manual-servings" type="number" min="1" max="100" value="${
      edit && edit.servings ? edit.servings : ""
    }" placeholder="${tr("Portionen", "Servings")}">
    <textarea class="manual-ingredients" rows="3" placeholder="${tr(
      "Zutaten – eine pro Zeile",
      "Ingredients – one per line"
    )}">${escapeHtml(edit ? (edit.ingredients || []).join("\n") : "")}</textarea>
    <textarea class="manual-instructions" rows="3" placeholder="${tr(
      "Zubereitung – ein Schritt pro Zeile",
      "Steps – one per line"
    )}">${escapeHtml(edit ? (edit.instructions || []).join("\n") : "")}</textarea>
    <input class="manual-tags" type="text" value="${escapeHtml(
      edit ? (edit.tags || []).join(", ") : ""
    )}" placeholder="${tr(
      "Tags, mit Komma getrennt",
      "Tags, separated by commas"
    )}">
    <label class="manual-photo-label">${tr(
      "Foto hinzufügen (JPG/PNG, optional)",
      "Add a photo (JPG/PNG, optional)"
    )}<input class="manual-photo" type="file" accept="image/*"></label>
    <div class="manual-photo-preview" hidden>
      <img alt="${tr("Gewähltes Rezeptfoto", "Chosen recipe photo")}">
      <button class="manual-photo-remove" type="button">${tr(
        "Foto entfernen",
        "Remove photo"
      )}</button>
    </div>
    <div class="manual-actions">
      <button class="manual-save" type="button">${edit
        ? tr("Rezept aktualisieren", "Update recipe")
        : tr("Rezept speichern", "Save recipe")}</button>
      ${edit
        ? `<button class="manual-cancel" type="button">${tr(
            "Abbrechen",
            "Cancel"
          )}</button>`
        : ""}
    </div>
  </div>
</div>`;

const TABS = [
  { id: "recipes", label: () => tr("Rezepte", "Recipes") },
  { id: "plan", label: () => tr("Wochenplan", "Meal plan") },
  { id: "data", label: () => tr("Daten", "Data") },
];

const tabsHtml = (active) => `<div class="tabs" role="tablist">${TABS.map(
  (tab) => `<button class="tab${active === tab.id ? " active" : ""}" type="button" role="tab" aria-selected="${active === tab.id}" data-tab="${tab.id}">${escapeHtml(tab.label())}</button>`
).join("")}</div>`;

const TAB_PREFIX = "recipe_box:tab:";
const GROUP_PREFIX = "recipe_box:group:";

const knownTab = (value) => TABS.some((tab) => tab.id === value);

const entityKey = (entities) => {
  const list = (Array.isArray(entities) ? entities : [])
    .filter(Boolean)
    .map((entityId) => String(entityId))
    .sort();
  return list.length ? list.join("|") : "all";
};

const tabStorageKey = (entities) => `${TAB_PREFIX}${entityKey(entities)}`;
const groupStorageKey = (entities) => `${GROUP_PREFIX}${entityKey(entities)}`;

/* The list remembers the last tab per card, so a reload does not jump back. */
const readTab = (entities) => {
  try {
    const value = window.localStorage.getItem(tabStorageKey(entities));
    return knownTab(value) ? value : "recipes";
  } catch (error) {
    return "recipes";
  }
};

const writeTab = (entities, tab) => {
  if (!knownTab(tab)) return;
  try {
    window.localStorage.setItem(tabStorageKey(entities), tab);
  } catch (error) {
    /* localStorage may be unavailable (private mode); the tab stays for this session */
  }
};

/* The sidebar panel maps its tab and the open recipe to the URL, so the
 * browser and the phone's back button step through them. */
const VIEW_TABS = new Set(TABS.map((tab) => tab.id));

const viewFromPath = (path) => {
  const parts = String(path || "")
    .replace(/^\/+|\/+$/g, "")
    .split("/")
    .filter(Boolean);
  if (parts[0] === "recipe" && parts[1]) {
    let selected = parts[1];
    try {
      selected = decodeURIComponent(selected);
    } catch (error) {
      /* keep the raw entity id */
    }
    return { tab: "recipes", selected };
  }
  if (VIEW_TABS.has(parts[0])) return { tab: parts[0], selected: null };
  return { tab: "recipes", selected: null };
};

const viewPath = (base, view) => {
  const root = `/${String(base || "").replace(/^\/+|\/+$/g, "")}`;
  const tab = view && VIEW_TABS.has(view.tab) ? view.tab : "recipes";
  if (view && view.selected) {
    return `${root}/recipe/${encodeURIComponent(view.selected)}`;
  }
  return tab === "recipes" ? root : `${root}/${tab}`;
};

/* The chosen group is remembered per card as well; "" is the "Alle" tab. */
const readGroup = (entities) => {
  try {
    return window.localStorage.getItem(groupStorageKey(entities)) || "";
  } catch (error) {
    return "";
  }
};

const writeGroup = (entities, group) => {
  try {
    window.localStorage.setItem(groupStorageKey(entities), String(group || ""));
  } catch (error) {
    /* localStorage may be unavailable (private mode); the group stays for this session */
  }
};

/* The chips under a recipe use the weekday plus the day of the month, so
 * seven of them fit next to each other on a phone. */
const dayChipLabel = (iso) => {
  const date = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(date.getTime())) return String(iso || "");
  return date
    .toLocaleDateString(uiLocale(), { weekday: "short", day: "2-digit" })
    .replace(/[.,]/g, "")
    .replace(/\s+/g, " ")
    .trim();
};

const shortDayLabel = (iso) => {
  const date = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(date.getTime())) return String(iso || "");
  return date.toLocaleDateString(uiLocale(), {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
  });
};

/* The strip under a recipe in the list: one tap plans it for that day. Days
 * that already have a recipe say so, so replacing is a visible choice, and
 * the recipe's own days stay filled. */
const planDayStripHtml = (
  entityId,
  plannedByDate,
  titleBySource,
  sourceUrl = ""
) =>
  `<div class="day-strip" role="group" aria-label="${tr(
    "Tag wählen",
    "Choose a day"
  )}">${weekDays()
    .map((day) => {
      const entry = plannedByDate.get(day.iso);
      const entryUrl = String((entry && entry.source_url) || "");
      const plannedTitle = entry
        ? String(planEntryLabel(entry)) ||
          titleBySource.get(entryUrl) ||
          ""
        : "";
      const mine = Boolean(entryUrl) && entryUrl === String(sourceUrl || "");
      const label = dayChipLabel(day.iso);
      const action =
        plannedTitle && mine
          ? tr(`Für ${label} eingeplant`, `Planned for ${label}`)
          : plannedTitle
            ? tr(
                `Für ${label} einplanen – ersetzt ${plannedTitle}`,
                `Plan for ${label} – replaces ${plannedTitle}`
              )
            : tr(`Für ${label} einplanen`, `Plan for ${label}`);
      return `<button class="day-chip${
        entry ? " day-chip-planned" : ""
      }${mine ? " day-chip-current" : ""}" type="button" data-entity="${escapeHtml(
        entityId
      )}" data-date="${day.iso}" data-replaces="${escapeHtml(
        plannedTitle
      )}" title="${escapeHtml(action)}" aria-label="${escapeHtml(
        action
      )}">${escapeHtml(label)}${
        entry
          ? '<span class="day-chip-dot" aria-hidden="true"></span>'
          : ""
      }</button>`;
    })
    .join("")}</div>`;

const planHtml = (hass, entries, settings = {}, offset = 0) => {
  const showImage = settings.show_image !== false;
  const planEntries = mealPlanEntries(hass);
  const planned = new Map(
    planEntries.map((entry) => [String(entry.date), entry])
  );
  const today = isoDate(new Date());
  const pastCount = planEntries.filter(
    (entry) => String(entry.date || "") < today
  ).length;
  let plannedCount = 0;
  const rows = weekDays(7, offset)
    .map((day) => {
      const current = planned.get(day.iso);
      const currentUrl = String((current && current.source_url) || "");
      const currentLabel = current ? String(current.label || "") : "";
      const note = currentLabel ? noteForLabel(currentLabel) : null;
      const plannedEntry =
        current && currentUrl
          ? entries.find(
              ({ state }) =>
                String((state.attributes || {}).source_url || "") ===
                currentUrl
            )
          : null;
      const hasPlan = Boolean(plannedEntry) || Boolean(currentLabel);
      if (hasPlan) plannedCount += 1;
      const picture =
        showImage && plannedEntry
          ? String((plannedEntry.state.attributes || {}).image_url || "")
          : "";
      const thumb = !showImage
        ? ""
        : picture
          ? `<img class="plan-thumb" src="${escapeHtml(
              picture
            )}" alt="" loading="lazy">`
          : `<span class="plan-thumb plan-thumb-placeholder${
              hasPlan ? "" : " plan-thumb-empty"
            }${
              currentLabel ? " plan-thumb-note" : ""
            }" aria-hidden="true"><ha-icon icon="${
              currentLabel
                ? note
                  ? note.icon
                  : "mdi:note-text-outline"
                : current
                  ? "mdi:chef-hat"
                  : "mdi:calendar-blank-outline"
            }"></ha-icon></span>`;
      const options = entries
        .map(({ entityId, state }) => {
          const sourceUrl = String((state.attributes || {}).source_url || "");
          const selected = plannedEntry && currentUrl === sourceUrl;
          return `<option value="${escapeHtml(entityId)}"${
            selected ? " selected" : ""
          }>${escapeHtml(recipeTitle(state))}</option>`;
        })
        .join("");
      const notes = PLAN_NOTES.map((item) => {
        const selected = Boolean(currentLabel) && currentLabel === item.label();
        return `<option value="${noteOptionValue(item.id)}"${
          selected ? " selected" : ""
        }>${escapeHtml(item.label())}</option>`;
      }).join("");
      const customNote =
        currentLabel && !note
          ? `<option value="note:custom" selected>${escapeHtml(
              currentLabel
            )}</option>`
          : "";
      return `<div class="plan-row${day.isToday ? " plan-row-today" : ""}${
        hasPlan ? " plan-row-planned" : " plan-row-empty"
      }${showImage ? " plan-row-picture" : ""}${
        current ? " plan-row-clearable" : ""
      }${currentLabel ? " plan-row-note" : ""}">
        ${thumb}
        <span class="plan-day">
          <span class="plan-day-label">${escapeHtml(day.label)}</span>
          ${
            day.isToday
              ? `<span class="plan-today">${tr("Heute", "Today")}</span>`
              : ""
          }
        </span>
        <select class="plan-select ${
          hasPlan ? "plan-select-planned" : "plan-select-empty"
        }" data-date="${day.iso}"><option value="">${tr(
        "+ Rezept",
        "+ Recipe"
      )}</option>${options}<optgroup label="${tr(
        "Ohne Rezept",
        "Without a recipe"
      )}">${notes}${customNote}</optgroup></select>
        ${
          current
            ? `<button class="plan-clear" type="button" data-date="${day.iso}" title="${tr("Tag leeren", "Clear day")}" aria-label="${tr("Tag leeren", "Clear day")}">✕</button>`
            : ""
        }
      </div>`;
    })
    .join("");
  return `<div class="plan">
    <div class="plan-head">
      <p class="tab-hint plan-summary">${escapeHtml(
        planRangeLabel(offset)
      )} · ${plannedCount} ${tr("von 7 Tagen geplant", "of 7 days planned")}</p>
      <div class="plan-nav" role="group" aria-label="${tr(
        "Wochen blättern",
        "Browse weeks"
      )}">
        <button class="plan-prev" type="button" title="${tr(
          "Vorige Woche",
          "Previous week"
        )}" aria-label="${tr("Vorige Woche", "Previous week")}">‹</button>
        ${
          offset
            ? `<button class="plan-today-button" type="button">${tr(
                "Heute",
                "Today"
              )}</button>`
            : ""
        }
        <button class="plan-next" type="button" title="${tr(
          "Nächste Woche",
          "Next week"
        )}" aria-label="${tr("Nächste Woche", "Next week")}">›</button>
      </div>
    </div>
    ${
      pastCount
        ? `<div class="plan-past"><span>${
            pastCount === 1
              ? tr("1 vergangener Tag im Plan", "1 past day in the plan")
              : tr(
                  `${pastCount} vergangene Tage im Plan`,
                  `${pastCount} past days in the plan`
                )
          }</span><button class="plan-prune" type="button">${tr(
            "Aufräumen",
            "Clean up"
          )}</button></div>`
        : ""
    }
    <div class="plan-body">
      ${rows}
      <button class="week-shopping" type="button">${tr(
      "Woche auf die Einkaufsliste",
      "Add the week to the shopping list"
    )}</button>
    </div>
  </div>`;
};

const isRecipeState = (state) => {
  const attributes = (state && state.attributes) || {};
  if (attributes.integration === INTEGRATION) return true;
  return Boolean(attributes.source_url) && Array.isArray(attributes.ingredients);
};

const parseUrls = (value) =>
  [
    ...new Set(
      String(value || "")
        .split(/[\s,;]+/)
        .map((part) => part.trim())
        .filter(Boolean)
    ),
  ];

const recipeTitle = (state) => {
  const attributes = (state && state.attributes) || {};
  return attributes.title || attributes.friendly_name || (state ? state.entity_id : "");
};

const recipeEntities = (hass, filter) => {
  const wanted = Array.isArray(filter) && filter.length ? filter : null;
  const result = [];
  for (const [entityId, state] of Object.entries((hass && hass.states) || {})) {
    if (!entityId.startsWith("sensor.")) continue;
    if (wanted && !wanted.includes(entityId)) continue;
    if (!isRecipeState(state)) continue;
    result.push({ entityId, state });
  }
  result.sort((first, second) =>
    recipeTitle(first.state).localeCompare(
      recipeTitle(second.state),
      uiCollator()
    )
  );
  return result;
};

const chipsHtml = (attributes, servings) => {
  const chips = [];
  const time = formatMinutes(attributes.total_time_minutes);
  if (time) chips.push(time);
  const chosen = Number(servings);
  const servingsText = formatServings(
    Number.isFinite(chosen) && chosen > 0 ? chosen : attributes.servings
  );
  if (servingsText) chips.push(servingsText);
  const rating = formatRating(attributes.rating, attributes.rating_count);
  if (rating) chips.push(rating);
  if (attributes.difficulty) chips.push(attributes.difficulty);
  if (!chips.length) return "";
  return `<div class="chips">${chips
    .map((chip) => `<span class="chip">${escapeHtml(chip)}</span>`)
    .join("")}</div>`;
};

const tagsHtml = (attributes) => {
  const tags = Array.isArray(attributes.tags)
    ? attributes.tags.filter(Boolean).slice(0, 8)
    : [];
  if (!tags.length) return "";
  return `<div class="tags">${tags
    .map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`)
    .join("")}</div>`;
};

const recipeGroups = (state) => {
  const groups = ((state && state.attributes) || {}).groups;
  return Array.isArray(groups)
    ? groups.map((group) => String(group)).filter(Boolean)
    : [];
};

const allGroups = (entries) =>
  [...new Set(entries.flatMap(({ state }) => recipeGroups(state)))].sort(
    (first, second) => first.localeCompare(second, uiCollator())
  );

/* Groups created in the data tab live on the meal plan sensor, so they exist
 * before the first recipe is assigned to them. */
const groupRegistry = (hass) => {
  for (const state of Object.values((hass && hass.states) || {})) {
    const attributes = state.attributes || {};
    if (attributes.source_url) continue;
    if (Array.isArray(attributes.plan) && Array.isArray(attributes.groups)) {
      return attributes.groups.map((group) => String(group)).filter(Boolean);
    }
  }
  return [];
};

/* Registry order is the order of the tabs; it is sorted by hand in the data tab. */
const knownGroups = (hass, entries) => [
  ...new Set([...groupRegistry(hass), ...allGroups(entries)]),
];

const groupCounts = (entries) => {
  const counts = new Map();
  for (const { state } of entries) {
    for (const group of recipeGroups(state)) {
      counts.set(group, (counts.get(group) || 0) + 1);
    }
  }
  return counts;
};

const groupTabsHtml = (groups, active) => {
  if (!groups.length) return "";
  const items = [
    { id: "", label: tr("Alle", "All") },
    ...groups.map((group) => ({ id: group, label: group })),
  ];
  return `<div class="group-tabs" role="tablist" aria-label="${tr("Rezeptgruppen", "Recipe groups")}">${items
    .map(
      (item) =>
        `<button class="group-tab${
          active === item.id ? " active" : ""
        }" type="button" role="tab" aria-selected="${active === item.id}" data-group="${escapeHtml(
          item.id
        )}">${escapeHtml(item.label)}</button>`
    )
    .join("")}</div>`;
};

const groupsManagerHtml = (groups, counts, pending, renaming) => `<div class="section groups-manager data-section">
    <h3>${tr("Gruppen", "Groups")}</h3>
    <p class="tab-hint">${tr(
      "Gruppen hier anlegen, sortieren und umbenennen. Die Reihenfolge gilt für die Tabs in der Rezeptliste; neue Gruppen hängen hinten an. Zuweisen kannst du sie im Rezept unter „Gruppen“.",
      "Create, sort and rename groups here. The order is the order of the tabs in the recipe list; new groups are added at the end. Assign them in a recipe under “Groups”."
    )}</p>
    ${
      groups.length
        ? `<div class="group-chips">${groups
            .map((group, index) => {
              const count = counts.get(group) || 0;
              if (renaming === group) {
                return `<span class="group-chip editing"><input class="group-rename-input" type="text" maxlength="40" value="${escapeHtml(
                  group
                )}" aria-label="${tr("Neuer Name für", "New name for")} ${escapeHtml(
                  group
                )}"><button class="group-rename-save" type="button" title="${tr("Umbenennen speichern", "Save rename")}" aria-label="${tr(
      "Umbenennen speichern",
      "Save rename"
    )}">OK</button><button class="group-rename-cancel" type="button" title="${tr("Umbenennen abbrechen", "Cancel rename")}" aria-label="${tr(
      "Umbenennen abbrechen",
      "Cancel rename"
    )}">×</button></span>`;
              }
              const confirming = pending === group;
              return `<span class="group-chip">${escapeHtml(
                group
              )}<span class="group-count">${
                count === 1 ? tr("1 Rezept", "1 recipe") : `${count} ${tr("Rezepte", "recipes")}`
              }</span><button class="group-move" type="button" data-group="${escapeHtml(
                group
              )}" data-direction="up" title="${tr("Nach oben", "Move up")}" aria-label="${escapeHtml(
                group
              )} ${tr("nach oben", "up")}"${
                index === 0 ? " disabled" : ""
              }>▲</button><button class="group-move" type="button" data-group="${escapeHtml(
                group
              )}" data-direction="down" title="${tr("Nach unten", "Move down")}" aria-label="${escapeHtml(
                group
              )} ${tr("nach unten", "down")}"${
                index === groups.length - 1 ? " disabled" : ""
              }>▼</button><button class="group-rename" type="button" data-group="${escapeHtml(
                group
              )}" title="${tr("Gruppe umbenennen", "Rename group")}" aria-label="${escapeHtml(
                group
              )} ${tr("umbenennen", "rename")}">✎</button><button class="group-delete${
                confirming ? " confirm" : ""
              }" type="button" data-group="${escapeHtml(
                group
              )}" title="${tr("Gruppe löschen", "Delete group")}" aria-label="${escapeHtml(
                group
              )} ${tr("löschen", "delete")}">${confirming ? tr("Löschen?", "Delete?") : "×"}</button></span>`;
            })
            .join("")}</div>`
        : `<p class="tab-hint">${tr("Noch keine Gruppen angelegt.", "No groups yet.")}</p>`
    }
    <div class="group-add">
      <input class="group-new-input" type="text" placeholder="${tr("Neue Gruppe, z. B. Familie", "New group, e.g. family")}" maxlength="40">
      <button class="group-create-button" type="button">${tr("Anlegen", "Create")}</button>
    </div>
  </div>`;

const groupsEditorHtml = (attributes, meta, knownGroups) => {
  if (meta.forPrint || !meta.entityId) return "";
  const current = recipeGroups({ attributes });
  const chips = current
    .map(
      (group) =>
        `<span class="group-chip">${escapeHtml(group)}<button class="group-remove" type="button" data-group="${escapeHtml(group)}" title="${tr("Aus der Gruppe entfernen", "Remove from group")}" aria-label="${escapeHtml(
      group
    )} ${tr("entfernen", "remove")}">×</button></span>`
    )
    .join("");
  const available = knownGroups.filter((group) => !current.includes(group));
  const options = available
    .map(
      (group) =>
        `<option value="${escapeHtml(group)}">${escapeHtml(group)}</option>`
    )
    .join("");
  return `<div class="section groups-editor">
    <h3>${tr("Gruppen", "Groups")}</h3>
    ${chips ? `<div class="group-chips">${chips}</div>` : ""}
    ${
      available.length
        ? `<div class="group-add">
      <select class="group-select" aria-label="${tr("Vorhandene Gruppe wählen", "Choose an existing group")}"><option value="">${tr(
      "Gruppe wählen …",
      "Choose a group …"
    )}</option>${options}</select>
      <button class="group-add-button" type="button">${tr("Hinzufügen", "Add")}</button>
    </div>`
        : ""
    }
    <div class="group-add">
      <input class="group-input" type="text" placeholder="${tr("Neue Gruppe, z. B. Familie", "New group, e.g. family")}" maxlength="40">
      <button class="group-new-button" type="button">${tr("Neue Gruppe", "New group")}</button>
    </div>
  </div>`;
};

const ingredientRow = (item, checked, factor) => {
  const key = String(item.text || ingredientText(item));
  const text = scaleIngredient(item, factor);
  const isChecked = checked.has(key) ? " checked" : "";
  return `<li>
    <label>
      <input type="checkbox" data-ingredient="${escapeHtml(key)}"${isChecked}>
      <span>${escapeHtml(text)}</span>
    </label>
  </li>`;
};

const servingsControlHtml = (attributes, servings) => {
  const base = Number(attributes.servings);
  if (!Number.isFinite(base) || base <= 0) return "";
  const chosen = Number(servings);
  const value = Number.isFinite(chosen) && chosen > 0 ? chosen : base;
  return `<div class="servings">
    <button class="servings-button" type="button" data-step="-1" aria-label="${tr("Weniger Portionen", "Fewer servings")}"${value <= 1 ? " disabled" : ""}>−</button>
    <span class="servings-value">${escapeHtml(formatServings(value))}</span>
    <button class="servings-button" type="button" data-step="1" aria-label="${tr("Mehr Portionen", "More servings")}"${value >= 99 ? " disabled" : ""}>+</button>
  </div>`;
};

const ingredientsHtml = (attributes, checked, factor) => {
  const items = structuredIngredients(attributes);
  if (!items.length) return "";

  const groups = [];
  for (const item of items) {
    const name = String(item.group || "").trim();
    const last = groups[groups.length - 1];
    if (!last || last.name !== name) groups.push({ name, items: [] });
    groups[groups.length - 1].items.push(item);
  }

  if (groups.length > 1) {
    return groups
      .map(
        (group) => `
          <h4>${escapeHtml(group.name || tr("Zutaten", "Ingredients"))}</h4>
          <ul class="ingredients">${group.items
            .map((item) => ingredientRow(item, checked, factor))
            .join("")}</ul>`
      )
      .join("");
  }

  return `<ul class="ingredients">${items
    .map((item) => ingredientRow(item, checked, factor))
    .join("")}</ul>`;
};

const stepsHtml = (attributes) => {
  const steps = Array.isArray(attributes.instructions)
    ? attributes.instructions.filter(Boolean)
    : [];
  if (!steps.length) return "";
  return `<div class="section"><h3>${tr("Zubereitung", "Preparation")}</h3><ol class="steps">${steps
    .map(
      (step, index) =>
        `<li><span class="step-text">${escapeHtml(step)}</span>${stepTimers(step)
          .map(
            (minutes) =>
              `<button class="step-timer" type="button" data-timer="${index}" data-minutes="${minutes}">⏱ ${minutes} ${tr("Min.", "min")}</button>`
          )
          .join("")}</li>`
    )
    .join("")}</ol></div>`;
};

const detailHtml = (state, options, checked, servings, meta = {}) => {
  const attributes = state.attributes || {};
  const forPrint = Boolean(options.forPrint);
  const baseServings = Number(attributes.servings);
  const chosenServings = Number(servings);
  const factor =
    Number.isFinite(baseServings) &&
    baseServings > 0 &&
    Number.isFinite(chosenServings) &&
    chosenServings > 0
      ? chosenServings / baseServings
      : 1;
  const image =
    options.show_image && attributes.image_url
      ? `<img class="recipe-image" src="${escapeHtml(attributes.image_url)}" alt="${escapeHtml(recipeTitle(state))}" loading="lazy">`
      : "";
  const description = attributes.description
    ? `<p class="description">${escapeHtml(attributes.description)}</p>`
    : "";
  const ingredients = ingredientsHtml(attributes, checked, factor);
  const steps = options.show_steps ? stepsHtml(attributes) : "";
  const source = isWebUrl(attributes.source_url)
    ? `<a class="source" href="${escapeHtml(attributes.source_url)}" target="_blank" rel="noopener noreferrer">${tr("Originalrezept", "Original recipe")} ↗</a>`
    : "<span></span>";
  const refresh =
    meta.entityId && isWebUrl(attributes.source_url)
      ? `<button class="refresh" type="button">${tr("Aktualisieren", "Refresh")}</button>`
      : "";
  const editButton =
    !forPrint && meta.entityId && meta.canEdit
      ? `<button class="edit" type="button">${tr("Bearbeiten", "Edit")}</button>`
      : "";
  const printButton = `<button class="print" type="button">${tr("Drucken", "Print")}</button>`;
  const favorite =
    !forPrint && meta.entityId
      ? `<button class="favorite-toggle${
          meta.favorite ? " active" : ""
        }" type="button" data-source="${escapeHtml(
          attributes.source_url || ""
        )}" data-favorite="${Boolean(
          meta.favorite
        )}" aria-pressed="${Boolean(
          meta.favorite
        )}" title="${
          meta.favorite
            ? tr("Aus Favoriten entfernen", "Remove from favorites")
            : tr("Zu Favoriten hinzufügen", "Add to favorites")
        }" aria-label="${
          meta.favorite
            ? tr("Aus Favoriten entfernen", "Remove from favorites")
            : tr("Zu Favoriten hinzufügen", "Add to favorites")
        }"><ha-icon icon="${
          meta.favorite ? "mdi:star" : "mdi:star-outline"
        }"></ha-icon>${tr("Favorit", "Favorite")}</button>`
      : "";
  const shopping =
    Array.isArray(attributes.ingredients) && attributes.ingredients.length
      ? `<div class="shopping-row">
          <label class="only-missing"><input class="only-missing-input" type="checkbox" checked> ${tr("nur fehlende", "only missing")}</label>
          <button class="shopping" type="button">${tr(
            "Zutaten auf die Liste",
            "Add the ingredients"
          )}</button>
        </div>`
      : "";
  const servingsControl = forPrint
    ? ""
    : servingsControlHtml(attributes, chosenServings);
  const photoEdit =
    !forPrint && meta.entityId && isManualSource(attributes.source_url)
      ? `<div class="photo-edit">
          <label class="photo-edit-label">${attributes.image_url ? tr("Foto ändern", "Change photo") : tr("Foto hinzufügen", "Add photo")}<input class="photo-edit-input" type="file" accept="image/*"></label>
          ${attributes.image_url ? `<button class="photo-remove" type="button">${tr("Foto entfernen", "Remove photo")}</button>` : ""}
        </div>`
      : "";
  const footer = forPrint
    ? ""
    : `<div class="footer">${favorite}${source}${refresh}${editButton}${printButton}${shopping}</div>`;

  return `${image}
    <div class="content">
      <h2>${escapeHtml(recipeTitle(state))}</h2>
      ${chipsHtml(attributes, chosenServings)}
      ${description}
      ${tagsHtml(attributes)}
      ${photoEdit}
      ${groupsEditorHtml(attributes, meta, Array.isArray(meta.groups) ? meta.groups : [])}
      ${updateHintHtml(attributes)}
      ${ingredients ? `<div class="section"><h3>${tr("Zutaten", "Ingredients")}</h3>${servingsControl}${ingredients}</div>` : ""}
      ${nutritionHtml(attributes)}
      ${steps}
      ${footer}
    </div>`;
};

// The print view is a standalone document: Home Assistant's dashboard would
// otherwise print its sidebar and only the visible part of the card.
const PRINT_STYLES = `
  * { box-sizing: border-box; }
  body { margin: 0; padding: 24px; background: #fff; color: #111; font-family: system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif; }
  .content { max-width: 760px; margin: 0 auto; display: flex; flex-direction: column; gap: 10px; }
  .recipe-image { display: block; width: 100%; max-height: 300px; object-fit: cover; border-radius: 6px; }
  h2 { margin: 0; font-size: 24px; }
  h3 { margin: 14px 0 6px; font-size: 12px; letter-spacing: 0.06em; text-transform: uppercase; color: #555; }
  h4 { margin: 10px 0 4px; font-size: 14px; }
  .chips, .tags { display: flex; flex-wrap: wrap; gap: 6px; }
  .chip, .tag { border: 1px solid #999; border-radius: 999px; padding: 2px 9px; font-size: 12px; }
  .description { margin: 0; font-size: 14px; color: #444; }
  .section { display: flex; flex-direction: column; }
  ul.ingredients { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 2px; }
  ul.ingredients label { display: flex; gap: 8px; align-items: flex-start; font-size: 14px; }
  ol.steps { margin: 0; padding-left: 20px; display: flex; flex-direction: column; gap: 6px; font-size: 14px; }
  .nutrition { display: flex; flex-wrap: wrap; gap: 8px; font-size: 12px; color: #444; }
  .nutrition b { color: #111; }
  .step-timer { display: none; }
  .error { color: #b00020; font-size: 12px; }
  @page { margin: 14mm; }
  @media print { body { padding: 0; } .content { max-width: none; } }
`;

const printDocumentHtml = (state, options, checked, servings) => `<!DOCTYPE html>
<html lang="${UI_LANG}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(recipeTitle(state))}</title>
<style>${PRINT_STYLES}</style>
</head>
<body>${detailHtml(state, { ...options, forPrint: true }, checked, servings, {})}</body>
</html>`;

// Wait briefly for the recipe image before opening the dialog; a stalled
// image must not block printing forever.
const printWhenReady = (win, trigger) => {
  let attempts = 0;
  const check = () => {
    attempts += 1;
    let pending = 0;
    try {
      pending = [...win.document.images].filter((image) => !image.complete)
        .length;
    } catch (error) {
      pending = 0;
    }
    if (!pending || attempts >= 20) trigger();
    else setTimeout(check, 150);
  };
  setTimeout(check, 200);
};

const printViaFrame = (html) => {
  try {
    const frame = document.createElement("iframe");
    frame.setAttribute("aria-hidden", "true");
    frame.style.cssText =
      "position:fixed;right:0;bottom:0;width:0;height:0;border:0;";
    document.body.appendChild(frame);
    const frameDocument = frame.contentWindow.document;
    frameDocument.open();
    frameDocument.write(html);
    frameDocument.close();
    let printed = false;
    const trigger = () => {
      if (printed) return;
      printed = true;
      try {
        frame.contentWindow.focus();
        frame.contentWindow.print();
      } catch (error) {
        try {
          window.print();
        } catch (printError) {
          /* the device has no print dialog */
        }
      }
      setTimeout(() => {
        if (frame.parentNode) frame.parentNode.removeChild(frame);
      }, 60000);
    };
    printWhenReady(frame.contentWindow, trigger);
    return true;
  } catch (error) {
    try {
      window.print();
    } catch (printError) {
      return false;
    }
    return true;
  }
};

const openPrintWindow = (html) => {
  let popup = null;
  try {
    popup = window.open("", "_blank");
  } catch (error) {
    popup = null;
  }
  if (!popup) return printViaFrame(html);

  try {
    popup.document.open();
    popup.document.write(html);
    popup.document.close();
    let printed = false;
    const trigger = () => {
      if (printed) return;
      printed = true;
      try {
        popup.focus();
        popup.print();
      } catch (error) {
        printViaFrame(html);
      }
    };
    popup.onafterprint = () => {
      try {
        popup.close();
      } catch (error) {
        /* the window is already gone */
      }
    };
    printWhenReady(popup, trigger);
    return true;
  } catch (error) {
    try {
      popup.close();
    } catch (closeError) {
      /* ignore */
    }
    return printViaFrame(html);
  }
};

const selectionBarHtml = (count, groups) => `<div class="selection-bar">
  <span class="selection-count">${count} ${tr("ausgewählt", "selected")}</span>
  <select class="selection-group" aria-label="${tr("Gruppe für die Auswahl", "Group for the selection")}"><option value="">${tr(
      "Gruppe wählen …",
      "Choose a group …"
    )}</option>${(
    groups || []
  )
    .map(
      (group) =>
        `<option value="${escapeHtml(group)}">${escapeHtml(group)}</option>`
    )
    .join("")}</select>
  <button class="selection-assign" type="button">${tr("Zuweisen", "Assign")}</button>
  <button class="selection-remove" type="button">${tr("Entfernen", "Remove")}</button>
  <button class="selection-delete" type="button">${tr("Löschen", "Delete")}</button>
  <button class="selection-cancel" type="button">${tr("Abbrechen", "Cancel")}</button>
</div>`;

const deleteDialogHtml = (titles) => {
  const list = (titles || []).filter(Boolean);
  if (!list.length) return "";
  const count = list.length;
  const heading =
    count === 1
      ? tr("Rezept löschen?", "Delete recipe?")
      : tr(`${count} Rezepte löschen?`, `Delete ${count} recipes?`);
  const names = list
    .slice(0, 5)
    .map((title) => `„${escapeHtml(title)}“`)
    .join(", ");
  const more =
    count > 5
      ? tr(` und ${count - 5} weitere`, ` and ${count - 5} more`)
      : "";
  return `<div class="dialog-backdrop delete-backdrop">
    <div class="dialog" role="dialog" aria-modal="true" aria-label="${escapeHtml(
      heading
    )}">
      <h3>${heading}</h3>
      <p class="tab-hint">${tr(
        "Endgültig löschen:",
        "Delete permanently:"
      )} ${names}${more}? ${tr(
        "Die Rezepte verschwinden aus der Rezeptbox und aus dem Wochenplan.",
        "The recipes disappear from the recipe box and from the meal plan."
      )}</p>
      <div class="dialog-actions">
        <button class="dialog-cancel" type="button">${tr("Abbrechen", "Cancel")}</button>
        <button class="dialog-confirm" type="button">${tr("Löschen", "Delete")}</button>
      </div>
    </div>
  </div>`;
};

/* The backup dialog is opened after the export service answered. Every
 * action runs in its own user gesture: the browser only shows its save
 * dialog or the share sheet when the click is handled synchronously, and an
 * awaited service call would already have used the gesture up. */
const backupDialogHtml = (backup) => {
  if (!backup) return "";
  let canPick = false;
  try {
    canPick = typeof window.showSaveFilePicker === "function";
  } catch (error) {
    canPick = false;
  }
  let canShare = false;
  try {
    canShare =
      Boolean(backup.file) &&
      typeof navigator.share === "function" &&
      typeof navigator.canShare === "function" &&
      navigator.canShare({ files: [backup.file] });
  } catch (error) {
    canShare = false;
  }
  return `<div class="dialog-backdrop backup-backdrop">
    <div class="dialog" role="dialog" aria-modal="true" aria-label="${escapeHtml(
      tr("Sicherung", "Backup")
    )}">
      <h3>${tr("Sicherung", "Backup")}</h3>
      <p class="tab-hint">${tr(
        "Sicherung bereit. Wähle, wo die Datei gespeichert werden soll – oder teile sie.",
        "Backup ready. Choose where to save the file – or share it."
      )}<br><span class="backup-name">${escapeHtml(backup.filename)}</span></p>
      <div class="dialog-actions">
        <button class="dialog-cancel backup-close" type="button">${tr(
          "Schließen",
          "Close"
        )}</button>
        ${canPick ? `<button class="backup-save" type="button">${tr("Speichern…", "Save…")}</button>` : ""}
        ${canShare ? `<button class="backup-share" type="button">${tr("Teilen…", "Share…")}</button>` : ""}
        <a class="backup-download" href="${escapeHtml(backup.url)}" download="${escapeHtml(
          backup.filename
        )}">${tr("Herunterladen", "Download")}</a>
      </div>
    </div>
  </div>`;
};

const deleteButtonHtml = (entityId, pending) => `<button class="delete${pending ? " confirm" : ""}" type="button" data-entity="${escapeHtml(entityId)}" title="${tr("Rezept löschen", "Delete recipe")}" aria-label="${tr(
    "Rezept löschen",
    "Delete recipe"
  )}">${pending ? tr("Löschen?", "Delete?") : `<ha-icon icon="mdi:delete-outline"></ha-icon>`}</button>`;

/* The frontend wraps a service response as { context, response }; some
 * versions handed back the payload itself. Accept both shapes. */
const serviceResponse = (reply) =>
  reply && typeof reply === "object" && reply.context && "response" in reply
    ? reply.response
    : reply;

const notify = (target, message) => {
  if (!target || typeof target.dispatchEvent !== "function") return;
  target.dispatchEvent(
    new CustomEvent("hass-notification", {
      detail: { message },
      bubbles: true,
      composed: true,
    })
  );
};

const bindDetail = (root, hass, entityId, checked, dispatcher, options = {}) => {
  root.querySelectorAll("input[data-ingredient]").forEach((input) => {
    input.addEventListener("change", () => {
      const value = input.getAttribute("data-ingredient") || "";
      if (input.checked) checked.add(value);
      else checked.delete(value);
      if (typeof options.onSession === "function") options.onSession();
    });
  });

  root.querySelectorAll("button.servings-button").forEach((button) => {
    button.addEventListener("click", () => {
      const step = Number(button.getAttribute("data-step")) || 0;
      const current = Number(options.servings) || 1;
      const next = Math.max(1, Math.min(99, current + step));
      if (typeof options.onServings === "function") options.onServings(next);
    });
  });

  root.querySelectorAll("button.step-timer").forEach((button) => {
    button.addEventListener("click", () => {
      const index = Number(button.getAttribute("data-timer"));
      const minutes = Number(button.getAttribute("data-minutes"));
      if (Number.isFinite(index) && Number.isFinite(minutes) && minutes > 0) {
        startStepTimer(entityId, index, minutes, button);
      }
    });
  });
  restoreTimers(root, entityId);

  const refresh = root.querySelector("button.refresh");
  if (refresh && hass) {
    refresh.addEventListener("click", async () => {
      refresh.disabled = true;
      try {
        await hass.callService("recipe_box", "refresh_recipe", {
          entity_id: entityId,
        });
        notify(dispatcher, tr("Rezept aktualisiert.", "Recipe updated."));
      } catch (error) {
        notify(
          dispatcher,
          tr(
            `Aktualisieren: ${error.message || error.code || error}`,
            `Refresh: ${error.message || error.code || error}`
          )
        );
      } finally {
        refresh.disabled = false;
      }
    });
  }

  const editButton = root.querySelector("button.edit");
  if (editButton && typeof options.onEdit === "function") {
    editButton.addEventListener("click", () => {
      const attributes = (options.state && options.state.attributes) || {};
      options.onEdit(attributes.source_url || "");
    });
  }

  const photoInput = root.querySelector("input.photo-edit-input");
  if (photoInput && hass) {
    photoInput.addEventListener("change", async () => {
      const file = photoInput.files && photoInput.files[0];
      if (!file) return;
      photoInput.disabled = true;
      let imageUrl = "";
      try {
        imageUrl = await uploadPhoto(hass, file);
      } catch (error) {
        notify(
          dispatcher,
          tr(
            `Foto hochladen fehlgeschlagen (Rezeptbox ${CARD_VERSION}): ${photoErrorMessage(error, file)}`,
            `Photo upload failed (Rezeptbox ${CARD_VERSION}): ${photoErrorMessage(error, file)}`
          )
        );
        photoInput.disabled = false;
        photoInput.value = "";
        return;
      }
      try {
        await hass.callService("recipe_box", "set_recipe_image", {
          entity_id: entityId,
          image_url: imageUrl,
        });
        notify(dispatcher, tr("Foto gespeichert.", "Photo saved."));
      } catch (error) {
        notify(
          dispatcher,
          tr(
            `Foto speichern fehlgeschlagen: ${errorText(error) || "unbekannter Fehler"}`,
            `Saving the photo failed: ${errorText(error) || "unknown error"}`
          )
        );
      } finally {
        /* Also re-enable when no re-render happens (for example when the
         * same image is uploaded again); a detached node is harmless. */
        photoInput.disabled = false;
        photoInput.value = "";
      }
    });
  }

  const photoRemove = root.querySelector("button.photo-remove");
  if (photoRemove && hass) {
    photoRemove.addEventListener("click", async () => {
      photoRemove.disabled = true;
      try {
        await hass.callService("recipe_box", "set_recipe_image", {
          entity_id: entityId,
          image_url: "",
        });
        notify(dispatcher, tr("Foto entfernt.", "Photo removed."));
      } catch (error) {
        notify(
          dispatcher,
          tr(
            `Foto: ${(error && (error.message || error.code)) || "Fehler"}`,
            `Photo: ${(error && (error.message || error.code)) || "error"}`
          )
        );
        photoRemove.disabled = false;
      }
    });
  }

  const print = root.querySelector("button.print");
  if (print) {
    print.addEventListener("click", () => {
      if (!options.state) {
        window.print();
        return;
      }
      const html = printDocumentHtml(
        options.state,
        options,
        checked,
        options.servings
      );
      if (!openPrintWindow(html)) {
        notify(
          dispatcher,
          tr(
            "Drucken wird von diesem Gerät nicht unterstützt.",
            "Printing is not supported on this device."
          )
        );
      }
    });
  }

  const assignGroup = async (name) => {
    const value = String(name || "").trim();
    if (!hass || !value) return;
    const current = recipeGroups(options.state);
    if (current.some((group) => group.toLowerCase() === value.toLowerCase())) {
      return;
    }
    try {
      await hass.callService("recipe_box", "set_groups", {
        entity_id: entityId,
        groups: [...current, value],
      });
      notify(dispatcher, tr(`Gruppe zugewiesen: ${value}`, `Group assigned: ${value}`));
    } catch (error) {
      notify(
        dispatcher,
        tr(
          `Gruppe: ${error.message || error.code || error}`,
          `Group: ${error.message || error.code || error}`
        )
      );
    }
  };

  const groupSelect = root.querySelector("select.group-select");
  const groupAdd = root.querySelector("button.group-add-button");
  if (groupSelect && groupAdd && hass) {
    groupAdd.addEventListener("click", () => {
      const name = String(groupSelect.value || "").trim();
      if (!name) {
        notify(dispatcher, tr("Bitte eine Gruppe wählen.", "Please choose a group."));
        return;
      }
      assignGroup(name);
    });
  }

  const groupNew = root.querySelector("button.group-new-button");
  const groupInput = root.querySelector("input.group-input");
  if (groupNew && groupInput && hass) {
    const addNew = () => {
      const name = String(groupInput.value || "").trim();
      if (!name) {
        notify(
        dispatcher,
        tr("Bitte einen Gruppennamen eingeben.", "Please enter a group name.")
      );
        return;
      }
      groupInput.value = "";
      assignGroup(name);
    };
    groupNew.addEventListener("click", addNew);
    groupInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        addNew();
      }
    });
  }

  root.querySelectorAll("button.group-remove").forEach((removeButton) => {
    removeButton.addEventListener("click", async () => {
      if (!hass) return;
      const name = removeButton.getAttribute("data-group") || "";
      const next = recipeGroups(options.state).filter(
        (group) => group !== name
      );
      removeButton.disabled = true;
      try {
        await hass.callService("recipe_box", "set_groups", {
          entity_id: entityId,
          groups: next,
        });
        notify(dispatcher, tr(`Gruppe entfernt: ${name}`, `Group removed: ${name}`));
      } catch (error) {
        notify(
        dispatcher,
        tr(
          `Gruppe: ${error.message || error.code || error}`,
          `Group: ${error.message || error.code || error}`
        )
      );
        removeButton.disabled = false;
      }
    });
  });

  const favoriteButton = root.querySelector("button.favorite-toggle");
  if (favoriteButton) {
    favoriteButton.addEventListener("click", async () => {
      if (!hass) return;
      const favorite =
        favoriteButton.getAttribute("data-favorite") !== "true";
      try {
        await hass.callService("recipe_box", "set_favorite", {
          entity_id: entityId,
          favorite,
        });
        notify(
          dispatcher,
          favorite
            ? tr("Zu Favoriten hinzugefügt.", "Added to favorites.")
            : tr("Aus Favoriten entfernt.", "Removed from favorites.")
        );
        if (typeof options.onFavorite === "function") options.onFavorite();
      } catch (error) {
        notify(
          dispatcher,
          tr(
            `Favorit: ${(error && (error.message || error.code)) || "Fehler"}`,
            `Favorite: ${(error && (error.message || error.code)) || "error"}`
          )
        );
      }
    });
  }

  const button = root.querySelector("button.shopping");
  if (!button || !hass) return;

  button.addEventListener("click", async () => {
    button.disabled = true;
    const params = { entity_id: entityId };
    const servings = Number(options.servings);
    if (Number.isFinite(servings) && servings > 0) params.servings = servings;
    const onlyMissing = root.querySelector("input.only-missing-input");
    if (onlyMissing && onlyMissing.checked && checked.size) {
      params.exclude = [...checked];
    }
    try {
      await hass.callService("recipe_box", "add_to_shopping_list", params);
      notify(
        dispatcher,
        params.exclude
          ? tr(
              "Fehlende Zutaten zur Einkaufsliste hinzugefügt.",
              "Missing ingredients added to the shopping list."
            )
          : tr(
              "Zutaten zur Einkaufsliste hinzugefügt.",
              "Ingredients added to the shopping list."
            )
      );
    } catch (error) {
      notify(
        dispatcher,
        tr(
          `Einkaufsliste: ${error.message || error}`,
          `Shopping list: ${error.message || error}`
        )
      );
    } finally {
      button.disabled = false;
    }
  });
};

const STYLES = `<style>
  :host { display: block; }
  ha-card { overflow: hidden; }
  .recipe-image { display: block; width: 100%; max-height: 260px; object-fit: cover; }
  .content { padding: 16px; display: flex; flex-direction: column; gap: 12px; }
  h2 { margin: 0; font-size: 1.25rem; font-weight: 600; color: var(--primary-text-color); }
  h3 { margin: 0 0 6px; font-size: 0.85rem; letter-spacing: 0.05em; text-transform: uppercase; color: var(--secondary-text-color); font-weight: 600; }
  h4 { margin: 8px 0 4px; font-size: 0.9rem; color: var(--primary-text-color); font-weight: 600; }
  .chips { display: flex; flex-wrap: wrap; gap: 6px; }
  .chip { background: var(--secondary-background-color, rgba(127, 127, 127, 0.15)); color: var(--primary-text-color); font-size: 0.8rem; padding: 2px 10px; border-radius: 999px; }
  .tags { display: flex; flex-wrap: wrap; gap: 4px; }
  .tag { color: var(--secondary-text-color); border: 1px solid var(--divider-color, rgba(127, 127, 127, 0.3)); font-size: 0.75rem; padding: 1px 8px; border-radius: 999px; }
  .description { margin: 0; font-size: 0.9rem; color: var(--secondary-text-color); }
  .section { display: flex; flex-direction: column; }
  ul.ingredients { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 2px; }
  ul.ingredients label { display: flex; gap: 8px; align-items: flex-start; padding: 4px 0; font-size: 0.92rem; color: var(--primary-text-color); cursor: pointer; }
  ul.ingredients input { margin-top: 2px; accent-color: var(--primary-color); }
  ul.ingredients input:checked + span { text-decoration: line-through; color: var(--secondary-text-color); }
  ol.steps { margin: 0; padding-left: 1.2rem; display: flex; flex-direction: column; gap: 6px; font-size: 0.92rem; color: var(--primary-text-color); }
  .footer { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; justify-content: space-between; border-top: 1px solid var(--divider-color, rgba(127, 127, 127, 0.25)); padding-top: 12px; }
  a.source { color: var(--primary-color); font-size: 0.9rem; text-decoration: none; }
  button.shopping { background: var(--primary-color); color: var(--text-primary-color, #fff); border: none; border-radius: 6px; padding: 8px 14px; font-size: 0.9rem; cursor: pointer; }
  button.shopping:hover { opacity: 0.9; }
  button.shopping:disabled { opacity: 0.6; cursor: default; }
  .servings { display: flex; align-items: center; gap: 8px; margin: 0 0 10px; }
  button.servings-button { width: 34px; height: 34px; border-radius: 50%; border: 1px solid var(--divider-color, rgba(127, 127, 127, 0.4)); background: var(--secondary-background-color, rgba(127, 127, 127, 0.1)); color: var(--primary-text-color); font-size: 1.15rem; line-height: 1; cursor: pointer; }
  button.servings-button:hover { border-color: var(--primary-color); }
  button.servings-button:disabled { opacity: 0.45; cursor: default; }
  .servings-value { font-size: 0.9rem; font-weight: 600; min-width: 92px; text-align: center; color: var(--primary-text-color); }
  .empty { margin: 0; padding: 8px 0; color: var(--secondary-text-color); font-size: 0.9rem; }
  .list-header { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
  .count { color: var(--secondary-text-color); font-size: 0.85rem; }
  .import-bar { display: flex; flex-wrap: wrap; gap: 8px; align-items: flex-start; }
  textarea.import-input { flex: 1 1 220px; min-width: 0; min-height: 44px; resize: vertical; padding: 9px 10px; border-radius: 6px; border: 1px solid var(--divider-color, rgba(127, 127, 127, 0.4)); background: var(--card-background-color, transparent); color: var(--primary-text-color); font-size: 0.9rem; font-family: inherit; }
  textarea.import-input:focus { outline: 2px solid var(--primary-color); outline-offset: 1px; }
  button.import-button { flex: 0 0 auto; background: var(--primary-color); color: var(--text-primary-color, #fff); border: none; border-radius: 6px; padding: 9px 14px; font-size: 0.9rem; cursor: pointer; }
  button.import-button:disabled { opacity: 0.6; cursor: default; }
  ul.recipe-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
  ul.recipe-list li + li { border-top: 1px solid var(--divider-color, rgba(127, 127, 127, 0.2)); }
  li.recipe-row { display: flex; flex-wrap: wrap; align-items: center; gap: 2px; }
  button.recipe-item { display: flex; flex: 1 1 auto; min-width: 0; align-items: center; gap: 12px; padding: 10px 0; background: none; border: none; text-align: left; color: var(--primary-text-color); cursor: pointer; -webkit-user-select: none; user-select: none; -webkit-touch-callout: none; touch-action: pan-y; }
  button.delete { flex: 0 0 auto; display: inline-flex; align-items: center; background: none; border: none; color: var(--secondary-text-color); cursor: pointer; padding: 8px 6px; border-radius: 6px; font-size: 0.78rem; --mdc-icon-size: 20px; }
  button.delete:hover { color: var(--error-color, #db4437); background: rgba(219, 68, 55, 0.08); }
  button.delete.confirm { color: var(--error-color, #db4437); font-weight: 600; }
  .list-bar button.delete { margin-left: auto; }
  button.plan-add { flex: 0 0 auto; display: inline-flex; align-items: center; justify-content: center; min-width: 40px; min-height: 40px; background: none; border: none; color: var(--secondary-text-color); cursor: pointer; padding: 8px 6px; border-radius: 6px; --mdc-icon-size: 20px; }
  button.plan-add:hover, button.plan-add[aria-expanded="true"] { color: var(--primary-color); background: rgba(127, 127, 127, 0.08); }
  button.plan-add { position: relative; }
  button.plan-add.plan-add-planned { color: var(--primary-color); }
  button.plan-add-planned::after { content: ""; position: absolute; top: 8px; right: 8px; width: 6px; height: 6px; border-radius: 50%; background: var(--primary-color); }
  button.recipe-favorite { flex: 0 0 auto; display: inline-flex; align-items: center; justify-content: center; min-width: 36px; min-height: 40px; background: none; border: none; color: var(--secondary-text-color); cursor: pointer; padding: 8px 2px; border-radius: 6px; --mdc-icon-size: 20px; }
  button.recipe-favorite:hover { background: rgba(127, 127, 127, 0.08); }
  button.recipe-favorite.active { color: var(--warning-color, #ffa600); }
  button.favorite-toggle { display: inline-flex; align-items: center; gap: 4px; background: none; border: 1px solid var(--divider-color, rgba(127, 127, 127, 0.4)); border-radius: 6px; padding: 6px 10px; font-size: 0.82rem; color: var(--primary-text-color); cursor: pointer; --mdc-icon-size: 18px; }
  button.favorite-toggle:hover { border-color: var(--primary-color); }
  button.favorite-toggle.active { color: var(--warning-color, #ffa600); border-color: currentColor; }
  .day-strip { flex: 1 0 100%; display: flex; flex-wrap: wrap; gap: 4px; padding: 0 0 10px; }
  button.day-chip { position: relative; flex: 1 1 44px; min-width: 44px; min-height: 40px; padding: 4px 2px; border: 1px solid var(--divider-color, rgba(127, 127, 127, 0.4)); border-radius: 8px; background: none; color: var(--primary-text-color); font-family: inherit; font-size: 0.78rem; cursor: pointer; }
  button.day-chip:hover { border-color: var(--primary-color); }
  button.day-chip.day-chip-planned { border-color: var(--primary-color); color: var(--primary-color); font-weight: 600; }
  button.day-chip.day-chip-current { background: var(--primary-color); border-color: var(--primary-color); color: var(--text-primary-color, #fff); }
  button.day-chip.day-chip-current .day-chip-dot { background: currentColor; opacity: 0.7; }
  .day-chip-dot { display: inline-block; width: 5px; height: 5px; margin-left: 4px; border-radius: 50%; background: currentColor; vertical-align: middle; }
  button.recipe-item:hover { background: var(--secondary-background-color, rgba(127, 127, 127, 0.08)); }
  .thumb { width: 48px; height: 48px; border-radius: 8px; object-fit: cover; flex: 0 0 auto; }
  .thumb.placeholder { display: flex; align-items: center; justify-content: center; background: var(--secondary-background-color, rgba(127, 127, 127, 0.15)); color: var(--secondary-text-color); }
  .item-text { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .item-title { font-size: 0.95rem; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .item-meta { font-size: 0.8rem; color: var(--secondary-text-color); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .item-plan { display: inline-flex; align-items: center; gap: 4px; font-size: 0.78rem; font-weight: 600; color: var(--primary-color); }
  .item-plan ha-icon { --mdc-icon-size: 15px; }
  ha-icon.chevron { margin-left: auto; color: var(--secondary-text-color); --mdc-icon-size: 20px; flex: 0 0 auto; }
  .list-bar { display: flex; align-items: center; gap: 8px; padding: 8px 16px; border-bottom: 1px solid var(--divider-color, rgba(127, 127, 127, 0.25)); }
  button.back { background: none; border: none; padding: 4px 0; color: var(--primary-color); font-size: 0.9rem; cursor: pointer; white-space: nowrap; }
  .list-bar-title { color: var(--secondary-text-color); font-size: 0.85rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  button.step-timer { margin-left: 6px; border: 1px solid var(--divider-color, rgba(127, 127, 127, 0.4)); background: var(--secondary-background-color, rgba(127, 127, 127, 0.1)); color: var(--primary-text-color); border-radius: 999px; font-size: 0.75rem; padding: 1px 8px; cursor: pointer; }
  button.step-timer:hover { border-color: var(--primary-color); }
  .nutrition { display: flex; flex-wrap: wrap; gap: 6px; font-size: 0.82rem; color: var(--secondary-text-color); }
  .nutrition b { color: var(--primary-text-color); font-weight: 600; }
  .error { margin: 0; color: var(--error-color, #db4437); font-size: 0.82rem; }
  .shopping-row { display: flex; align-items: center; gap: 10px; margin-left: auto; }
  .only-missing { display: flex; align-items: center; gap: 4px; font-size: 0.8rem; color: var(--secondary-text-color); cursor: pointer; }
  button.refresh, button.print, button.edit { background: none; border: 1px solid var(--divider-color, rgba(127, 127, 127, 0.4)); border-radius: 6px; padding: 6px 10px; font-size: 0.82rem; color: var(--primary-text-color); cursor: pointer; }
  button.refresh:hover, button.print:hover, button.edit:hover { border-color: var(--primary-color); }
  .filter-bar { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
  .filter-bar input, .filter-bar select { padding: 6px 8px; border-radius: 6px; border: 1px solid var(--divider-color, rgba(127, 127, 127, 0.4)); background: var(--card-background-color, transparent); color: var(--primary-text-color); font-size: 0.85rem; }
  .filter-bar input.filter-search { flex: 1 1 150px; min-width: 0; }
  button.filter-favorites { display: inline-flex; align-items: center; gap: 4px; background: none; border: 1px solid var(--divider-color, rgba(127, 127, 127, 0.4)); border-radius: 999px; padding: 5px 10px; font-size: 0.82rem; color: var(--primary-text-color); cursor: pointer; white-space: nowrap; --mdc-icon-size: 16px; }
  button.filter-favorites:hover { border-color: var(--primary-color); }
  button.filter-favorites.active { background: var(--primary-color); border-color: var(--primary-color); color: var(--text-primary-color, #fff); }
  .group-chips { display: flex; flex-wrap: wrap; gap: 6px; }
  .group-chip { display: inline-flex; align-items: center; gap: 2px; border: 1px solid var(--primary-color); color: var(--primary-color); border-radius: 999px; padding: 2px 4px 2px 9px; font-size: 0.8rem; }
  button.group-remove { background: none; border: none; color: inherit; cursor: pointer; font-size: 0.95rem; line-height: 1; padding: 0 4px; }
  .group-add { display: flex; gap: 6px; align-items: center; }
  .group-add input { flex: 1 1 140px; min-width: 0; padding: 6px 8px; border-radius: 6px; border: 1px solid var(--divider-color, rgba(127, 127, 127, 0.4)); background: var(--card-background-color, transparent); color: var(--primary-text-color); font-size: 0.85rem; }
  .group-add button { background: none; border: 1px solid var(--divider-color, rgba(127, 127, 127, 0.4)); border-radius: 6px; padding: 6px 10px; font-size: 0.82rem; color: var(--primary-text-color); cursor: pointer; }
  .groups-manager { display: flex; flex-direction: column; gap: 6px; }
  .group-count { margin-left: 6px; font-size: 0.72rem; color: var(--secondary-text-color); }
  button.group-delete { background: none; border: none; color: inherit; cursor: pointer; font-size: 0.95rem; line-height: 1; padding: 0 4px; }
  button.group-delete.confirm { color: var(--error-color, #db4437); font-size: 0.72rem; font-weight: 600; }
  .group-tabs { display: flex; gap: 4px; overflow-x: auto; padding-bottom: 2px; }
  button.group-tab { flex: 0 0 auto; background: var(--secondary-background-color, rgba(127, 127, 127, 0.1)); border: 1px solid transparent; border-radius: 999px; padding: 4px 12px; font-size: 0.8rem; color: var(--secondary-text-color); cursor: pointer; white-space: nowrap; }
  button.group-tab:hover { color: var(--primary-text-color); }
  button.group-tab.active { background: var(--primary-color); border-color: var(--primary-color); color: var(--text-primary-color, #fff); font-weight: 600; }
  .group-chip.editing { padding-right: 4px; }
  input.group-rename-input { width: 9em; max-width: 40vw; padding: 2px 6px; border-radius: 6px; border: 1px solid var(--primary-color); background: var(--card-background-color, transparent); color: var(--primary-text-color); font-size: 0.8rem; font-family: inherit; }
  button.group-rename, button.group-rename-save, button.group-rename-cancel, button.group-move { background: none; border: none; color: inherit; cursor: pointer; line-height: 1; padding: 0 4px; }
  button.group-move { font-size: 0.7rem; padding: 0 2px; }
  button.group-move:disabled { opacity: 0.25; cursor: default; }
  button.group-rename, button.group-rename-cancel { font-size: 0.85rem; }
  button.group-rename-save { font-size: 0.75rem; font-weight: 600; }
  button.random { margin-left: auto; background: var(--secondary-background-color, rgba(127, 127, 127, 0.1)); border: 1px solid var(--divider-color, rgba(127, 127, 127, 0.4)); border-radius: 6px; padding: 6px 10px; font-size: 0.82rem; color: var(--primary-text-color); cursor: pointer; }
  .tools { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
  .tools button, .import-file-label { background: none; border: 1px solid var(--divider-color, rgba(127, 127, 127, 0.4)); border-radius: 6px; padding: 6px 10px; font-size: 0.82rem; color: var(--primary-text-color); cursor: pointer; }
  .import-file-label { display: inline-flex; }
  .import-file { display: none; }
  .manual, .plan { display: flex; flex-direction: column; gap: 6px; }
  .tabs { display: flex; gap: 2px; overflow-x: auto; border-bottom: 1px solid var(--divider-color, rgba(127, 127, 127, 0.25)); }
  button.tab { flex: 0 0 auto; background: none; border: none; border-bottom: 2px solid transparent; margin-bottom: -1px; padding: 8px 12px; font-size: 0.85rem; color: var(--secondary-text-color); cursor: pointer; white-space: nowrap; }
  button.tab:hover { color: var(--primary-text-color); }
  button.tab.active { color: var(--primary-color); border-bottom-color: var(--primary-color); font-weight: 600; }
  .tab-panel { display: flex; flex-direction: column; gap: 10px; }
  .data-panel { display: flex; flex-direction: column; gap: 16px; }
  .data-panel > * { padding-top: 16px; border-top: 1px solid var(--divider-color, rgba(127, 127, 127, 0.25)); }
  .data-panel > :first-child { padding-top: 0; border-top: none; }
  .data-section h3 { margin-bottom: 8px; }
  li.recipe-row.selected { background: var(--secondary-background-color, rgba(127, 127, 127, 0.12)); border-radius: 8px; }
  .selection-bar { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; padding: 8px; border-radius: 8px; background: var(--secondary-background-color, rgba(127, 127, 127, 0.12)); }
  .selection-count { font-size: 0.82rem; font-weight: 600; color: var(--primary-text-color); }
  .selection-bar select { flex: 1 1 130px; min-width: 0; padding: 6px 8px; border-radius: 6px; border: 1px solid var(--divider-color, rgba(127, 127, 127, 0.4)); background: var(--card-background-color, transparent); color: var(--primary-text-color); font-size: 0.85rem; }
  .selection-bar button { background: none; border: 1px solid var(--divider-color, rgba(127, 127, 127, 0.4)); border-radius: 6px; padding: 6px 10px; font-size: 0.82rem; color: var(--primary-text-color); cursor: pointer; }
  .selection-bar button.selection-delete { color: var(--error-color, #db4437); border-color: var(--error-color, #db4437); }
  .dialog-backdrop { position: fixed; inset: 0; z-index: 20; display: flex; align-items: center; justify-content: center; padding: 24px; background: rgba(0, 0, 0, 0.5); }
  .dialog { width: 100%; max-width: 340px; display: flex; flex-direction: column; gap: 10px; padding: 16px; border-radius: 12px; background: var(--card-background-color, #fff); color: var(--primary-text-color); box-shadow: 0 10px 30px rgba(0, 0, 0, 0.35); }
  .dialog h3 { margin: 0; font-size: 0.95rem; letter-spacing: 0; text-transform: none; color: var(--primary-text-color); }
  .dialog-actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 8px; }
  .dialog-actions button, .dialog-actions a.backup-download { border-radius: 6px; padding: 8px 14px; font-size: 0.85rem; cursor: pointer; }
  .dialog-actions a.backup-download { background: var(--primary-color); color: var(--text-primary-color, #fff); font-weight: 600; text-decoration: none; }
  button.backup-save, button.backup-share { background: none; border: 1px solid var(--primary-color); color: var(--primary-color); font-weight: 600; }
  .backup-name { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; word-break: break-all; }
  button.dialog-cancel { background: none; border: 1px solid var(--divider-color, rgba(127, 127, 127, 0.4)); color: var(--primary-text-color); }
  button.dialog-confirm { background: var(--error-color, #db4437); border: none; color: #fff; font-weight: 600; }
  select.group-select { flex: 1 1 140px; min-width: 0; padding: 6px 8px; border-radius: 6px; border: 1px solid var(--divider-color, rgba(127, 127, 127, 0.4)); background: var(--card-background-color, transparent); color: var(--primary-text-color); font-size: 0.85rem; }
  .tab-hint { margin: 0; font-size: 0.82rem; color: var(--secondary-text-color); }
  .manual-body { display: flex; flex-direction: column; gap: 6px; }
  .plan-body { display: grid; grid-template-columns: minmax(0, 1fr); gap: 6px; }
  .manual-body input, .manual-body textarea { padding: 8px 10px; border-radius: 6px; border: 1px solid var(--divider-color, rgba(127, 127, 127, 0.4)); background: var(--card-background-color, transparent); color: var(--primary-text-color); font-size: 0.88rem; font-family: inherit; }
  .manual-body button, button.week-shopping { align-self: flex-start; background: var(--primary-color); color: var(--text-primary-color, #fff); border: none; border-radius: 6px; padding: 8px 14px; font-size: 0.88rem; cursor: pointer; }
  button.week-shopping { grid-column: 1 / -1; width: 100%; min-height: 44px; border-radius: 10px; font-size: 0.9rem; font-weight: 600; }
  button.busy { cursor: progress; }
  button.busy::before { content: ""; display: inline-block; width: 0.8em; height: 0.8em; margin-right: 6px; border: 2px solid currentColor; border-top-color: transparent; border-radius: 50%; vertical-align: -1px; animation: recipe-box-spin 0.8s linear infinite; }
  button.busy:disabled { opacity: 0.75; }
  @keyframes recipe-box-spin { to { transform: rotate(360deg); } }
  .scan { display: flex; flex-direction: column; gap: 6px; padding: 10px; border-radius: 10px; background: var(--secondary-background-color, rgba(127, 127, 127, 0.08)); }
  .scan-bar { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
  .scan-add { display: inline-flex; align-items: center; gap: 6px; padding: 8px 12px; border-radius: 8px; border: 1px solid var(--primary-color); background: none; color: var(--primary-color); font-family: inherit; font-size: 0.85rem; cursor: pointer; }
  button.ocr-run { background: var(--primary-color); color: var(--text-primary-color, #fff); border: none; border-radius: 8px; padding: 8px 14px; font-size: 0.85rem; cursor: pointer; }
  button.ocr-run[disabled] { opacity: 0.5; cursor: default; }
  button.ocr-clear { background: none; border: 1px solid var(--divider-color, rgba(127, 127, 127, 0.4)); border-radius: 8px; padding: 8px 12px; font-size: 0.85rem; color: var(--text-primary-color); cursor: pointer; }
  button.ocr-clear[hidden] { display: none; }
  .scan-hint { margin: 0; font-size: 0.78rem; color: var(--secondary-text-color); }
  .scan-status { margin: 0; font-size: 0.82rem; color: var(--secondary-text-color); min-height: 1em; }
  ol.ocr-pages { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
  li.ocr-page { display: flex; align-items: center; gap: 8px; font-size: 0.82rem; padding: 4px 6px; border-radius: 6px; background: var(--card-background-color, transparent); }
  .ocr-page-no { min-width: 1.4em; font-weight: 600; }
  .ocr-page-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .ocr-page-photo { font-size: 0.72rem; color: var(--primary-color); border: 1px solid currentColor; border-radius: 999px; padding: 1px 6px; }
  .ocr-page-remove { background: none; border: none; color: var(--secondary-text-color); cursor: pointer; font-size: 0.95rem; padding: 2px 4px; }
  .manual-actions { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
  .manual-actions button.manual-cancel { background: none; border: 1px solid var(--divider-color, rgba(127, 127, 127, 0.4)); border-radius: 6px; padding: 8px 14px; font-size: 0.88rem; color: var(--text-primary-color); cursor: pointer; }
  .manual-photo-label { align-self: flex-start; display: inline-flex; align-items: center; gap: 6px; padding: 7px 12px; border-radius: 6px; border: 1px dashed var(--divider-color, rgba(127, 127, 127, 0.4)); font-size: 0.85rem; color: var(--primary-text-color); cursor: pointer; }
  .manual-photo-label input { display: none; }
  .manual-photo-preview { display: flex; align-items: center; gap: 10px; }
  .manual-photo-preview[hidden] { display: none; }
  .manual-photo-preview img { max-width: 120px; max-height: 90px; border-radius: 6px; object-fit: cover; }
  button.manual-photo-remove { align-self: center; background: none; color: var(--secondary-text-color); border: none; padding: 4px 6px; font-size: 0.82rem; text-decoration: underline; }
  .photo-edit { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; }
  .photo-edit-label { display: inline-flex; align-items: center; padding: 5px 10px; border-radius: 6px; border: 1px dashed var(--divider-color, rgba(127, 127, 127, 0.4)); font-size: 0.82rem; color: var(--primary-text-color); cursor: pointer; }
  .photo-edit-input { display: none; }
  button.photo-remove { background: none; border: none; padding: 0; font-size: 0.82rem; color: var(--secondary-text-color); text-decoration: underline; cursor: pointer; }
  .plan-summary { font-weight: 600; color: var(--primary-text-color); }
  .plan-head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 6px; }
  .plan-nav { display: flex; align-items: center; gap: 4px; }
  .plan-nav button { min-width: 36px; min-height: 32px; padding: 2px 8px; border: 1px solid var(--divider-color, rgba(127, 127, 127, 0.4)); border-radius: 8px; background: none; color: var(--primary-text-color); font-family: inherit; font-size: 0.9rem; cursor: pointer; }
  .plan-nav button:hover { border-color: var(--primary-color); }
  .plan-nav button.plan-today-button { font-size: 0.78rem; font-weight: 600; }
  .plan-past { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 6px; padding: 6px 10px; border-radius: 8px; background: var(--secondary-background-color, rgba(127, 127, 127, 0.12)); font-size: 0.8rem; color: var(--secondary-text-color); }
  button.plan-prune { background: none; border: none; color: var(--primary-color); font-family: inherit; font-size: 0.8rem; text-decoration: underline; cursor: pointer; padding: 4px; }
  .plan-row-note .plan-select { font-style: italic; }
  .plan-thumb-note { background: transparent; border: 1px dashed var(--primary-color); color: var(--primary-color); }
  .plan-row { display: grid; align-items: center; gap: 4px 10px; padding: 6px 8px; border-radius: 10px; grid-template-columns: minmax(0, 1fr) auto; grid-template-areas: "day clear" "select select"; }
  .plan-row-picture { grid-template-columns: 44px minmax(0, 1fr) auto; grid-template-areas: "day day clear" "thumb select select"; }
  .plan-thumb { grid-area: thumb; display: block; width: 44px; height: 44px; border-radius: 8px; object-fit: cover; }
  .plan-row-picture .plan-select { min-height: 44px; }
  .plan-thumb-placeholder { display: flex; align-items: center; justify-content: center; background: var(--secondary-background-color, rgba(127, 127, 127, 0.15)); color: var(--secondary-text-color); --mdc-icon-size: 22px; }
  .plan-thumb-empty { background: transparent; border: 1px dashed var(--divider-color, rgba(127, 127, 127, 0.4)); opacity: 0.7; }
  .plan-row-today { background: var(--secondary-background-color, rgba(127, 127, 127, 0.12)); box-shadow: inset 3px 0 0 var(--primary-color); padding-left: 10px; }
  .plan-day { grid-area: day; display: flex; flex-direction: row; align-items: center; gap: 6px; min-width: 0; font-size: 0.82rem; color: var(--secondary-text-color); }
  .plan-today { padding: 1px 7px; border-radius: 999px; background: var(--primary-color); color: var(--text-primary-color, #fff); font-size: 0.7rem; font-weight: 600; letter-spacing: 0.02em; }
  .plan-select { grid-area: select; min-width: 0; min-height: 40px; padding: 8px 32px 8px 12px; border: 1px solid transparent; border-radius: 10px; background-color: var(--secondary-background-color, rgba(127, 127, 127, 0.12)); color: var(--primary-text-color); font-family: inherit; font-size: 0.9rem; text-overflow: ellipsis; appearance: none; background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath fill='%23727a80' d='M7 10l5 5 5-5z'/%3E%3C/svg%3E"); background-repeat: no-repeat; background-position: right 10px center; background-size: 18px; }
  .plan-select:focus-visible { outline: 2px solid var(--primary-color); outline-offset: 1px; }
  .plan-select-planned { font-weight: 600; }
  .plan-select-empty { border: 1px dashed var(--divider-color, rgba(127, 127, 127, 0.4)); background-color: transparent; color: var(--secondary-text-color); }
  .plan-select-empty:hover { border-color: var(--primary-color); color: var(--primary-text-color); }
  button.plan-clear { grid-area: clear; min-width: 36px; min-height: 36px; border-radius: 8px; background: none; border: none; color: var(--secondary-text-color); cursor: pointer; font-size: 0.9rem; padding: 4px 6px; }
  button.plan-clear:hover { background: var(--secondary-background-color, rgba(127, 127, 127, 0.12)); color: var(--primary-text-color); }
  @media (min-width: 700px) {
    /* The seven days stay stacked, also on wide screens. */
    .plan-body { grid-template-columns: minmax(0, 1fr); gap: 10px; }
    .plan-row { position: relative; align-items: stretch; gap: 8px; padding: 12px; border: 1px solid var(--divider-color, rgba(127, 127, 127, 0.25)); grid-template-columns: minmax(0, 1fr); grid-template-areas: "day" "select"; }
    .plan-row-picture { grid-template-columns: 56px minmax(0, 1fr); grid-template-areas: "day day" "thumb select"; align-items: center; }
    .plan-thumb { width: 56px; height: 56px; }
    .plan-row-picture .plan-select { min-height: 56px; }
    .plan-row-today { border-color: var(--primary-color); box-shadow: none; }
    .day-strip { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); }
    button.day-chip { min-width: 0; }
    .plan-day { flex-direction: row; align-items: center; justify-content: flex-start; gap: 8px; min-width: 0; }
    .plan-row-clearable .plan-day { padding-right: 34px; }
    button.plan-clear { position: absolute; top: 8px; right: 8px; }
    .plan-select { min-height: 44px; }
    button.week-shopping { width: auto; min-width: 260px; justify-self: start; }
  }
  @media print {
    .servings, .shopping-row, .filter-bar, .tools, .import-bar, .tabs, .group-tabs, .groups-manager, .footer button, .list-bar, button.delete, button.plan-add, .day-strip, .groups-editor, .selection-bar, .dialog-backdrop { display: none !important; }
    ha-card { box-shadow: none; }
    .content { padding: 0; gap: 8px; }
    .recipe-image { max-height: 180px; }
    .chips .chip, .tag { border: 1px solid #999; }
    a.source { display: none; }
  }
</style>`;

class RecipeBoxCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._sessions = new Map();
    this._state = undefined;
    this._hass = undefined;
  }

  _session(entityId) {
    if (!this._sessions.has(entityId)) {
      this._sessions.set(entityId, loadSession(entityId));
    }
    return this._sessions.get(entityId);
  }

  static getStubConfig(hass) {
    const [first] = recipeEntities(hass, null);
    return { entity: first ? first.entityId : "" };
  }

  setConfig(config) {
    if (!config || !config.entity) {
      throw new Error(
        tr(
          "recipe-box-card: Bitte 'entity' angeben.",
          "recipe-box-card: please set 'entity'."
        )
      );
    }
    this._config = { show_image: true, show_steps: true, ...config };
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    setUiLanguage(hass);
    if (!this._config) return;
    const state = hass.states[this._config.entity];
    if (state === this._state) return;
    this._state = state;
    this._render();
  }

  getCardSize() {
    return 12;
  }

  _render() {
    if (!this.shadowRoot) return;

    if (!this._state) {
      this.shadowRoot.innerHTML = `${STYLES}
        <ha-card>
          <p class="empty">${tr("Entität", "Entity")} ${escapeHtml(
            this._config ? this._config.entity : ""
          )} ${tr("nicht gefunden.", "not found.")}</p>
        </ha-card>`;
      return;
    }

    const entityId = this._config.entity;
    const session = this._session(entityId);
    const baseServings = Number((this._state.attributes || {}).servings);
    const servings = session.servings || baseServings;

    this.shadowRoot.innerHTML = `${STYLES}
      <ha-card>${detailHtml(this._state, this._config, session.checked, servings, {
        entityId,
        hass: this._hass,
        favorite: Boolean((this._state.attributes || {}).favorite),
        groups: knownGroups(this._hass, recipeEntities(this._hass, null)),
      })}</ha-card>`;
    bindDetail(
      this.shadowRoot,
      this._hass,
      entityId,
      session.checked,
      this,
      {
        servings,
        entityId,
        state: this._state,
        show_image: this._config.show_image,
        show_steps: this._config.show_steps,
        onServings: (next) => {
          session.servings = next;
          writeSession(entityId, session);
          this._render();
        },
        onSession: () => writeSession(entityId, session),
        onFavorite: () => this._render(),
      }
    );

  }

  async _plan(date, entityId, context = {}) {
    if (!this._hass || !date) return;
    const { service, data } = planCallData(date, entityId, context);
    try {
      await this._hass.callService("recipe_box", service, data);
      notify(this, planNotice(date, entityId, context));
    } catch (error) {
      notify(
        this,
        tr(
          `Wochenplan: ${(error && (error.message || error.code)) || "Fehler"}`,
          `Meal plan: ${(error && (error.message || error.code)) || "error"}`
        )
      );
    } finally {
      const fresh =
        this._hass.states &&
        this._hass.states[this._config ? this._config.entity : ""];
      if (fresh) this._state = fresh;
      this._render();
    }
  }
}

class RecipeBoxListCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._sessions = new Map();
    this._selected = null;
    this._signature = null;
    this._hass = undefined;
    this._importUrl = "";
    this._importing = false;
    /* Photo scan and the recipe that the form currently edits. */
    this._ocrPages = [];
    this._ocrBusy = false;
    this._edit = null;
    this._confirmDelete = null;
    this._selection = new Set();
    this._suppressClickUntil = 0;
    this._pressStart = null;
    this._photoUrl = null;
    this._longPressTimer = null;
    this._pendingGroupDelete = null;
    this._groupDeleteTimer = null;
    this._backup = null;
    this._scanInput = null;
    this._photoPoll = null;
    this._renamingGroup = null;
    this._filter = {
      query: "",
      tag: "",
      group: "",
      maxTime: "",
      sort: "title",
      onlyFavorites: false,
    };
    this._tab = "recipes";
    this._restoreFocus = false;
    this._planPicker = null;
    this._planOffset = 0;
  }

  static getStubConfig() {
    return {};
  }

  setConfig(config) {
    const entities =
      typeof (config || {}).entities === "string"
        ? [config.entities]
        : (config || {}).entities;
    this._config = {
      show_image: true,
      show_steps: true,
      show_import: true,
      show_delete: true,
      show_tools: true,
      ...config,
      entities,
    };
    this._signature = null;
    this._tab = readTab(entities);
    this._filter.group = readGroup(entities);
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    setUiLanguage(hass);
    if (!this._config) return;

    const recipes = this._recipes();
    if (this._selected && !recipes.some((entry) => entry.entityId === this._selected)) {
      this._selected = null;
    }
    const signature =
      recipes
        .map(({ entityId, state }) => `${entityId}:${state.last_updated}`)
        .join("|") +
      `#${this._selected || ""}#${JSON.stringify(this._filter)}#${JSON.stringify(
        mealPlanEntries(hass)
      )}#${groupRegistry(hass).join("|")}`;
    if (signature === this._signature) return;
    this._signature = signature;
    this._render(recipes);
  }

  getCardSize() {
    return Math.min(20, 2 + this._recipes().length * 2);
  }

  _recipes() {
    return this._hass ? recipeEntities(this._hass, this._config.entities) : [];
  }

  /* The title is only localised when the dashboard leaves it out. */
  _title() {
    return (this._config && this._config.title) || tr("Rezepte", "Recipes");
  }

  _session(entityId) {
    if (!this._sessions.has(entityId)) {
      this._sessions.set(entityId, loadSession(entityId));
    }
    return this._sessions.get(entityId);
  }

  _rememberTab(tab) {
    this._tab = tab;
    writeTab(this._config ? this._config.entities : null, tab);
  }

  _rememberGroup(group) {
    this._filter.group = group;
    writeGroup(this._config ? this._config.entities : null, group);
  }

  /* The sidebar panel owns tab and selection through the URL. */
  applyView(view) {
    const tab = knownTab(view && view.tab) ? view.tab : "recipes";
    const selected = view && view.selected ? String(view.selected) : null;
    if (tab === this._tab && selected === this._selected) return;
    this._tab = tab;
    this._selected = selected;
    this._signature = null;
    if (this._config) this._render();
  }

  _viewChanged(view) {
    const navigate = this._config && this._config.navigate;
    if (typeof navigate === "function") navigate(view);
  }

  _groupExists(group, entries) {
    if (!group) return false;
    if (groupRegistry(this._hass).includes(group)) return true;
    return entries.some(({ state }) => recipeGroups(state).includes(group));
  }

  _filtered(entries) {
    const { query, tag, group, maxTime, sort, onlyFavorites } = this._filter;
    let list = entries;
    const needle = query.trim().toLowerCase();
    if (needle) {
      list = list.filter(({ state }) => {
        const attributes = state.attributes || {};
        const haystack = [
          recipeTitle(state),
          attributes.site,
          ...(attributes.tags || []),
          ...(attributes.ingredients || []),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return haystack.includes(needle);
      });
    }
    if (tag) {
      list = list.filter(({ state }) =>
        ((state.attributes || {}).tags || []).some(
          (value) => String(value) === String(tag)
        )
      );
    }
    if (onlyFavorites) {
      list = list.filter(({ state }) =>
        Boolean((state.attributes || {}).favorite)
      );
    }
    if (group) {
      list = list.filter(({ state }) => recipeGroups(state).includes(group));
      if (!list.length && this._hass && !this._groupExists(group, entries)) {
        // The whole group is gone; show the list instead of an empty result.
        list = entries;
        this._rememberGroup("");
      }
    }
    if (maxTime) {
      list = list.filter(({ state }) => {
        const minutes = Number((state.attributes || {}).total_time_minutes);
        return (
          Number.isFinite(minutes) && minutes > 0 && minutes <= Number(maxTime)
        );
      });
    }
    if (sort === "time") {
      list = [...list].sort(
        (first, second) =>
          (Number((first.state.attributes || {}).total_time_minutes) ||
            Number.MAX_SAFE_INTEGER) -
          (Number((second.state.attributes || {}).total_time_minutes) ||
            Number.MAX_SAFE_INTEGER)
      );
    }
    return list;
  }

  _render(recipes) {
    if (!this.shadowRoot) return;
    const entries = recipes || this._recipes();

    if (this._selected) {
      const selected = entries.find((entry) => entry.entityId === this._selected);
      if (selected) {
        this._renderDetail(selected);
        return;
      }
      this._selected = null;
    }

    this._renderList(entries);
  }

  async _import() {
    const urls = parseUrls(this._importUrl);
    if (!urls.length) {
      notify(
        this,
        tr(
          "Bitte mindestens eine Rezept-URL einfügen.",
          "Please add at least one recipe URL."
        )
      );
      return;
    }
    if (this._importing || !this._hass) return;

    this._importing = true;
    this._render();
    try {
      if (urls.length === 1) {
        const single = await this._hass.callService(
          "recipe_box",
          "import_recipe",
          { url: urls[0] },
          undefined,
          false,
          true
        );
        const response = serviceResponse(single);
        this._importUrl = "";
        const title = response && response.title;
        notify(
          this,
          title
            ? tr(`Rezept importiert: ${title}`, `Recipe imported: ${title}`)
            : tr("Rezept importiert.", "Recipe imported.")
        );
      } else {
        const many = await this._hass.callService(
          "recipe_box",
          "import_recipe",
          { urls },
          undefined,
          false,
          true
        );
        const response = serviceResponse(many);
        this._importUrl = "";
        const imported = (response && response.imported) || [];
        const failed = (response && response.failed) || [];
        notify(this, this._importSummary(imported.length, failed));
      }
    } catch (error) {
      notify(
        this,
        tr(
          `Import fehlgeschlagen: ${(error && (error.message || error.code)) || "unbekannter Fehler"}`,
          `Import failed: ${(error && (error.message || error.code)) || "unknown error"}`
        )
      );
    } finally {
      this._importing = false;
      this._signature = null;
      this._render();
    }
  }

  _importSummary(importedCount, failed) {
    const total = importedCount + failed.length;
    if (!failed.length) {
      return tr(
        `${importedCount} von ${total} Rezepten importiert.`,
        `${importedCount} of ${total} recipes imported.`
      );
    }
    const first = failed[0] || {};
    const raw = String(first.url || "");
    const label = raw.length > 60 ? `${raw.slice(0, 57)}…` : raw;
    return tr(
      `${importedCount} von ${total} importiert, ${failed.length} fehlgeschlagen (${label}: ${first.error || "Fehler"}).`,
      `${importedCount} of ${total} imported, ${failed.length} failed (${label}: ${first.error || "error"}).`
    );
  }

  /* Deleting always goes through the confirmation dialog in the card. */
  _requestDelete(entityId) {
    if (!entityId || !this._config.show_delete || !this._hass) return;
    this._confirmDelete = [entityId];
    this._signature = null;
    this._render();
  }

  _requestSelectionDelete() {
    if (!this._selection.size) return;
    this._confirmDelete = [...this._selection];
    this._signature = null;
    this._render();
  }

  _cancelDelete() {
    this._confirmDelete = null;
    this._signature = null;
    this._render();
  }

  _deleteTitles(entityIds) {
    const wanted = new Set(entityIds || []);
    return this._recipes()
      .filter((entry) => wanted.has(entry.entityId))
      .map((entry) => recipeTitle(entry.state));
  }

  async _deleteConfirmed() {
    const entityIds = this._confirmDelete || [];
    this._confirmDelete = null;
    if (!entityIds.length || !this._hass) {
      this._signature = null;
      this._render();
      return;
    }

    let removed = 0;
    try {
      for (const entityId of entityIds) {
        await this._hass.callService("recipe_box", "remove_recipe", {
          entity_id: entityId,
        });
        removed += 1;
        if (this._selected === entityId) this._selected = null;
      }
      notify(
        this,
        removed === 1
          ? tr("Rezept gelöscht.", "Recipe deleted.")
          : tr(`${removed} Rezepte gelöscht.`, `${removed} recipes deleted.`)
      );
    } catch (error) {
      notify(
        this,
        tr(
          `Löschen fehlgeschlagen: ${(error && (error.message || error.code)) || "unbekannter Fehler"}`,
          `Deleting failed: ${(error && (error.message || error.code)) || "unknown error"}`
        )
      );
    } finally {
      this._selection.clear();
      this._signature = null;
      this._render();
    }
  }

  _bindDeleteDialog() {
    const dialog = this.shadowRoot.querySelector(".delete-backdrop");
    if (!dialog) return;
    const cancel = dialog.querySelector("button.dialog-cancel");
    if (cancel) cancel.addEventListener("click", () => this._cancelDelete());
    const confirm = dialog.querySelector("button.dialog-confirm");
    if (confirm) confirm.addEventListener("click", () => this._deleteConfirmed());
    const backdrop = dialog;
    if (backdrop) {
      backdrop.addEventListener("click", (event) => {
        if (event.target === backdrop) this._cancelDelete();
      });
    }
  }

  /* A long press starts the selection mode, a tap then toggles recipes. */
  _toggleSelection(entityId) {
    if (!entityId) return;
    if (this._selection.has(entityId)) this._selection.delete(entityId);
    else this._selection.add(entityId);
    this._signature = null;
    this._render();
  }

  /* A little finger movement is normal on a touch screen; only a clear drag
   * counts as scrolling and cancels the pending long press. */
  _startLongPress(entityId, event) {
    if (!entityId || this._selection.size) return;
    this._clearLongPress();
    this._pressStart = {
      x: Number(event && event.clientX) || 0,
      y: Number(event && event.clientY) || 0,
    };
    this._longPressTimer = setTimeout(() => {
      this._longPressTimer = null;
      this._pressStart = null;
      this._suppressClickUntil = Date.now() + 600;
      this._selection.add(entityId);
      this._signature = null;
      this._render();
    }, 500);
  }

  _moveLongPress(event) {
    if (!this._longPressTimer || !this._pressStart) return;
    const x = Number(event && event.clientX) || 0;
    const y = Number(event && event.clientY) || 0;
    if (Math.hypot(x - this._pressStart.x, y - this._pressStart.y) > 14) {
      this._clearLongPress();
    }
  }

  _clearLongPress() {
    if (this._longPressTimer) {
      clearTimeout(this._longPressTimer);
      this._longPressTimer = null;
    }
    this._pressStart = null;
  }

  async _changeSelectionGroup(group, remove) {
    const name = String(group || "").trim();
    if (!name || !this._hass || !this._selection.size) return;
    const entries = this._recipes();
    let changed = 0;
    try {
      for (const entityId of [...this._selection]) {
        const entry = entries.find((item) => item.entityId === entityId);
        if (!entry) continue;
        const current = recipeGroups(entry.state);
        const has = current.some(
          (item) => item.toLowerCase() === name.toLowerCase()
        );
        if (remove ? !has : has) continue;
        const groups = remove
          ? current.filter((item) => item.toLowerCase() !== name.toLowerCase())
          : [...current, name];
        await this._hass.callService("recipe_box", "set_groups", {
          entity_id: entityId,
          groups,
        });
        changed += 1;
      }
      const label = `${changed} ${
        changed === 1 ? tr("Rezept", "recipe") : tr("Rezepte", "recipes")
      }`;
      notify(
        this,
        remove
          ? changed
            ? tr(
                `Aus „${name}“ entfernt: ${label}.`,
                `Removed from “${name}”: ${label}.`
              )
            : tr(
                `Keines der ausgewählten Rezepte ist in „${name}“.`,
                `None of the selected recipes is in “${name}”.`
              )
          : changed
            ? tr(
                `${name}: ${label} zugewiesen.`,
                `${name}: ${label} assigned.`
              )
            : tr(
                `Alle ausgewählten Rezepte sind schon in „${name}“.`,
                `All selected recipes are already in “${name}”.`
              )
      );
    } catch (error) {
      notify(
        this,
        tr(
          `Gruppe: ${(error && (error.message || error.code)) || "Fehler"}`,
          `Group: ${(error && (error.message || error.code)) || "error"}`
        )
      );
    } finally {
      this._selection.clear();
      this._signature = null;
      this._render();
    }
  }

  _assignGroupToSelection(group) {
    return this._changeSelectionGroup(group, false);
  }

  _removeGroupFromSelection(group) {
    return this._changeSelectionGroup(group, true);
  }

  async _createGroup() {
    if (!this._hass) return;
    const input = this.shadowRoot.querySelector("input.group-new-input");
    const name = String((input && input.value) || "").trim();
    if (!name) {
      notify(
        this,
        tr("Bitte einen Gruppennamen eingeben.", "Please enter a group name.")
      );
      return;
    }
    try {
      await this._hass.callService("recipe_box", "add_group", { group: name });
      notify(this, tr(`Gruppe angelegt: ${name}`, `Group created: ${name}`));
    } catch (error) {
      notify(
        this,
        tr(
          `Gruppe: ${(error && (error.message || error.code)) || "Fehler"}`,
          `Group: ${(error && (error.message || error.code)) || "error"}`
        )
      );
    } finally {
      this._signature = null;
      this._render();
    }
  }

  _requestGroupDelete(name) {
    if (!name || !this._hass) return;
    if (this._pendingGroupDelete === name) {
      this._deleteGroup(name);
      return;
    }
    this._pendingGroupDelete = name;
    clearTimeout(this._groupDeleteTimer);
    this._groupDeleteTimer = setTimeout(() => {
      this._pendingGroupDelete = null;
      this._signature = null;
      this._render();
    }, 4000);
    this._signature = null;
    this._render();
  }

  async _deleteGroup(name) {
    if (!this._hass) return;
    clearTimeout(this._groupDeleteTimer);
    this._pendingGroupDelete = null;
    try {
      await this._hass.callService("recipe_box", "remove_group", {
        group: name,
      });
      if (this._filter.group === name) this._rememberGroup("");
      notify(this, tr(`Gruppe gelöscht: ${name}`, `Group deleted: ${name}`));
    } catch (error) {
      notify(
        this,
        tr(
          `Gruppe: ${(error && (error.message || error.code)) || "Fehler"}`,
          `Group: ${(error && (error.message || error.code)) || "error"}`
        )
      );
    } finally {
      this._signature = null;
      this._render();
    }
  }

  _startGroupRename(name) {
    if (!name) return;
    this._renamingGroup = name;
    this._render();
    const input = this.shadowRoot.querySelector("input.group-rename-input");
    if (input) {
      input.focus();
      input.select();
    }
  }

  _cancelGroupRename() {
    this._renamingGroup = null;
    this._render();
  }

  async _moveGroup(name, direction) {
    if (!this._hass || !name || !direction) return;
    try {
      await this._hass.callService("recipe_box", "move_group", {
        group: name,
        direction,
      });
    } catch (error) {
      notify(
        this,
        tr(
          `Gruppe: ${(error && (error.message || error.code)) || "Fehler"}`,
          `Group: ${(error && (error.message || error.code)) || "error"}`
        )
      );
    } finally {
      this._signature = null;
      this._render();
    }
  }

  async _saveGroupRename() {
    if (!this._hass) return;
    const input = this.shadowRoot.querySelector("input.group-rename-input");
    const previous = this._renamingGroup;
    const name = String((input && input.value) || "").trim();
    if (!previous) return;
    if (!name || name === previous) {
      this._cancelGroupRename();
      return;
    }
    try {
      await this._hass.callService("recipe_box", "rename_group", {
        group: previous,
        name,
      });
      if (this._filter.group === previous) this._rememberGroup(name);
      notify(
        this,
        tr(
          `Gruppe umbenannt: ${previous} → ${name}`,
          `Group renamed: ${previous} → ${name}`
        )
      );
    } catch (error) {
      notify(
        this,
        tr(
          `Gruppe: ${(error && (error.message || error.code)) || "Fehler"}`,
          `Group: ${(error && (error.message || error.code)) || "error"}`
        )
      );
    } finally {
      this._renamingGroup = null;
      this._signature = null;
      this._render();
    }
  }

  _renderList(entries) {
    const filtered = this._filtered(entries);
    const planEntries = mealPlanEntries(this._hass);
    const plannedByDate = new Map(
      planEntries.map((entry) => [String(entry.date), entry])
    );
    const titleBySource = new Map(
      entries.map(({ state }) => [
        String((state.attributes || {}).source_url || ""),
        recipeTitle(state),
      ])
    );
    const favorites = favoritesFromEntries(entries);
    const items = filtered.map(({ entityId, state }) => {
      const attributes = state.attributes || {};
      const sourceUrl = String(attributes.source_url || "");
      const plannedDays = upcomingPlanDates(this._hass, sourceUrl);
      const isFavorite = favorites.has(sourceUrl);
      const meta = [
        formatMinutes(attributes.total_time_minutes),
        formatServings(attributes.servings),
        formatRating(attributes.rating, attributes.rating_count),
        recipeGroups(state).join(", "),
      ]
        .filter(Boolean)
        .join(" · ");
      const thumb =
        this._config.show_image && attributes.image_url
          ? `<img class="thumb" src="${escapeHtml(attributes.image_url)}" alt="" loading="lazy">`
          : `<span class="thumb placeholder"><ha-icon icon="mdi:chef-hat"></ha-icon></span>`;

      const removeButton = this._config.show_delete
        ? deleteButtonHtml(entityId, false)
        : "";
      const isSelected = this._selection.has(entityId);
      const planOpen = this._planPicker === entityId;
      const chevron = this._selection.size
        ? isSelected
          ? "mdi:check-circle"
          : "mdi:checkbox-blank-circle-outline"
        : "mdi:chevron-right";

      return `<li class="recipe-row${isSelected ? " selected" : ""}">
        <button class="recipe-item" type="button" data-entity="${escapeHtml(entityId)}" aria-pressed="${isSelected}">
          ${thumb}
          <span class="item-text">
            <span class="item-title">${escapeHtml(recipeTitle(state))}</span>
            <span class="item-meta">${escapeHtml(meta)}</span>
            ${
              plannedDays.length
                ? `<span class="item-plan"><ha-icon icon="mdi:calendar-check"></ha-icon>${escapeHtml(
                    plannedDays.join(" · ")
                  )}</span>`
                : ""
            }
          </span>
          <ha-icon class="chevron" icon="${chevron}"></ha-icon>
        </button>
        ${
          sourceUrl
            ? `<button class="recipe-favorite${
                isFavorite ? " active" : ""
              }" type="button" data-source="${escapeHtml(
                sourceUrl
              )}" data-entity="${escapeHtml(
                entityId
              )}" data-favorite="${isFavorite}" aria-pressed="${isFavorite}" title="${
                isFavorite
                  ? tr("Aus Favoriten entfernen", "Remove from favorites")
                  : tr("Zu Favoriten hinzufügen", "Add to favorites")
              }" aria-label="${
                isFavorite
                  ? tr("Aus Favoriten entfernen", "Remove from favorites")
                  : tr("Zu Favoriten hinzufügen", "Add to favorites")
              }"><ha-icon icon="${
                isFavorite ? "mdi:star" : "mdi:star-outline"
              }"></ha-icon></button>`
            : ""
        }
        <button class="plan-add${
          plannedDays.length ? " plan-add-planned" : ""
        }" type="button" data-entity="${escapeHtml(
          entityId
        )}" aria-expanded="${planOpen}" title="${tr(
        "Einem Tag zuordnen",
        "Assign to a day"
      )}" aria-label="${tr(
        "Einem Tag zuordnen",
        "Assign to a day"
      )}"><ha-icon icon="mdi:calendar-plus"></ha-icon></button>
        ${removeButton}
        ${
          planOpen
            ? planDayStripHtml(
                entityId,
                plannedByDate,
                titleBySource,
                sourceUrl
              )
            : ""
        }
      </li>`;
    });

    const importBar = this._config.show_import
      ? `<div class="data-section">
          <h3>${tr("Rezepte importieren", "Import recipes")}</h3>
          <div class="import-bar">
            <textarea class="import-input" rows="2" placeholder="${tr("Rezept-URLs – eine pro Zeile", "Recipe URLs – one per line")}"${this._importing ? " disabled" : ""}>${escapeHtml(this._importUrl)}</textarea>
            <button class="import-button" type="button"${this._importing ? " disabled" : ""}>${this._importing ? tr("Importiere…", "Importing…") : tr("Importieren", "Import")}</button>
          </div>
        </div>`
      : "";

    const tools = this._config.show_tools
      ? `<div class="data-section">
        <h3>${tr("Sicherung", "Backup")}</h3>
        <p class="tab-hint">${tr(
          "Alle Rezepte, der Wochenplan und die Gruppen als JSON-Datei.",
          "All recipes, the meal plan and the groups as a JSON file."
        )}</p>
                <div class="tools">
          <button class="export" type="button">${tr("Sichern", "Save")}</button>
          <label class="import-file-label">${tr("Laden", "Load")}<input class="import-file" type="file" accept="application/json"></label>
        </div>
        <p class="tab-hint card-version">${tr("Karte", "Card")} ${CARD_VERSION}</p>
      </div>`
      : "";

    const filterBar = entries.length > 1 ? filterBarHtml(entries, this._filter) : "";
    const groups = knownGroups(this._hass, entries);
    const emptyText = !entries.length
      ? tr(
          "Noch keine Rezepte. Füge oben eine oder mehrere Rezept-URLs ein – zum Beispiel von Chefkoch.",
          "No recipes yet. Add one or more recipe URLs above – from Chefkoch, for example."
        )
      : this._filter.onlyFavorites
        ? tr(
            "Keine Favoriten in der aktuellen Auswahl.",
            "No favorites in the current selection."
          )
        : this._filter.group
          ? tr(
              `Keine Rezepte in der Gruppe „${this._filter.group}“.`,
              `No recipes in the group “${this._filter.group}”.`
            )
          : tr(
              "Keine Rezepte passen zu Suche oder Filter.",
              "No recipes match the search or filter."
            );
    const body = filtered.length
      ? `<ul class="recipe-list">${items.join("")}</ul>`
      : `<p class="empty">${emptyText}</p>`;
    const count =
      filtered.length === entries.length
        ? entries.length
        : `${filtered.length}/${entries.length}`;

    const showTabs = Boolean(this._config.show_tools);
    const tab = showTabs ? this._tab : "recipes";
    const selection =
      this._selection.size
        ? selectionBarHtml(this._selection.size, groups)
        : "";
    const dialog = deleteDialogHtml(
      this._confirmDelete ? this._deleteTitles(this._confirmDelete) : []
    );
    const panels = {
      recipes: `${selection}${groupTabsHtml(groups, this._filter.group)}${filterBar}${body}`,
      data: `<div class="data-panel">${importBar}${groupsManagerHtml(
        groups,
        groupCounts(entries),
        this._pendingGroupDelete,
        this._renamingGroup
      )}${tools}${manualFormHtml(this._edit, this._ocrPages || [])}</div>`,
      plan: entries.length
        ? planHtml(this._hass, entries, this._config, this._planOffset)
        : `<p class="empty">${tr(
            "Noch keine Rezepte für den Wochenplan.",
            "No recipes for the meal plan yet."
          )}</p>`,
    };

    this.shadowRoot.innerHTML = `${STYLES}
      <ha-card>
        <div class="content">
          <div class="list-header">
            <h2>${escapeHtml(this._title())}</h2>
            <span class="count">${count}</span>
          </div>
          ${showTabs ? tabsHtml(tab) : ""}
          <div class="tab-panel" role="tabpanel">${panels[tab] || panels.recipes}</div>
        </div>
      </ha-card>${dialog}${backupDialogHtml(this._backup)}`;

    this.shadowRoot.querySelectorAll("button.tab").forEach((button) => {
      button.addEventListener("click", () => {
        const next = button.getAttribute("data-tab");
        if (!next || next === this._tab) return;
        this._rememberTab(next);
        this._planPicker = null;
        this._planOffset = 0;
        this._signature = null;
        this._render();
        this._viewChanged({ tab: next, selected: null });
      });
    });

    this.shadowRoot.querySelectorAll("button.recipe-item").forEach((button) => {
      const entityId = button.getAttribute("data-entity");
      button.addEventListener("click", () => {
        if (Date.now() < this._suppressClickUntil) return;
        if (this._selection.size) {
          this._toggleSelection(entityId);
          return;
        }
        this._selected = entityId;
        this._signature = null;
        this._render();
        this._viewChanged({ tab: this._tab, selected: entityId });
      });
      button.addEventListener("pointerdown", (event) => {
        if (event.button && event.button !== 0) return;
        this._startLongPress(entityId, event);
      });
      button.addEventListener("pointermove", (event) =>
        this._moveLongPress(event)
      );
      ["pointerup", "pointerleave", "pointercancel"].forEach((type) =>
        button.addEventListener(type, () => this._clearLongPress())
      );
      /* No context menu over the list: it would interrupt the long press. */
      button.addEventListener("contextmenu", (event) => event.preventDefault());
    });

    this.shadowRoot.querySelectorAll("button.delete").forEach((button) => {
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        this._requestDelete(button.getAttribute("data-entity"));
      });
    });

    this.shadowRoot.querySelectorAll("button.plan-add").forEach((button) => {
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        const entityId = button.getAttribute("data-entity");
        this._planPicker = this._planPicker === entityId ? null : entityId;
        this._signature = null;
        this._renderList(entries);
      });
    });
    this.shadowRoot.querySelectorAll("button.day-chip").forEach((button) => {
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        const entityId = button.getAttribute("data-entity");
        const date = button.getAttribute("data-date");
        const replaces = button.getAttribute("data-replaces") || "";
        this._planPicker = null;
        this._signature = null;
        this._plan(date, entityId, { replaces });
      });
    });

    this.shadowRoot.querySelectorAll("button.recipe-favorite").forEach((button) => {
      button.addEventListener("click", async (event) => {
        event.stopPropagation();
        const next = button.getAttribute("data-favorite") !== "true";
        try {
          await this._hass.callService("recipe_box", "set_favorite", {
            entity_id: button.getAttribute("data-entity"),
            favorite: next,
          });
          notify(
            this,
            next
              ? tr("Zu Favoriten hinzugefügt.", "Added to favorites.")
              : tr("Aus Favoriten entfernt.", "Removed from favorites.")
          );
        } catch (error) {
          notify(
            this,
            tr(
              `Favorit: ${(error && (error.message || error.code)) || "Fehler"}`,
              `Favorite: ${(error && (error.message || error.code)) || "error"}`
            )
          );
        }
        this._signature = null;
        this._renderList(entries);
      });
    });

    const selectionAssign = this.shadowRoot.querySelector(
      "button.selection-assign"
    );
    if (selectionAssign) {
      selectionAssign.addEventListener("click", () => {
        const select = this.shadowRoot.querySelector("select.selection-group");
        const group = String((select && select.value) || "").trim();
        if (!group) {
          notify(this, tr("Bitte eine Gruppe wählen.", "Please choose a group."));
          return;
        }
        this._assignGroupToSelection(group);
      });
    }
    const selectionRemove = this.shadowRoot.querySelector(
      "button.selection-remove"
    );
    if (selectionRemove) {
      selectionRemove.addEventListener("click", () => {
        const select = this.shadowRoot.querySelector("select.selection-group");
        const group = String((select && select.value) || "").trim();
        if (!group) {
          notify(this, tr("Bitte eine Gruppe wählen.", "Please choose a group."));
          return;
        }
        this._removeGroupFromSelection(group);
      });
    }
    const selectionDelete = this.shadowRoot.querySelector(
      "button.selection-delete"
    );
    if (selectionDelete) {
      selectionDelete.addEventListener("click", () =>
        this._requestSelectionDelete()
      );
    }
    const selectionCancel = this.shadowRoot.querySelector(
      "button.selection-cancel"
    );
    if (selectionCancel) {
      selectionCancel.addEventListener("click", () => {
        this._selection.clear();
        this._signature = null;
        this._render();
      });
    }

    this._bindDeleteDialog();
    this._bindBackupDialog(this.shadowRoot.querySelector(".backup-backdrop"));

    const input = this.shadowRoot.querySelector("textarea.import-input");
    if (input) {
      input.addEventListener("input", () => {
        this._importUrl = input.value;
      });
      input.addEventListener("keydown", (event) => {
        if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
          event.preventDefault();
          this._import();
        }
      });
    }
    const importButton = this.shadowRoot.querySelector("button.import-button");
    if (importButton) {
      importButton.addEventListener("click", () => this._import());
    }

    const search = this.shadowRoot.querySelector("input.filter-search");
    if (search) {
      search.addEventListener("input", () => {
        this._filter.query = search.value;
        this._restoreFocus = true;
        this._renderList(entries);
      });
      if (this._restoreFocus) {
        search.focus();
        search.setSelectionRange(search.value.length, search.value.length);
        this._restoreFocus = false;
      }
    }

    this.shadowRoot.querySelectorAll("button.group-tab").forEach((button) => {
      button.addEventListener("click", () => {
        const next = button.getAttribute("data-group") || "";
        if (next === this._filter.group) return;
        this._rememberGroup(next);
        this._renderList(entries);
      });
    });
    const favoritesOnly = this.shadowRoot.querySelector(
      "button.filter-favorites"
    );
    if (favoritesOnly) {
      favoritesOnly.addEventListener("click", () => {
        this._filter.onlyFavorites = !this._filter.onlyFavorites;
        this._renderList(entries);
      });
    }
    const tag = this.shadowRoot.querySelector("select.filter-tag");
    if (tag) {
      tag.addEventListener("change", () => {
        this._filter.tag = tag.value;
        this._renderList(entries);
      });
    }
    const time = this.shadowRoot.querySelector("select.filter-time");
    if (time) {
      time.addEventListener("change", () => {
        this._filter.maxTime = time.value;
        this._renderList(entries);
      });
    }
    const sort = this.shadowRoot.querySelector("select.filter-sort");
    if (sort) {
      sort.addEventListener("change", () => {
        this._filter.sort = sort.value;
        this._renderList(entries);
      });
    }

    const random = this.shadowRoot.querySelector("button.random");
    if (random) random.addEventListener("click", () => this._openRandom(entries));

    const exportButton = this.shadowRoot.querySelector("button.export");
    if (exportButton) {
      exportButton.addEventListener("click", () => this._export());
    }

    const file = this.shadowRoot.querySelector("input.import-file");
    if (file) {
      file.addEventListener("change", () => {
        const chosen = file.files && file.files[0];
        file.value = "";
        this._importFile(chosen);
      });
    }

    const manualSave = this.shadowRoot.querySelector("button.manual-save");
    if (manualSave) {
      manualSave.addEventListener("click", () => this._saveManual());
    }

    const manualCancel = this.shadowRoot.querySelector("button.manual-cancel");
    if (manualCancel) {
      manualCancel.addEventListener("click", () => this._cancelEdit());
    }

    const ocrPick = this.shadowRoot.querySelector("button.scan-pick");
    if (ocrPick) ocrPick.addEventListener("click", () => this._pickPhotos());
    const ocrRun = this.shadowRoot.querySelector("button.ocr-run");
    if (ocrRun) ocrRun.addEventListener("click", () => this._scanPages());
    const ocrClear = this.shadowRoot.querySelector("button.ocr-clear");
    if (ocrClear) {
      ocrClear.addEventListener("click", () => {
        this._ocrPages = [];
        this._renderOcrPages();
        this._scanStatus("");
        this._previewPhoto(null);
      });
    }
    this._bindOcrPages();

    const manualPhoto = this.shadowRoot.querySelector("input.manual-photo");
    if (manualPhoto) {
      manualPhoto.addEventListener("change", () => {
        const chosen = manualPhoto.files && manualPhoto.files[0];
        this._previewPhoto(chosen || null);
      });
    }
    const manualPhotoRemove = this.shadowRoot.querySelector(
      "button.manual-photo-remove"
    );
    if (manualPhotoRemove) {
      manualPhotoRemove.addEventListener("click", () => this._clearPhoto());
    }

    const createGroup = this.shadowRoot.querySelector("button.group-create-button");
    if (createGroup) {
      const create = () => this._createGroup();
      createGroup.addEventListener("click", create);
      const groupInput = this.shadowRoot.querySelector("input.group-new-input");
      if (groupInput) {
        groupInput.addEventListener("keydown", (event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            create();
          }
        });
      }
    }
    this.shadowRoot.querySelectorAll("button.group-move").forEach((button) => {
      button.addEventListener("click", () =>
        this._moveGroup(
          button.getAttribute("data-group"),
          button.getAttribute("data-direction")
        )
      );
    });
    this.shadowRoot.querySelectorAll("button.group-delete").forEach((button) => {
      button.addEventListener("click", () =>
        this._requestGroupDelete(button.getAttribute("data-group"))
      );
    });
    this.shadowRoot.querySelectorAll("button.group-rename").forEach((button) => {
      button.addEventListener("click", () =>
        this._startGroupRename(button.getAttribute("data-group"))
      );
    });
    const renameSave = this.shadowRoot.querySelector("button.group-rename-save");
    if (renameSave) {
      renameSave.addEventListener("click", () => this._saveGroupRename());
    }
    const renameCancel = this.shadowRoot.querySelector(
      "button.group-rename-cancel"
    );
    if (renameCancel) {
      renameCancel.addEventListener("click", () => this._cancelGroupRename());
    }
    const renameInput = this.shadowRoot.querySelector(
      "input.group-rename-input"
    );
    if (renameInput) {
      renameInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          this._saveGroupRename();
        } else if (event.key === "Escape") {
          event.preventDefault();
          this._cancelGroupRename();
        }
      });
    }

    this.shadowRoot.querySelectorAll("select.plan-select").forEach((select) => {
      select.addEventListener("change", () =>
        this._plan(select.getAttribute("data-date"), select.value)
      );
    });
    this.shadowRoot.querySelectorAll("button.plan-clear").forEach((button) => {
      button.addEventListener("click", () =>
        this._plan(button.getAttribute("data-date"), "")
      );
    });
    const weekShopping = this.shadowRoot.querySelector("button.week-shopping");
    if (weekShopping) {
      weekShopping.addEventListener("click", () => this._weekShopping());
    }

    const stepWeek = (step) => {
      const next = stepPlanOffset(this._planOffset, step, planEntries);
      if (next === this._planOffset) return;
      this._planOffset = next;
      this._signature = null;
      this._renderList(entries);
    };
    const planPrev = this.shadowRoot.querySelector("button.plan-prev");
    if (planPrev) planPrev.addEventListener("click", () => stepWeek(-7));
    const planNext = this.shadowRoot.querySelector("button.plan-next");
    if (planNext) planNext.addEventListener("click", () => stepWeek(7));
    const planTodayButton = this.shadowRoot.querySelector(
      "button.plan-today-button"
    );
    if (planTodayButton) {
      planTodayButton.addEventListener("click", () => {
        this._planOffset = 0;
        this._signature = null;
        this._renderList(entries);
      });
    }
    const planPrune = this.shadowRoot.querySelector("button.plan-prune");
    if (planPrune) {
      planPrune.addEventListener("click", () => this._prunePlan());
    }
  }

  async _prunePlan() {
    if (!this._hass) return;
    const today = isoDate(new Date());
    const dates = [
      ...new Set(
        mealPlanEntries(this._hass)
          .map((entry) => String(entry.date || ""))
          .filter((date) => date && date < today)
      ),
    ];
    if (!dates.length) return;
    try {
      for (const date of dates) {
        await this._hass.callService("recipe_box", "clear_meal_plan", {
          date,
        });
      }
      notify(
        this,
        dates.length === 1
          ? tr("1 vergangenen Tag entfernt.", "Removed 1 past day.")
          : tr(
              `${dates.length} vergangene Tage entfernt.`,
              `Removed ${dates.length} past days.`
            )
      );
      this._planOffset = 0;
    } catch (error) {
      notify(
        this,
        tr(
          `Wochenplan: ${(error && (error.message || error.code)) || "Fehler"}`,
          `Meal plan: ${(error && (error.message || error.code)) || "error"}`
        )
      );
    } finally {
      this._signature = null;
      this._render();
    }
  }

  _openRandom(entries) {
    const pool = this._filtered(entries);
    if (!pool.length) {
      notify(
        this,
        tr(
          "Keine Rezepte in der aktuellen Auswahl.",
          "No recipes in the current selection."
        )
      );
      return;
    }
    const pick = pickRandomEntry(
      pool,
      favoritesFromEntries(entries),
      readRandomHistory()
    );
    if (!pick) return;
    rememberRandomPick(
      String(((pick.state && pick.state.attributes) || {}).source_url || "")
    );
    notify(
      this,
      tr(
        `Vorschlag: ${recipeTitle(pick.state)}`,
        `Suggestion: ${recipeTitle(pick.state)}`
      )
    );
    this._selected = pick.entityId;
    this._signature = null;
    this._render();
    this._viewChanged({ tab: this._tab, selected: pick.entityId });
  }

  _scanStatus(message) {
    const status =
      this.shadowRoot && this.shadowRoot.querySelector(".scan-status");
    if (status) status.textContent = message || "";
  }

  /* The file input lives outside the card: Home Assistant re-renders the
   * card while the native picker is open, and an input inside the shadow
   * tree loses its files then (typical in the mobile app). The input is
   * created once and kept, so the change listener always stays attached. */
  _photoInput() {
    if (this._scanInput && this._scanInput.parentNode) return this._scanInput;
    if (typeof document === "undefined" || !document.createElement) return null;
    if (!document.body) return null;
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.multiple = true;
    input.setAttribute("aria-hidden", "true");
    input.style.position = "fixed";
    input.style.top = "0";
    input.style.left = "-10000px";
    input.style.opacity = "0";
    input.addEventListener("change", () => {
      const chosen = Array.from(input.files || []);
      input.value = "";
      this._stopPhotoPoll();
      if (chosen.length) this._addPhotos(chosen);
    });
    document.body.appendChild(input);
    this._scanInput = input;
    return input;
  }

  _stopPhotoPoll() {
    if (this._photoPoll && typeof clearInterval === "function") {
      clearInterval(this._photoPoll);
    }
    this._photoPoll = null;
  }

  _pickPhotos() {
    const input = this._photoInput();
    if (!input) return;
    input.value = "";
    input.click();
    /* Some app webviews close the picker without a change event. The files
     * are then read from the input for a few seconds. */
    if (typeof setInterval !== "function") return;
    this._stopPhotoPoll();
    let tries = 0;
    this._photoPoll = setInterval(() => {
      tries += 1;
      const chosen = Array.from(input.files || []);
      if (chosen.length) {
        input.value = "";
        this._stopPhotoPoll();
        this._addPhotos(chosen);
        return;
      }
      if (tries >= 40) this._stopPhotoPoll();
    }, 500);
  }

  _addPhotos(chosen) {
    const files = Array.from(chosen || []).filter(Boolean);
    if (!files.length) return;
    this._ocrPages = [...(this._ocrPages || []), ...files];
    this._renderOcrPages();
    this._previewPhoto((this._ocrPages || [])[0] || null);
    this._scanStatus(
      tr(
        "Fotos bereit. „Text erkennen“ liest sie der Reihe nach.",
        "Photos ready. “Read text” scans them in order."
      )
    );
  }

  _renderOcrPages() {
    const root = this.shadowRoot;
    if (!root) return;
    const pages = this._ocrPages || [];
    const list = root.querySelector("ol.ocr-pages");
    if (list) list.innerHTML = ocrPagesHtml(pages);
    const run = root.querySelector("button.ocr-run");
    if (run) run.disabled = !pages.length || this._ocrBusy;
    const clear = root.querySelector("button.ocr-clear");
    if (clear) clear.hidden = !pages.length;
    this._bindOcrPages();
  }

  _bindOcrPages() {
    const root = this.shadowRoot;
    if (!root) return;
    root.querySelectorAll("button.ocr-page-remove").forEach((button) => {
      button.addEventListener("click", () => {
        const index = Number(button.getAttribute("data-index"));
        if (!Number.isInteger(index)) return;
        this._ocrPages = (this._ocrPages || []).filter(
          (_page, position) => position !== index
        );
        this._renderOcrPages();
        this._previewPhoto((this._ocrPages || [])[0] || null);
      });
    });
  }

  /* Runs Tesseract for every photographed page and drops the text into the
   * form. Nothing is saved until the user has checked the result. */
  async _scanPages() {
    const pages = (this._ocrPages || []).slice();
    if (!this._hass || !pages.length || this._ocrBusy) return;
    const root = this.shadowRoot;
    const run = root && root.querySelector("button.ocr-run");
    this._ocrBusy = true;
    if (run) run.disabled = true;
    let worker = null;
    let currentPage = 1;

    try {
      const Tesseract = await loadTesseract();
      this._scanStatus(
        tr("Texterkennung wird geladen …", "Loading text recognition …")
      );
      worker = await Tesseract.createWorker("deu", 1, {
        workerPath: `${OCR_BASE}worker.min.js`,
        corePath: `${OCR_BASE}core/tesseract-core-simd-lstm.wasm.js`,
        langPath: `${OCR_BASE}lang`,
        gzip: false,
        logger: (message) => {
          if (!message || message.status !== "recognizing text") return;
          const percent = Math.round((message.progress || 0) * 100);
          this._scanStatus(
            tr(
              `Seite ${currentPage} von ${pages.length} – ${percent} %`,
              `Page ${currentPage} of ${pages.length} – ${percent} %`
            )
          );
        },
      });

      const texts = [];
      for (let index = 0; index < pages.length; index += 1) {
        currentPage = index + 1;
        this._scanStatus(
          tr(
            `Seite ${currentPage} von ${pages.length} wird gelesen …`,
            `Reading page ${currentPage} of ${pages.length} …`
          )
        );
        const image = await ocrPhoto(pages[index]);
        let { data } = await worker.recognize(image);
        const text = (data && data.text) || "";
        if (text.trim().length < 40) {
          const grey = await ocrPhotoGrey(pages[index]);
          const second = await worker.recognize(grey);
          const more = (second.data && second.data.text) || "";
          if (more.trim().length > text.trim().length) data = second.data;
        }
        texts.push((data && data.text) || "");
      }

      const scanned = ocrRecipeFromPages(texts);
      this._fillManualForm(scanned);
      this._scanStatus("");
      if (scanned.title && scanned.ingredients.length) {
        notify(
          this,
          tr(
            `Text erkannt: ${scanned.title} (${scanned.ingredients.length} Zutaten, ${scanned.instructions.length} Schritte). Bitte prüfen und speichern.`,
            `Text recognised: ${scanned.title} (${scanned.ingredients.length} ingredients, ${scanned.instructions.length} steps). Please check and save.`
          )
        );
      } else {
        notify(
          this,
          tr(
            "Der Text konnte nicht sicher gelesen werden. Bitte die Felder prüfen oder ein schärferes Foto verwenden.",
            "The text could not be read reliably. Check the fields or use a sharper photo."
          )
        );
      }
    } catch (error) {
      this._scanStatus("");
      notify(
        this,
        tr(
          `Texterkennung fehlgeschlagen: ${
            (error && (error.message || error.code)) || "unbekannter Fehler"
          }`,
          `Text recognition failed: ${
            (error && (error.message || error.code)) || "unknown error"
          }`
        )
      );
    } finally {
      if (worker) {
        try {
          await worker.terminate();
        } catch (error) {
          /* a terminated worker is fine */
        }
      }
      this._ocrBusy = false;
      if (run) run.disabled = !(this._ocrPages || []).length;
    }
  }

  _fillManualForm(scanned) {
    const root = this.shadowRoot;
    if (!root || !scanned) return;
    const fill = (selector, value) => {
      const node = root.querySelector(selector);
      if (node && value) node.value = value;
    };
    fill("input.manual-title", scanned.title);
    fill(
      "input.manual-servings",
      scanned.servings ? String(scanned.servings) : ""
    );
    fill("textarea.manual-ingredients", scanned.ingredients.join("\n"));
    fill("textarea.manual-instructions", scanned.instructions.join("\n"));
  }

  _startEdit(sourceUrl) {
    if (!this._hass || !sourceUrl) return;
    const entry = this._recipes().find(
      (item) => ((item.state && item.state.attributes) || {}).source_url === sourceUrl
    );
    if (!entry) return;
    const attributes = entry.state.attributes || {};
    this._edit = {
      url: sourceUrl,
      entityId: entry.entityId,
      title: recipeTitle(entry.state),
      servings: Number(attributes.servings) || null,
      ingredients: Array.isArray(attributes.ingredients)
        ? attributes.ingredients.slice()
        : [],
      instructions: Array.isArray(attributes.instructions)
        ? attributes.instructions.slice()
        : [],
      tags: Array.isArray(attributes.tags) ? attributes.tags.slice() : [],
    };
    this._ocrPages = [];
    this._selected = null;
    this._rememberTab("data");
    this._signature = null;
    this._render();
    const form = this.shadowRoot && this.shadowRoot.querySelector(".manual");
    if (form && typeof form.scrollIntoView === "function") {
      form.scrollIntoView({ block: "start" });
    }
  }

  _cancelEdit() {
    this._edit = null;
    /* Pages scanned for the edit must not turn into a new recipe's photo. */
    this._ocrPages = [];
    this._signature = null;
    this._render();
  }

  async _saveManual() {
    if (!this._hass) return;
    const root = this.shadowRoot;
    const title = (root.querySelector("input.manual-title") || {}).value || "";
    const ingredients = (root.querySelector("textarea.manual-ingredients") || {})
      .value || "";
    const instructions = (
      root.querySelector("textarea.manual-instructions") || {}
    ).value || "";
    const tags = (root.querySelector("input.manual-tags") || {}).value || "";
    const servings = Number((root.querySelector("input.manual-servings") || {}).value);
    const photoInput = root.querySelector("input.manual-photo");
    /* The first scanned page is the recipe photo unless one was chosen. */
    const photo =
      (photoInput && photoInput.files && photoInput.files[0]) ||
      (this._ocrPages || [])[0] ||
      null;
    const editing = this._edit;

    const data = {
      title: title.trim(),
      ingredients: ingredients
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean),
      instructions: instructions
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean),
      tags: tags
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean),
    };
    if (!data.title || !data.ingredients.length) {
      notify(
        this,
        tr(
          "Titel und mindestens eine Zutat werden benötigt.",
          "A title and at least one ingredient are required."
        )
      );
      return;
    }
    if (Number.isFinite(servings) && servings > 0) data.servings = servings;

    const saveButton = root.querySelector("button.manual-save");
    const setBusy = (busy) => {
      if (!saveButton) return;
      saveButton.disabled = busy;
      if (saveButton.classList) saveButton.classList.toggle("busy", busy);
      if (saveButton.setAttribute) {
        if (busy) saveButton.setAttribute("aria-busy", "true");
        else saveButton.removeAttribute("aria-busy");
      }
    };

    /* The upload is the slow part. The spinner runs until the recipe is stored,
     * so the button also cannot send the same recipe twice. */
    setBusy(true);
    try {
      if (photo) {
        try {
          data.image_url = await this._uploadPhoto(photo);
        } catch (error) {
          notify(
            this,
            tr(
              `Foto hochladen fehlgeschlagen (Rezeptbox ${CARD_VERSION}): ${photoErrorMessage(error, photo)}`,
              `Photo upload failed (Rezeptbox ${CARD_VERSION}): ${photoErrorMessage(error, photo)}`
            )
          );
          return;
        }
      }

      if (editing) {
        data.url = editing.url;
        await this._hass.callService(
          "recipe_box",
          "update_recipe",
          data,
          undefined,
          false,
          true
        );
        notify(
          this,
          tr(
            `Rezept aktualisiert: ${data.title}`,
            `Recipe updated: ${data.title}`
          )
        );
        this._edit = null;
      } else {
        await this._hass.callService(
          "recipe_box",
          "add_recipe",
          data,
          undefined,
          false,
          true
        );
        notify(
          this,
          tr(`Rezept gespeichert: ${data.title}`, `Recipe saved: ${data.title}`)
        );
      }
      this._ocrPages = [];
      this._previewPhoto(null);
      this._rememberTab("recipes");
      this._signature = null;
      this._render();
    } catch (error) {
      notify(
        this,
        tr(
          `Speichern fehlgeschlagen: ${
            (error && (error.message || error.code)) || "unbekannter Fehler"
          }`,
          `Saving failed: ${
            (error && (error.message || error.code)) || "unknown error"
          }`
        )
      );
    } finally {
      setBusy(false);
    }
  }

  /* Photos are stored through Home Assistant's image upload, so they work
   * for every logged-in user and survive a restart. */
  async _uploadPhoto(file) {
    return uploadPhoto(this._hass, file, (item) => this._shrinkPhoto(item));
  }

  async _shrinkPhoto(file) {
    return shrinkPhoto(file);
  }

  _previewPhoto(file) {
    const root = this.shadowRoot;
    const preview = root && root.querySelector(".manual-photo-preview");
    const image = preview && preview.querySelector("img");
    if (!image) return;
    if (this._photoUrl && typeof URL !== "undefined" && URL.revokeObjectURL) {
      URL.revokeObjectURL(this._photoUrl);
    }
    this._photoUrl = null;
    if (!file || typeof URL === "undefined" || !URL.createObjectURL) {
      image.removeAttribute("src");
      if (preview) preview.hidden = true;
      return;
    }
    this._photoUrl = URL.createObjectURL(file);
    image.src = this._photoUrl;
    if (preview) preview.hidden = false;
  }

  _clearPhoto() {
    const input =
      this.shadowRoot && this.shadowRoot.querySelector("input.manual-photo");
    if (input) input.value = "";
    this._previewPhoto(null);
  }

  async _export() {
    if (!this._hass) return;
    try {
      /* The card never asks the server to store the file. The dialog below
       * lets the user save or share it themselves. */
      const reply = await this._hass.callService(
        "recipe_box",
        "export_recipes",
        {},
        undefined,
        false,
        true
      );
      const data = serviceResponse(reply);
      if (!data || typeof data !== "object" || !Array.isArray(data.recipes)) {
        throw new Error(
          tr(
            "Der Export-Service hat keine Sicherungsdaten geliefert.",
            "The export service did not return any backup data."
          )
        );
      }

      const text = JSON.stringify(data, null, 2);
      const filename = `rezeptbox-${isoDate(new Date())}.json`;
      const type = "application/json";
      const blob = new Blob([text], { type });
      const url = URL.createObjectURL(blob);
      let file = null;
      if (typeof File === "function") {
        file = new File([blob], filename, { type });
      }
      this._backup = {
        blob,
        url,
        file,
        filename,
        warning: missingImageWarning(data),
      };
      this._showBackupDialog();
    } catch (error) {
      notify(
        this,
        tr(
          `Sichern fehlgeschlagen: ${
            (error && (error.message || error.code)) || "unbekannter Fehler"
          }`,
          `Saving the backup failed: ${
            (error && (error.message || error.code)) || "unknown error"
          }`
        )
      );
    }
  }

  /* The dialog is appended to the rendered card instead of re-rendering it,
   * so unsaved input in the recipe form is not lost while it is open. */
  _showBackupDialog() {
    if (!this.shadowRoot || !this._backup) return;
    const existing = this.shadowRoot.querySelector(".backup-backdrop");
    if (existing) existing.remove();
    const holder = document.createElement("div");
    holder.innerHTML = backupDialogHtml(this._backup);
    const node = holder.firstElementChild;
    if (!node) return;
    this.shadowRoot.appendChild(node);
    this._bindBackupDialog(node);
  }

  _closeBackup() {
    const backup = this._backup;
    this._backup = null;
    const node =
      this.shadowRoot && this.shadowRoot.querySelector(".backup-backdrop");
    if (node) node.remove();
    // Keep the blob URL alive for a moment: revoking it right away cancels a
    // download that has only just started.
    if (backup && backup.url && typeof URL !== "undefined" && URL.revokeObjectURL) {
      setTimeout(() => URL.revokeObjectURL(backup.url), 30000);
    }
  }

  /* Every action runs synchronously from its click: only then do browsers
   * show the save dialog or the share sheet. */
  _bindBackupDialog(node) {
    const backup = this._backup;
    if (!node || !backup) return;
    const close = node.querySelector("button.backup-close");
    if (close) close.addEventListener("click", () => this._closeBackup());
    const save = node.querySelector("button.backup-save");
    if (save) {
      save.addEventListener("click", () => {
        save.disabled = true;
        this._saveBackupWithPicker(backup, save);
      });
    }
    const share = node.querySelector("button.backup-share");
    if (share) {
      share.addEventListener("click", () => {
        share.disabled = true;
        this._shareBackup(backup, share);
      });
    }
    const download = node.querySelector("a.backup-download");
    if (download) {
      download.addEventListener("click", () => {
        notify(
          this,
          tr(
            `Sicherung heruntergeladen: ${backup.filename}${backup.warning}`,
            `Backup downloaded: ${backup.filename}${backup.warning}`
          )
        );
        // Give the browser a moment to start the download before the link
        // and its blob URL disappear.
        setTimeout(() => {
          if (this._backup === backup) this._closeBackup();
        }, 1000);
      });
    }
  }

  async _saveBackupWithPicker(backup, button) {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: backup.filename,
        types: [
          {
            description: tr("Rezeptbox-Sicherung", "Rezeptbox backup"),
            accept: { "application/json": [".json"] },
          },
        ],
      });
      const writable = await handle.createWritable();
      await writable.write(backup.blob);
      await writable.close();
      notify(
        this,
        tr(
          `Sicherung gespeichert: ${handle.name || backup.filename}${backup.warning}`,
          `Backup saved: ${handle.name || backup.filename}${backup.warning}`
        )
      );
      this._closeBackup();
    } catch (error) {
      if (button) button.disabled = false;
      if (error && error.name === "AbortError") return;
      notify(
        this,
        tr(
          `Speichern fehlgeschlagen: ${errorText(error)}`,
          `Saving the backup failed: ${errorText(error)}`
        )
      );
    }
  }

  async _shareBackup(backup, button) {
    try {
      await navigator.share({
        files: backup.file ? [backup.file] : [],
        title: tr("Rezeptbox-Sicherung", "Rezeptbox backup"),
      });
      notify(
        this,
        tr(
          `Sicherung geteilt.${backup.warning}`,
          `Backup shared.${backup.warning}`
        )
      );
      this._closeBackup();
    } catch (error) {
      if (button) button.disabled = false;
      if (error && error.name === "AbortError") return;
      notify(
        this,
        tr(
          `Teilen fehlgeschlagen: ${errorText(error)}`,
          `Sharing the backup failed: ${errorText(error)}`
        )
      );
    }
  }

  async _importFile(file) {
    if (!file || !this._hass) return;
    try {
      const data = JSON.parse(await file.text());
      const recipes = Array.isArray(data) ? data : data.recipes;
      if (!Array.isArray(recipes)) {
        throw new Error(
          tr(
            "Keine Rezeptliste in der Datei.",
            "No recipe list in the file."
          )
        );
      }
      const reply = await this._hass.callService(
        "recipe_box",
        "import_recipes",
        {
          recipes,
          plan: (data && data.plan) || {},
          groups: (data && data.groups) || [],
          favorites: (data && data.favorites) || [],
        },
        undefined,
        false,
        true
      );
      const response = serviceResponse(reply);
      notify(
        this,
        tr(
          `Sicherung eingelesen: ${(response && response.imported) || 0} Rezepte.`,
          `Backup imported: ${(response && response.imported) || 0} recipes.`
        )
      );
      this._signature = null;
      this._render();
    } catch (error) {
      notify(
        this,
        tr(
          `Laden fehlgeschlagen: ${
            (error && (error.message || error)) || "unbekannter Fehler"
          }`,
          `Loading failed: ${
            (error && (error.message || error)) || "unknown error"
          }`
        )
      );
    }
  }

  async _plan(date, entityId, context = {}) {
    if (!this._hass || !date) return;
    const { service, data } = planCallData(date, entityId, context);
    try {
      await this._hass.callService("recipe_box", service, data);
      notify(this, planNotice(date, entityId, context));
    } catch (error) {
      notify(
        this,
        tr(
          `Wochenplan: ${(error && (error.message || error.code)) || "Fehler"}`,
          `Meal plan: ${(error && (error.message || error.code)) || "error"}`
        )
      );
    } finally {
      this._signature = null;
      this._render();
    }
  }

  async _weekShopping() {
    if (!this._hass) return;
    const entries = this._recipes();
    const visible = new Set(
      weekDays(7, this._planOffset).map((day) => day.iso)
    );
    const targets = [];
    for (const item of mealPlanEntries(this._hass)) {
      if (!visible.has(String(item.date || ""))) continue;
      if (!item.source_url) continue;
      const match = entries.find(
        ({ state }) =>
          String((state.attributes || {}).source_url || "") ===
          String(item.source_url || "")
      );
      if (match) targets.push({ entityId: match.entityId, servings: item.servings });
    }
    if (!targets.length) {
      notify(
        this,
        tr(
          "Im sichtbaren Zeitraum steht noch kein Rezept.",
          "The visible week has no recipe yet."
        )
      );
      return;
    }

    try {
      for (const target of targets) {
        const params = { entity_id: target.entityId };
        const servings = Number(target.servings);
        if (Number.isFinite(servings) && servings > 0) params.servings = servings;
        await this._hass.callService("recipe_box", "add_to_shopping_list", params);
      }
      notify(
        this,
        tr(
          `${targets.length} Rezept(e) aus dem Wochenplan auf die Einkaufsliste übernommen.`,
          `${targets.length} recipe(s) from the meal plan added to the shopping list.`
        )
      );
    } catch (error) {
      notify(
        this,
        tr(
          `Einkaufsliste: ${(error && (error.message || error.code)) || "Fehler"}`,
          `Shopping list: ${(error && (error.message || error.code)) || "error"}`
        )
      );
    }
  }

  _renderDetail(entry) {
    const session = this._session(entry.entityId);
    const baseServings = Number((entry.state.attributes || {}).servings);
    const servings = session.servings || baseServings;

    this.shadowRoot.innerHTML = `${STYLES}
      <ha-card>
        <div class="list-bar">
          <button class="back" type="button">← ${escapeHtml(this._title())}</button>
          <span class="list-bar-title">${escapeHtml(recipeTitle(entry.state))}</span>
          ${this._config.show_delete ? deleteButtonHtml(entry.entityId, false) : ""}
        </div>
        ${detailHtml(entry.state, this._config, session.checked, servings, {
          entityId: entry.entityId,
          hass: this._hass,
          canEdit: true,
          favorite: Boolean((entry.state.attributes || {}).favorite),
          groups: knownGroups(this._hass, this._recipes()),
        })}
      </ha-card>${deleteDialogHtml(
        this._confirmDelete ? this._deleteTitles(this._confirmDelete) : []
      )}`;

    bindDetail(
      this.shadowRoot,
      this._hass,
      entry.entityId,
      session.checked,
      this,
      {
        servings,
        entityId: entry.entityId,
        state: entry.state,
        show_image: this._config.show_image,
        show_steps: this._config.show_steps,
        onServings: (next) => {
          session.servings = next;
          writeSession(entry.entityId, session);
          this._render();
        },
        onSession: () => writeSession(entry.entityId, session),
        onEdit: (source) => this._startEdit(source),
        onFavorite: () => {
          this._signature = null;
          this._render();
        },
      }
    );

    this.shadowRoot.querySelectorAll("button.delete").forEach((button) => {
      button.addEventListener("click", () => {
        this._requestDelete(button.getAttribute("data-entity"));
      });
    });
    this._bindDeleteDialog();

    const back = this.shadowRoot.querySelector("button.back");
    if (back) {
      back.addEventListener("click", () => {
        this._selected = null;
        this._rememberTab("recipes");
        this._signature = null;
        this._render();
        const goBack = this._config && this._config.goBack;
        if (typeof goBack === "function") goBack();
      });
    }
  }
}

const PANEL_MENU_ICON =
  '<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path fill="currentColor" d="M3 6h18v2H3V6zm0 5h18v2H3v-2zm0 5h18v2H3v-2z"/></svg>';

const PANEL_STYLES = `
  :host {
    display: block;
    min-height: 100%;
    background: var(--primary-background-color);
    color: var(--primary-text-color);
  }
  .toolbar {
    position: sticky;
    top: 0;
    z-index: 4;
    display: flex;
    align-items: center;
    gap: 4px;
    min-height: var(--header-height, 56px);
    padding: 0 8px;
    box-sizing: border-box;
    background: var(--app-header-background-color, var(--primary-background-color));
    color: var(--app-header-text-color, var(--primary-text-color));
  }
  .menu {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 44px;
    height: 44px;
    padding: 0;
    border: none;
    border-radius: 50%;
    background: none;
    color: inherit;
    cursor: pointer;
  }
  .menu:active {
    background: var(--secondary-background-color);
  }
  .title {
    font-size: 20px;
    letter-spacing: 0.0125em;
    margin-inline-start: 4px;
  }
  .content {
    padding: 16px;
    box-sizing: border-box;
  }
  recipe-box-list {
    display: block;
    max-width: 960px;
    margin: 0 auto;
  }
`;

/* The sidebar page has no Home Assistant toolbar of its own, so it brings the
 * menu button and title along and lets the URL own tab and open recipe. The
 * phone's back button then walks back through the recipe box instead of
 * leaving it. */
class RecipeBoxPanel extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._card = null;
    this._hass = undefined;
    this._route = undefined;
    this._panel = undefined;
    this._content = null;
    this._titleNode = null;
    this._shell = false;
    this._view = { tab: "recipes", selected: null };
  }

  connectedCallback() {
    this._renderShell();
  }

  _basePath() {
    const urlPath = (this._panel && this._panel.url_path) || "rezeptbox";
    return `/${String(urlPath).replace(/^\/+|\/+$/g, "")}`;
  }

  _renderShell() {
    if (this._shell || !this.shadowRoot) return;
    this._shell = true;
    this.shadowRoot.innerHTML = `<style>${PANEL_STYLES}</style>
      <div class="toolbar">
        <button class="menu" type="button" aria-label="${tr("Menü", "Menu")}">${PANEL_MENU_ICON}</button>
        <span class="title">${escapeHtml((this._panel && this._panel.title) || "Rezeptbox")}</span>
      </div>
      <div class="content"></div>`;
    const menu = this.shadowRoot.querySelector("button.menu");
    if (menu) menu.addEventListener("click", () => this._toggleMenu());
    this._toolbar = this.shadowRoot.querySelector(".toolbar");
    this._content = this.shadowRoot.querySelector(".content");
    this._titleNode = this.shadowRoot.querySelector(".title");
    this._updateToolbar();
  }

  /* Like the Zigbee2MQTT page: the extra bar only appears where there is no
   * sidebar toggle of the app next to it. */
  _updateToolbar() {
    if (!this._toolbar) return;
    const narrow = this._narrow !== false;
    const alwaysHidden = Boolean(
      this._hass && this._hass.dockedSidebar === "always_hidden"
    );
    this._toolbar.hidden = !(narrow || alwaysHidden);
  }

  _toggleMenu() {
    /* Bubbles out of the panel's shadow tree to home-assistant-main, which
     * opens the sidebar. */
    this.dispatchEvent(
      new CustomEvent("hass-toggle-menu", { bubbles: true, composed: true })
    );
  }

  _applyView() {
    if (this._card && this._view) this._card.applyView(this._view);
  }

  _navigate(view, options) {
    const path = viewPath(this._basePath(), view);
    const replace = Boolean(options && options.replace);
    if (typeof window === "undefined" || !window.history) return;
    if (!replace && window.location && window.location.pathname === path) {
      return;
    }
    /* Home Assistant stamps each entry with the page it came from; keeping
     * that up to date is what lets the app go back a step. */
    const state = replace
      ? window.history.state
      : {
          ...(window.history.state || {}),
          from: `${window.location.pathname}${window.location.search || ""}`,
        };
    try {
      window.history[replace ? "replaceState" : "pushState"](state, "", path);
    } catch (error) {
      return;
    }
    window.dispatchEvent(
      new CustomEvent("location-changed", { detail: { replace } })
    );
  }

  _canGoBack() {
    const from = window.history && window.history.state
      ? window.history.state.from
      : undefined;
    return typeof from === "string" && from.startsWith(this._basePath());
  }

  _goBack() {
    if (this._canGoBack()) {
      window.history.back();
      return;
    }
    this._navigate({ tab: "recipes", selected: null }, { replace: true });
  }

  set hass(hass) {
    this._hass = hass;
    const previousLanguage = UI_LANG;
    setUiLanguage(hass);
    if (UI_LANG !== previousLanguage) {
      /* The toolbar is built once; a late language keeps its old labels. */
      this._shell = false;
      this._renderShell();
      if (this._card && this._content) this._content.appendChild(this._card);
    }
    this._renderShell();
    this._updateToolbar();
    if (!this._card && this._content) {
      this._card = document.createElement(LIST_TYPE);
      this._card.setConfig({
        title: tr("Rezepte", "Recipes"),
        show_import: true,
        show_delete: true,
        navigate: (view, options) => this._navigate(view, options),
        goBack: () => this._goBack(),
      });
      this._content.appendChild(this._card);
    }
    if (this._card) {
      this._card.hass = hass;
      this._applyView();
    }
  }

  set narrow(value) {
    this._narrow = value;
    this._updateToolbar();
  }

  set route(route) {
    this._route = route;
    this._view = viewFromPath(route && route.path);
    this._applyView();
  }

  set panel(value) {
    this._panel = value;
    this._renderShell();
    if (this._titleNode) {
      this._titleNode.textContent = (value && value.title) || "Rezeptbox";
    }
  }
}

if (!customElements.get(DETAIL_TYPE)) {
  customElements.define(DETAIL_TYPE, RecipeBoxCard);
}

if (!customElements.get(PANEL_TYPE)) {
  customElements.define(PANEL_TYPE, RecipeBoxPanel);
}

if (!customElements.get(LIST_TYPE)) {
  customElements.define(LIST_TYPE, RecipeBoxListCard);
}

window.customCards = window.customCards || [];
const CUSTOM_CARDS = [
  {
    type: LIST_TYPE,
    name: "Rezeptbox Liste",
    description: "",
    preview: false,
  },
  {
    type: DETAIL_TYPE,
    name: "Rezeptbox Rezept",
    description: "",
    preview: false,
  },
];

/* The picker is filled once when the file loads, so the texts are written
 * again whenever the language changes. */
localizeCustomCards = () => {
  CUSTOM_CARDS[0].name = tr("Rezeptbox Liste", "Rezeptbox list");
  CUSTOM_CARDS[0].description = tr(
    "Zeigt alle Rezepte als Liste und importiert neue Rezepte per URL; ein Rezept antippen öffnet die Details.",
    "Shows all recipes as a list and imports new recipes from URLs; tap a recipe to open its details."
  );
  CUSTOM_CARDS[1].name = tr("Rezeptbox Rezept", "Rezeptbox recipe");
  CUSTOM_CARDS[1].description = tr(
    "Zeigt ein importiertes Rezept mit Bild, Zutaten und Zubereitung.",
    "Shows an imported recipe with photo, ingredients and preparation."
  );
};
localizeCustomCards();
for (const card of CUSTOM_CARDS) {
  if (!window.customCards.some((known) => known.type === card.type)) {
    window.customCards.push(card);
  }
}

console.info(
  `%c REZEPTBOX-CARDS %c v${CARD_VERSION} `,
  "color:#fff;background:#2e7d32;font-weight:600",
  "color:#2e7d32;background:#e8f5e9"
);
