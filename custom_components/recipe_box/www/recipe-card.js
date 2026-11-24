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

const CARD_VERSION = "2.0.3";
const DETAIL_TYPE = "recipe-box-card";
const LIST_TYPE = "recipe-box-list";
const PANEL_TYPE = "recipe-box-panel";
const INTEGRATION = "recipe_box";

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
  if (!hours) return `${rest} Min.`;
  return rest ? `${hours} Std. ${rest} Min.` : `${hours} Std.`;
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
  return `${servings} ${servings === 1 ? "Portion" : "Portionen"}`;
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
    if (button) button.textContent = `⏱ ${minutes} Min.`;
    return;
  }

  const endsAt = Date.now() + minutes * 60000;
  const tick = () => {
    const left = endsAt - Date.now();
    if (left <= 0) {
      clearInterval(interval);
      TIMERS.delete(key);
      if (button) button.textContent = "Fertig ✓";
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
  return `<div class="section"><h3>Nährwerte</h3><div class="nutrition">${rows
    .map(
      ([label, value]) =>
        `<span><b>${escapeHtml(label)}</b> ${escapeHtml(value)}</span>`
    )
    .join("")}</div></div>`;
};

const updateHintHtml = (attributes) => {
  const error = String((attributes && attributes.update_error) || "");
  if (!error) return "";
  return `<p class="error">Letzter Abruf fehlgeschlagen (${escapeHtml(
    error
  )}). Angezeigt wird die gespeicherte Version.</p>`;
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

const weekDays = (count = 7) => {
  const today = new Date();
  const days = [];
  for (let offset = 0; offset < count; offset += 1) {
    const date = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate() + offset
    );
    days.push({
      iso: isoDate(date),
      label: date.toLocaleDateString("de-DE", {
        weekday: "short",
        day: "2-digit",
        month: "2-digit",
      }),
    });
  }
  return days;
};

const filterBarHtml = (entries, filter) => {
  const tags = [
    ...new Set(
      entries.flatMap(({ state }) =>
        ((state.attributes || {}).tags || []).filter(Boolean)
      )
    ),
  ].sort((first, second) => first.localeCompare(second, "de"));
  const tagOptions = tags
    .map(
      (tag) =>
        `<option value="${escapeHtml(tag)}"${
          filter.tag === tag ? " selected" : ""
        }>${escapeHtml(tag)}</option>`
    )
    .join("");
  return `<div class="filter-bar">
    <input class="filter-search" type="search" placeholder="Rezepte durchsuchen" value="${escapeHtml(
      filter.query
    )}">
    ${
      tags.length
        ? `<select class="filter-tag"><option value="">Alle Tags</option>${tagOptions}</select>`
        : ""
    }
    <select class="filter-time">
      <option value="">Beliebige Zeit</option>
      <option value="30"${filter.maxTime === "30" ? " selected" : ""}>bis 30 Min.</option>
      <option value="60"${filter.maxTime === "60" ? " selected" : ""}>bis 60 Min.</option>
    </select>
    <select class="filter-sort">
      <option value="title"${filter.sort === "title" ? " selected" : ""}>A–Z</option>
      <option value="time"${filter.sort === "time" ? " selected" : ""}>Schnellste zuerst</option>
    </select>
    <button class="random" type="button">Was kochen?</button>
  </div>`;
};

const manualFormHtml = () => `<div class="manual">
  <p class="tab-hint">Eigenes Rezept anlegen – Zutaten und Zubereitung je eine Zeile.</p>
  <div class="manual-body">
    <input class="manual-title" type="text" placeholder="Titel">
    <input class="manual-servings" type="number" min="1" max="100" placeholder="Portionen">
    <textarea class="manual-ingredients" rows="3" placeholder="Zutaten – eine pro Zeile"></textarea>
    <textarea class="manual-instructions" rows="3" placeholder="Zubereitung – ein Schritt pro Zeile"></textarea>
    <input class="manual-tags" type="text" placeholder="Tags, mit Komma getrennt">
    <button class="manual-save" type="button">Rezept speichern</button>
  </div>
</div>`;

const TABS = [
  { id: "recipes", label: "Rezepte" },
  { id: "data", label: "Daten" },
  { id: "plan", label: "Wochenplan" },
];

const tabsHtml = (active) => `<div class="tabs" role="tablist">${TABS.map(
  (tab) => `<button class="tab${active === tab.id ? " active" : ""}" type="button" role="tab" aria-selected="${active === tab.id}" data-tab="${tab.id}">${escapeHtml(tab.label)}</button>`
).join("")}</div>`;

const planHtml = (hass, entries) => {
  const planned = new Map(
    mealPlanEntries(hass).map((entry) => [String(entry.date), entry])
  );
  const rows = weekDays()
    .map((day) => {
      const current = planned.get(day.iso);
      const options = entries
        .map(({ entityId, state }) => {
          const sourceUrl = String((state.attributes || {}).source_url || "");
          const selected =
            current && String(current.source_url || "") === sourceUrl;
          return `<option value="${escapeHtml(entityId)}"${
            selected ? " selected" : ""
          }>${escapeHtml(recipeTitle(state))}</option>`;
        })
        .join("");
      return `<div class="plan-row">
        <span class="plan-day">${escapeHtml(day.label)}</span>
        <select class="plan-select" data-date="${day.iso}"><option value="">—</option>${options}</select>
        ${
          current
            ? `<button class="plan-clear" type="button" data-date="${day.iso}" title="Tag leeren" aria-label="Tag leeren">✕</button>`
            : ""
        }
      </div>`;
    })
    .join("");
  return `<div class="plan">
    <p class="tab-hint">Wochenplan für die nächsten sieben Tage.</p>
    <div class="plan-body">
      ${rows}
      <button class="week-shopping" type="button">Woche auf die Einkaufsliste</button>
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
    recipeTitle(first.state).localeCompare(recipeTitle(second.state), "de")
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
    <button class="servings-button" type="button" data-step="-1" aria-label="Weniger Portionen"${value <= 1 ? " disabled" : ""}>−</button>
    <span class="servings-value">${escapeHtml(formatServings(value))}</span>
    <button class="servings-button" type="button" data-step="1" aria-label="Mehr Portionen"${value >= 99 ? " disabled" : ""}>+</button>
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
          <h4>${escapeHtml(group.name || "Zutaten")}</h4>
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
  return `<div class="section"><h3>Zubereitung</h3><ol class="steps">${steps
    .map(
      (step, index) =>
        `<li><span class="step-text">${escapeHtml(step)}</span>${stepTimers(step)
          .map(
            (minutes) =>
              `<button class="step-timer" type="button" data-timer="${index}" data-minutes="${minutes}">⏱ ${minutes} Min.</button>`
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
    ? `<a class="source" href="${escapeHtml(attributes.source_url)}" target="_blank" rel="noopener noreferrer">Originalrezept ↗</a>`
    : "<span></span>";
  const refresh =
    meta.entityId && isWebUrl(attributes.source_url)
      ? `<button class="refresh" type="button">Aktualisieren</button>`
      : "";
  const printButton = `<button class="print" type="button">Drucken</button>`;
  const shopping =
    Array.isArray(attributes.ingredients) && attributes.ingredients.length
      ? `<div class="shopping-row">
          <label class="only-missing"><input class="only-missing-input" type="checkbox" checked> nur fehlende</label>
          <button class="shopping" type="button">Zutaten auf die Liste</button>
        </div>`
      : "";
  const servingsControl = forPrint
    ? ""
    : servingsControlHtml(attributes, chosenServings);
  const footer = forPrint
    ? ""
    : `<div class="footer">${source}${refresh}${printButton}${shopping}</div>`;

  return `${image}
    <div class="content">
      <h2>${escapeHtml(recipeTitle(state))}</h2>
      ${chipsHtml(attributes, chosenServings)}
      ${description}
      ${tagsHtml(attributes)}
      ${updateHintHtml(attributes)}
      ${ingredients ? `<div class="section"><h3>Zutaten</h3>${servingsControl}${ingredients}</div>` : ""}
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
<html lang="de">
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

const deleteButtonHtml = (entityId, pending) => `<button class="delete${pending ? " confirm" : ""}" type="button" data-entity="${escapeHtml(entityId)}" title="Rezept löschen" aria-label="Rezept löschen">${pending ? "Löschen?" : `<ha-icon icon="mdi:delete-outline"></ha-icon>`}</button>`;

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
        notify(dispatcher, "Rezept aktualisiert.");
      } catch (error) {
        notify(dispatcher, `Aktualisieren: ${error.message || error.code || error}`);
      } finally {
        refresh.disabled = false;
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
        notify(dispatcher, "Drucken wird von diesem Gerät nicht unterstützt.");
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
          ? "Fehlende Zutaten zur Einkaufsliste hinzugefügt."
          : "Zutaten zur Einkaufsliste hinzugefügt."
      );
    } catch (error) {
      notify(dispatcher, `Einkaufsliste: ${error.message || error}`);
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
  li.recipe-row { display: flex; align-items: center; gap: 2px; }
  button.recipe-item { display: flex; flex: 1 1 auto; min-width: 0; align-items: center; gap: 12px; padding: 10px 0; background: none; border: none; text-align: left; color: var(--primary-text-color); cursor: pointer; }
  button.delete { flex: 0 0 auto; display: inline-flex; align-items: center; background: none; border: none; color: var(--secondary-text-color); cursor: pointer; padding: 8px 6px; border-radius: 6px; font-size: 0.78rem; --mdc-icon-size: 20px; }
  button.delete:hover { color: var(--error-color, #db4437); background: rgba(219, 68, 55, 0.08); }
  button.delete.confirm { color: var(--error-color, #db4437); font-weight: 600; }
  .list-bar button.delete { margin-left: auto; }
  button.recipe-item:hover { background: var(--secondary-background-color, rgba(127, 127, 127, 0.08)); }
  .thumb { width: 48px; height: 48px; border-radius: 8px; object-fit: cover; flex: 0 0 auto; }
  .thumb.placeholder { display: flex; align-items: center; justify-content: center; background: var(--secondary-background-color, rgba(127, 127, 127, 0.15)); color: var(--secondary-text-color); }
  .item-text { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .item-title { font-size: 0.95rem; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .item-meta { font-size: 0.8rem; color: var(--secondary-text-color); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
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
  button.refresh, button.print { background: none; border: 1px solid var(--divider-color, rgba(127, 127, 127, 0.4)); border-radius: 6px; padding: 6px 10px; font-size: 0.82rem; color: var(--primary-text-color); cursor: pointer; }
  button.refresh:hover, button.print:hover { border-color: var(--primary-color); }
  .filter-bar { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
  .filter-bar input, .filter-bar select { padding: 6px 8px; border-radius: 6px; border: 1px solid var(--divider-color, rgba(127, 127, 127, 0.4)); background: var(--card-background-color, transparent); color: var(--primary-text-color); font-size: 0.85rem; }
  .filter-bar input.filter-search { flex: 1 1 150px; min-width: 0; }
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
  .tab-hint { margin: 0; font-size: 0.82rem; color: var(--secondary-text-color); }
  .manual-body, .plan-body { display: flex; flex-direction: column; gap: 6px; }
  .manual-body input, .manual-body textarea { padding: 8px 10px; border-radius: 6px; border: 1px solid var(--divider-color, rgba(127, 127, 127, 0.4)); background: var(--card-background-color, transparent); color: var(--primary-text-color); font-size: 0.88rem; font-family: inherit; }
  .manual-body button, button.week-shopping { align-self: flex-start; background: var(--primary-color); color: var(--text-primary-color, #fff); border: none; border-radius: 6px; padding: 8px 14px; font-size: 0.88rem; cursor: pointer; }
  .plan-row { display: flex; align-items: center; gap: 8px; }
  .plan-day { min-width: 74px; font-size: 0.82rem; color: var(--secondary-text-color); }
  .plan-select { flex: 1 1 auto; min-width: 0; padding: 6px 8px; border-radius: 6px; border: 1px solid var(--divider-color, rgba(127, 127, 127, 0.4)); background: var(--card-background-color, transparent); color: var(--primary-text-color); font-size: 0.85rem; }
  button.plan-clear { background: none; border: none; color: var(--secondary-text-color); cursor: pointer; font-size: 0.85rem; padding: 4px 6px; }
  @media print {
    .servings, .shopping-row, .filter-bar, .tools, .import-bar, .tabs, .footer button, .list-bar, button.delete { display: none !important; }
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
      throw new Error("recipe-box-card: Bitte 'entity' angeben.");
    }
    this._config = { show_image: true, show_steps: true, ...config };
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
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
          <p class="empty">Entität ${escapeHtml(this._config ? this._config.entity : "")} nicht gefunden.</p>
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
      }
    );
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
    this._pendingDelete = null;
    this._deleteTimer = null;
    this._filter = { query: "", tag: "", maxTime: "", sort: "title" };
    this._tab = "recipes";
    this._restoreFocus = false;
  }

  static getStubConfig() {
    return { title: "Rezepte" };
  }

  setConfig(config) {
    const entities =
      typeof (config || {}).entities === "string"
        ? [config.entities]
        : (config || {}).entities;
    this._config = {
      title: "Rezepte",
      show_image: true,
      show_steps: true,
      show_import: true,
      show_delete: true,
      show_tools: true,
      ...config,
      entities,
    };
    this._signature = null;
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
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
      )}`;
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

  _session(entityId) {
    if (!this._sessions.has(entityId)) {
      this._sessions.set(entityId, loadSession(entityId));
    }
    return this._sessions.get(entityId);
  }

  _filtered(entries) {
    const { query, tag, maxTime, sort } = this._filter;
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
      notify(this, "Bitte mindestens eine Rezept-URL einfügen.");
      return;
    }
    if (this._importing || !this._hass) return;

    this._importing = true;
    this._render();
    try {
      if (urls.length === 1) {
        const response = await this._hass.callService(
          "recipe_box",
          "import_recipe",
          { url: urls[0] },
          undefined,
          false,
          true
        );
        this._importUrl = "";
        const title = response && response.title;
        notify(this, title ? `Rezept importiert: ${title}` : "Rezept importiert.");
      } else {
        const response = await this._hass.callService(
          "recipe_box",
          "import_recipe",
          { urls },
          undefined,
          false,
          true
        );
        this._importUrl = "";
        const imported = (response && response.imported) || [];
        const failed = (response && response.failed) || [];
        notify(this, this._importSummary(imported.length, failed));
      }
    } catch (error) {
      notify(
        this,
        `Import fehlgeschlagen: ${(error && (error.message || error.code)) || "unbekannter Fehler"}`
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
      return `${importedCount} von ${total} Rezepten importiert.`;
    }
    const first = failed[0] || {};
    const raw = String(first.url || "");
    const label = raw.length > 60 ? `${raw.slice(0, 57)}…` : raw;
    return `${importedCount} von ${total} importiert, ${failed.length} fehlgeschlagen (${label}: ${first.error || "Fehler"}).`;
  }

  _requestDelete(entityId) {
    if (!entityId || !this._config.show_delete || !this._hass) return;

    if (this._pendingDelete === entityId) {
      this._delete(entityId);
      return;
    }

    this._pendingDelete = entityId;
    clearTimeout(this._deleteTimer);
    this._deleteTimer = setTimeout(() => {
      this._pendingDelete = null;
      this._signature = null;
      this._render();
    }, 4000);
    this._signature = null;
    this._render();
  }

  async _delete(entityId) {
    clearTimeout(this._deleteTimer);
    const entry = this._recipes().find((item) => item.entityId === entityId);
    const title = entry ? recipeTitle(entry.state) : "";
    this._pendingDelete = null;
    try {
      await this._hass.callService("recipe_box", "remove_recipe", {
        entity_id: entityId,
      });
      notify(this, title ? `Rezept gelöscht: ${title}` : "Rezept gelöscht.");
      if (this._selected === entityId) this._selected = null;
    } catch (error) {
      notify(
        this,
        `Löschen fehlgeschlagen: ${(error && (error.message || error.code)) || "unbekannter Fehler"}`
      );
    } finally {
      this._signature = null;
      this._render();
    }
  }

  _renderList(entries) {
    const filtered = this._filtered(entries);
    const items = filtered.map(({ entityId, state }) => {
      const attributes = state.attributes || {};
      const meta = [
        formatMinutes(attributes.total_time_minutes),
        formatServings(attributes.servings),
        formatRating(attributes.rating, attributes.rating_count),
      ]
        .filter(Boolean)
        .join(" · ");
      const thumb =
        this._config.show_image && attributes.image_url
          ? `<img class="thumb" src="${escapeHtml(attributes.image_url)}" alt="" loading="lazy">`
          : `<span class="thumb placeholder"><ha-icon icon="mdi:chef-hat"></ha-icon></span>`;

      const removeButton = this._config.show_delete
        ? deleteButtonHtml(entityId, this._pendingDelete === entityId)
        : "";

      return `<li class="recipe-row">
        <button class="recipe-item" type="button" data-entity="${escapeHtml(entityId)}">
          ${thumb}
          <span class="item-text">
            <span class="item-title">${escapeHtml(recipeTitle(state))}</span>
            <span class="item-meta">${escapeHtml(meta)}</span>
          </span>
          <ha-icon class="chevron" icon="mdi:chevron-right"></ha-icon>
        </button>
        ${removeButton}
      </li>`;
    });

    const importBar = this._config.show_import
      ? `<div class="import-bar">
          <textarea class="import-input" rows="2" placeholder="Rezept-URLs – eine pro Zeile"${this._importing ? " disabled" : ""}>${escapeHtml(this._importUrl)}</textarea>
          <button class="import-button" type="button"${this._importing ? " disabled" : ""}>${this._importing ? "Importiere…" : "Importieren"}</button>
        </div>`
      : "";

    const tools = this._config.show_tools
      ? `<div class="tools">
        <button class="export" type="button">Sichern</button>
        <label class="import-file-label">Laden<input class="import-file" type="file" accept="application/json"></label>
      </div>`
      : "";

    const filterBar = entries.length > 1 ? filterBarHtml(entries, this._filter) : "";
    const emptyText = entries.length
      ? "Keine Rezepte passen zu Suche oder Filter."
      : "Noch keine Rezepte. Füge oben eine oder mehrere Rezept-URLs ein – zum Beispiel von Chefkoch.";
    const body = filtered.length
      ? `<ul class="recipe-list">${items.join("")}</ul>`
      : `<p class="empty">${emptyText}</p>`;
    const count =
      filtered.length === entries.length
        ? entries.length
        : `${filtered.length}/${entries.length}`;

    const showTabs = Boolean(this._config.show_tools);
    const tab = showTabs ? this._tab : "recipes";
    const panels = {
      recipes: `${filterBar}${body}`,
      data: `${importBar}${tools}${manualFormHtml()}`,
      plan: entries.length
        ? planHtml(this._hass, entries)
        : `<p class="empty">Noch keine Rezepte für den Wochenplan.</p>`,
    };

    this.shadowRoot.innerHTML = `${STYLES}
      <ha-card>
        <div class="content">
          <div class="list-header">
            <h2>${escapeHtml(this._config.title)}</h2>
            <span class="count">${count}</span>
          </div>
          ${showTabs ? tabsHtml(tab) : ""}
          <div class="tab-panel" role="tabpanel">${panels[tab] || panels.recipes}</div>
        </div>
      </ha-card>`;

    this.shadowRoot.querySelectorAll("button.tab").forEach((button) => {
      button.addEventListener("click", () => {
        const next = button.getAttribute("data-tab");
        if (!next || next === this._tab) return;
        this._tab = next;
        this._signature = null;
        this._render();
      });
    });

    this.shadowRoot.querySelectorAll("button.recipe-item").forEach((button) => {
      button.addEventListener("click", () => {
        this._selected = button.getAttribute("data-entity");
        this._signature = null;
        this._render();
      });
    });

    this.shadowRoot.querySelectorAll("button.delete").forEach((button) => {
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        this._requestDelete(button.getAttribute("data-entity"));
      });
    });

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
  }

  _openRandom(entries) {
    const pool = this._filtered(entries);
    if (!pool.length) {
      notify(this, "Keine Rezepte in der aktuellen Auswahl.");
      return;
    }
    const pick = pool[Math.floor(Math.random() * pool.length)];
    this._selected = pick.entityId;
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
      notify(this, "Titel und mindestens eine Zutat werden benötigt.");
      return;
    }
    if (Number.isFinite(servings) && servings > 0) data.servings = servings;

    try {
      await this._hass.callService(
        "recipe_box",
        "add_recipe",
        data,
        undefined,
        false,
        true
      );
      notify(this, `Rezept gespeichert: ${data.title}`);
      this._tab = "recipes";
      this._signature = null;
      this._render();
    } catch (error) {
      notify(
        this,
        `Speichern fehlgeschlagen: ${
          (error && (error.message || error.code)) || "unbekannter Fehler"
        }`
      );
    }
  }

  async _export() {
    if (!this._hass) return;
    try {
      const data = await this._hass.callService(
        "recipe_box",
        "export_recipes",
        {},
        undefined,
        false,
        true
      );
      if (!data || typeof data !== "object" || !Array.isArray(data.recipes)) {
        throw new Error("Der Export-Service hat keine Sicherungsdaten geliefert.");
      }

      const text = JSON.stringify(data, null, 2);
      const filename = `rezeptbox-${isoDate(new Date())}.json`;
      const type = "application/json";

      // Chromium opens the real save dialog through the File System Access API.
      if (typeof window.showSaveFilePicker === "function") {
        let handle = null;
        try {
          handle = await window.showSaveFilePicker({
            suggestedName: filename,
            types: [
              {
                description: "Rezeptbox-Sicherung",
                accept: { "application/json": [".json"] },
              },
            ],
          });
          const writable = await handle.createWritable();
          await writable.write(new Blob([text], { type }));
          await writable.close();
          notify(this, `Sicherung gespeichert: ${handle.name || filename}`);
          return;
        } catch (error) {
          if (error && error.name === "AbortError") return;
          /* the picker is unavailable here, the download below takes over */
        }
      }

      const blob = new Blob([text], { type });

      // Mobile Home Assistant apps have no download dialog; the share sheet
      // lets the user store the backup in the file manager instead.
      if (
        typeof File === "function" &&
        typeof navigator.share === "function" &&
        typeof navigator.canShare === "function" &&
        navigator.maxTouchPoints > 0
      ) {
        const file = new File([blob], filename, { type });
        if (navigator.canShare({ files: [file] })) {
          try {
            await navigator.share({ files: [file], title: "Rezeptbox-Sicherung" });
            notify(this, "Sicherung gespeichert.");
            return;
          } catch (error) {
            if (error && error.name === "AbortError") return;
          }
        }
      }

      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      link.rel = "noopener";
      link.style.display = "none";
      document.body.appendChild(link);
      link.click();
      link.remove();
      // Revoking right after the click cancels the download in some browsers.
      setTimeout(() => URL.revokeObjectURL(url), 30000);
      notify(this, `Sicherung heruntergeladen: ${filename}`);
    } catch (error) {
      notify(
        this,
        `Sichern fehlgeschlagen: ${
          (error && (error.message || error.code)) || "unbekannter Fehler"
        }`
      );
    }
  }

  async _importFile(file) {
    if (!file || !this._hass) return;
    try {
      const data = JSON.parse(await file.text());
      const recipes = Array.isArray(data) ? data : data.recipes;
      if (!Array.isArray(recipes)) {
        throw new Error("Keine Rezeptliste in der Datei.");
      }
      const response = await this._hass.callService(
        "recipe_box",
        "import_recipes",
        { recipes, plan: (data && data.plan) || {} },
        undefined,
        false,
        true
      );
      notify(
        this,
        `Sicherung eingelesen: ${(response && response.imported) || 0} Rezepte.`
      );
      this._signature = null;
      this._render();
    } catch (error) {
      notify(
        this,
        `Laden fehlgeschlagen: ${
          (error && (error.message || error)) || "unbekannter Fehler"
        }`
      );
    }
  }

  async _plan(date, entityId) {
    if (!this._hass || !date) return;
    try {
      if (entityId) {
        await this._hass.callService("recipe_box", "plan_recipe", {
          date,
          entity_id: entityId,
        });
        notify(this, "Rezept eingeplant.");
      } else {
        await this._hass.callService("recipe_box", "clear_meal_plan", { date });
        notify(this, "Tag geleert.");
      }
    } catch (error) {
      notify(
        this,
        `Wochenplan: ${(error && (error.message || error.code)) || "Fehler"}`
      );
    } finally {
      this._signature = null;
      this._render();
    }
  }

  async _weekShopping() {
    if (!this._hass) return;
    const entries = this._recipes();
    const targets = [];
    for (const item of mealPlanEntries(this._hass)) {
      const match = entries.find(
        ({ state }) =>
          String((state.attributes || {}).source_url || "") ===
          String(item.source_url || "")
      );
      if (match) targets.push({ entityId: match.entityId, servings: item.servings });
    }
    if (!targets.length) {
      notify(this, "Im Wochenplan steht noch kein Rezept.");
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
        `${targets.length} Rezept(e) aus dem Wochenplan auf die Einkaufsliste übernommen.`
      );
    } catch (error) {
      notify(
        this,
        `Einkaufsliste: ${(error && (error.message || error.code)) || "Fehler"}`
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
          <button class="back" type="button">← ${escapeHtml(this._config.title || "Rezepte")}</button>
          <span class="list-bar-title">${escapeHtml(recipeTitle(entry.state))}</span>
          ${this._config.show_delete ? deleteButtonHtml(entry.entityId, this._pendingDelete === entry.entityId) : ""}
        </div>
        ${detailHtml(entry.state, this._config, session.checked, servings, {
          entityId: entry.entityId,
        })}
      </ha-card>`;

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
      }
    );

    this.shadowRoot.querySelectorAll("button.delete").forEach((button) => {
      button.addEventListener("click", () => {
        this._requestDelete(button.getAttribute("data-entity"));
      });
    });

    const back = this.shadowRoot.querySelector("button.back");
    if (back) {
      back.addEventListener("click", () => {
        this._selected = null;
        this._tab = "recipes";
        this._signature = null;
        this._render();
      });
    }
  }
}

class RecipeBoxPanel extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._card = null;
    this._hass = undefined;
  }

  set hass(hass) {
    this._hass = hass;
    if (!this._card) {
      this.shadowRoot.innerHTML = `<style>
        :host { display: block; padding: 16px; box-sizing: border-box; }
        recipe-box-list { display: block; max-width: 960px; margin: 0 auto; }
      </style>`;
      this._card = document.createElement(LIST_TYPE);
      this._card.setConfig({
        title: "Rezepte",
        show_import: true,
        show_delete: true,
      });
      this.shadowRoot.appendChild(this._card);
    }
    this._card.hass = hass;
  }

  set narrow(value) {
    this._narrow = value;
  }

  set route(value) {
    this._route = value;
  }

  set panel(value) {
    this._panel = value;
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
    description:
      "Zeigt alle Rezepte als Liste und importiert neue Rezepte per URL; ein Rezept antippen öffnet die Details.",
    preview: false,
  },
  {
    type: DETAIL_TYPE,
    name: "Rezeptbox Rezept",
    description:
      "Zeigt ein importiertes Rezept mit Bild, Zutaten und Zubereitung.",
    preview: false,
  },
];
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
