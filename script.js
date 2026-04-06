/**
 * Alien Colony — hunting expedition prototype (horror tone).
 * Data-driven: tune PREY, UNITS, AREAS, RESOURCE_DEFS in this file.
 * Plain HTML/CSS/JS, localStorage.
 */

(function () {
  "use strict";

  /** Resolve `assets/...` against this script’s URL (fixes file:// and subfolder hosting). */
  var ASSET_ORIGIN =
    document.currentScript && document.currentScript.src
      ? document.currentScript.src
      : "";

  function resolveAssetUrl(rel) {
    if (!rel) return "";
    if (/^(https?:|data:|blob:)/i.test(rel)) return rel;
    try {
      if (ASSET_ORIGIN) return new URL(rel, ASSET_ORIGIN).href;
      return new URL(rel, window.location.href).href;
    } catch (e) {
      return rel;
    }
  }

  var GAME_VERSION = "1.0";
  var STORAGE_KEY = "alienColony_v" + GAME_VERSION.replace(/\./g, "");
  var AUTOSAVE_MS = 5000;
  var TICK_MS = 250;
  var OFFLINE_CAP_SEC = 86400;
  var MAX_HUNT_LOG = 18;
  /** All expeditions use this duration; hunt button speeds up (shaves time) while active. */
  var HUNT_DURATION_SEC = 30;
  var HUNT_CLICK_SHAVE_MS = 1000;

  /** Display + id keys for economy (id "largeHeart" → label "Large Heart"). */
  var RESOURCE_DEFS = [
    { id: "meat", label: "Meat", statClass: "meat" },
    { id: "teeth", label: "Teeth", statClass: "teeth" },
    { id: "scales", label: "Scales", statClass: "scales" },
    { id: "largeHeart", label: "Large Heart", statClass: "heart" },
    { id: "brains", label: "Brains", statClass: "brains" },
  ];

  /**
   * Prey: drops + optional fleshmite 1v1 rules (binary: fleshmite wins and kills, or fleshmite dies).
   * fleshmiteWinChance: P(kill prey, loot). fleshmiteLoseChance: optional P(fleshmite dies); remainder = stalemate (live, no loot).
   * If fleshmiteLoseChance omitted, 1 - win = lose (binary). Optional preyAlwaysDiesForFleshmite: forced kill (unused in current table).
   * fleshmiteAlwaysLoses: Fleshmite always dies (deer, farm animals, humans).
   * Other units without a solo table use pack HP combat (health/attack/danger).
   */
  var PREY = {
    cricket: {
      id: "cricket",
      name: "cricket",
      health: 4,
      attack: 1,
      danger: 0,
      canCauseTripDeaths: false,
      fleshmiteWinChance: 0.9,
      fleshmiteLoseChance: 0.05,
      drops: [{ resource: "meat", min: 1, max: 3 }],
    },
    spider: {
      id: "spider",
      name: "spider",
      health: 14,
      attack: 4,
      danger: 1,
      canCauseTripDeaths: false,
      fleshmiteWinChance: 0.7,
      fleshmiteLoseChance: 0.1,
      drops: [{ resource: "meat", min: 4, max: 6 }],
    },
    mouse: {
      id: "mouse",
      name: "mouse",
      health: 10,
      attack: 2,
      danger: 0,
      canCauseTripDeaths: false,
      fleshmiteWinChance: 0.45,
      fleshmiteLoseChance: 0.2,
      drops: [
        { resource: "meat", min: 10, max: 15 },
        { resource: "teeth", min: 1, max: 1 },
      ],
    },
    rat: {
      id: "rat",
      name: "rats",
      health: 18,
      attack: 6,
      danger: 1,
      canCauseTripDeaths: false,
      fleshmiteWinChance: 0.12,
      fleshmiteLoseChance: 0.48,
      drops: [
        { resource: "meat", min: 20, max: 30 },
        { resource: "teeth", min: 1, max: 2 },
      ],
    },
    snake: {
      id: "snake",
      name: "snakes",
      health: 28,
      attack: 9,
      danger: 2,
      canCauseTripDeaths: false,
      fleshmiteWinChance: 0,
      fleshmiteLoseChance: 0.95,
      drops: [
        { resource: "meat", min: 60, max: 100 },
        { resource: "teeth", min: 10, max: 10 },
        { resource: "scales", min: 1, max: 1 },
      ],
    },
    deer: {
      id: "deer",
      name: "deer",
      health: 85,
      attack: 11,
      danger: 2,
      canCauseTripDeaths: true,
      fleshmiteAlwaysLoses: true,
      drops: [
        { resource: "meat", min: 45, max: 95 },
        { resource: "largeHeart", min: 0, max: 1, chance: 0.14 },
      ],
    },
    cow: {
      id: "cow",
      name: "farm animals",
      health: 110,
      attack: 7,
      danger: 1,
      canCauseTripDeaths: true,
      fleshmiteAlwaysLoses: true,
      drops: [
        { resource: "meat", min: 55, max: 110 },
        { resource: "largeHeart", min: 1, max: 2 },
      ],
    },
    human: {
      id: "human",
      name: "humans",
      health: 32,
      attack: 16,
      danger: 3,
      canCauseTripDeaths: true,
      fleshmiteAlwaysLoses: true,
      drops: [
        { resource: "brains", min: 1, max: 3 },
        { resource: "meat", min: 4, max: 18, chance: 0.7 },
      ],
    },
  };

  var PREY_DOSSIER_ORDER = [
    "cricket",
    "spider",
    "mouse",
    "rat",
    "snake",
    "deer",
    "cow",
    "human",
  ];

  /**
   * Alien Feeder solo 1v1: cricket–mouse always kill; rat/snake/deer/cow use pw/pl + stalemate;
   * human always dies (no loot).
   */
  var ALIEN_FEEDER_SOLO = {
    cricket: { kind: "alwaysKill" },
    spider: { kind: "alwaysKill" },
    mouse: { kind: "alwaysKill" },
    rat: { kind: "odds", pw: 0.92, pl: 0.05 },
    snake: { kind: "odds", pw: 0.65, pl: 0.1 },
    deer: { kind: "odds", pw: 0.35, pl: 0.2 },
    cow: { kind: "odds", pw: 0.18, pl: 0.42 },
    human: { kind: "alwaysLose" },
  };

  /**
   * Cave devourer solo 1v1: fixed kill / death / stalemate per prey (same resolution as Alien Feeder table).
   */
  var CAVE_DEVOURER_SOLO = {
    cricket: { kind: "alwaysKill" },
    spider: { kind: "alwaysKill" },
    mouse: { kind: "alwaysKill" },
    rat: { kind: "odds", pw: 0.92, pl: 0.05 },
    snake: { kind: "odds", pw: 0.68, pl: 0.1 },
    deer: { kind: "odds", pw: 0.38, pl: 0.18 },
    cow: { kind: "odds", pw: 0.08, pl: 0.55 },
    human: { kind: "alwaysLose" },
  };

  var PREY_NAME_TO_ID = (function () {
    var m = {};
    var pid;
    for (pid in PREY) {
      if (PREY.hasOwnProperty(pid)) m[PREY[pid].name] = pid;
    }
    m["crickets"] = "cricket";
    m["spiders"] = "spider";
    return m;
  })();

  /**
   * Units: costs = partial resource map. vsPrey / huntEffectiveness = pack HP combat only (Fleshmite & Alien Feeder).
   * chamberLevel = creature sprite column 1–5.
   */
  var UNITS = [
    {
      id: "fleshmite",
      name: "Fleshmite",
      costs: { meat: 10 },
      health: 5,
      attack: 2,
      huntEffectiveness: 1,
      vsPrey: {
        cricket: 1.45,
        spider: 1.2,
        mouse: 1.15,
        rat: 1.1,
        snake: 0.32,
        deer: 0.18,
        cow: 0.16,
        human: 0.22,
      },
      buyVerb: "Hatch",
      /** Shop card thumbnail. */
      portrait: "assets/organisms/fleshmite_shop.png",
      /** Dossier modal full art (Pack focus). */
      dossierPortrait: "assets/organisms/fleshmite_dossier.png",
      /** Each deployed individual gets exactly one 1v1 encounter (not a shared pack run). */
      oneEncounterPerUnit: true,
      chamberFlavor:
        "Barely alive—only just able to catch bugs in the cracks. Send them out hungry.",
      chamberLevel: 1,
    },
    {
      id: "tunnel_jack",
      name: "Alien Feeder",
      /** Shop shows ?????? until first hatch; then name + art stay unlocked even at 0 count. */
      maskNameUntilOwned: true,
      stickRevealAfterFirstPurchase: true,
      costs: { meat: 160, teeth: 8 },
      health: 14,
      attack: 6,
      huntEffectiveness: 1.05,
      vsPrey: {
        cricket: 1.15,
        spider: 1.15,
        mouse: 1.25,
        rat: 1.2,
        snake: 0.95,
        deer: 0.55,
        cow: 0.45,
        human: 0.5,
      },
      buyVerb: "Hatch",
      portrait: "assets/organisms/alien_feeder_art.png",
      dossierPortrait: "assets/organisms/alien_feeder_art.png",
      chamberFlavor:
        "Heavier jaws and spite. It does not forgive snakes—or people who shine lights.",
      chamberLevel: 2,
      /** Same solo loop as Fleshmite: one probabilistic encounter per individual. */
      oneEncounterPerUnit: true,
    },
    {
      id: "cave_devourer",
      name: "Cave devourer",
      maskNameUntilOwned: true,
      costs: { meat: 1400, teeth: 40, scales: 5 },
      health: 32,
      attack: 10,
      buyVerb: "Hatch",
      portrait: "assets/organisms/cave_devourer_art.png",
      dossierPortrait: "assets/organisms/cave_devourer_art.png",
      chamberFlavor:
        "Many legs in the wet dark. It leaves shed skins in a ring, like a nest of warnings.",
      chamberLevel: 3,
      /** Same solo odds loop as Fleshmite / Alien Feeder (CAVE_DEVOURER_SOLO). */
      oneEncounterPerUnit: true,
    },
  ];

  /**
   * Areas: encounterWeights preyId→relative frequency (normalized when picking).
   * Prairie (lvl 1): cricket / spider / mouse. Cave (lvl 2): wider cave table.
   */
  var AREAS = [
    {
      id: "prairie",
      name: "Prairie",
      blurb: "Open grass and scrub—the colony’s first easy kills.",
      huntDurationSec: 30,
      encountersMin: 2,
      encountersMax: 4,
      encounterWeights: {
        cricket: 60,
        spider: 30,
        mouse: 10,
      },
      unlockCost: null,
      previewImage: "assets/areas/prairie.png",
    },
    {
      id: "cave",
      name: "Cave",
      blurb: "Damp stone, skittering life. Rats and the rare snake.",
      huntDurationSec: 30,
      encountersMin: 2,
      encountersMax: 5,
      encounterWeights: {
        cricket: 30,
        spider: 25,
        mouse: 25,
        rat: 17,
        snake: 3,
      },
      unlockCost: { meat: 450 },
      previewImage: "assets/areas/cave.png",
    },
    {
      id: "forest",
      name: "Forest",
      blurb: "Undergrowth, eyes in the dark. Snakes and rare deer.",
      huntDurationSec: 30,
      encountersMin: 3,
      encountersMax: 6,
      encounterWeights: {
        cricket: 10,
        spider: 10,
        mouse: 16,
        rat: 14,
        snake: 24,
        deer: 26,
      },
      unlockCost: { meat: 2200, scales: 5 },
      previewImage: "assets/areas/forest.png",
    },
    {
      id: "village",
      name: "Village edge",
      blurb: "Fences, livestock, and people who stay up too late.",
      huntDurationSec: 30,
      encountersMin: 3,
      encountersMax: 7,
      encounterWeights: { cow: 44, human: 30, mouse: 15, rat: 10, snake: 1 },
      unlockCost: { meat: 2200, scales: 5, largeHeart: 1 },
      previewImage: "assets/areas/village.png",
    },
    {
      id: "city",
      name: "City",
      blurb: "Concrete warrens. Brains are plentiful if you are reckless.",
      huntDurationSec: 30,
      encountersMin: 4,
      encountersMax: 8,
      encounterWeights: { human: 58, cow: 16, mouse: 12, rat: 13, snake: 1 },
      unlockCost: { meat: 3200, brains: 18 },
      previewImage: "assets/areas/city.png",
    },
  ];

  /** Trip casualties: once per hunt if risky prey met; does not apply to Cave devourer survivors. */
  var HUNT_BALANCE = {
    deathChancePerUnitPerHuntIfRiskMet: 0.25,
  };

  function emptyResources() {
    return { meat: 0, teeth: 0, scales: 0, largeHeart: 0, brains: 0 };
  }

  function defaultUnitCounts() {
    var o = {};
    var i;
    for (i = 0; i < UNITS.length; i++) o[UNITS[i].id] = 0;
    return o;
  }

  function defaultUnitStickRevealed() {
    return {};
  }

  function defaultResourceDiscovered() {
    return {
      meat: true,
      teeth: false,
      scales: false,
      largeHeart: false,
      brains: false,
    };
  }

  function syncResourceDiscoveredFromBalances() {
    if (!state.resourceDiscovered) state.resourceDiscovered = defaultResourceDiscovered();
    state.resourceDiscovered.meat = true;
    var i;
    for (i = 0; i < RESOURCE_DEFS.length; i++) {
      var id = RESOURCE_DEFS[i].id;
      if (resourceFloored(id) > 0) state.resourceDiscovered[id] = true;
    }
  }

  var state = {
    resources: emptyResources(),
    resourceDiscovered: defaultResourceDiscovered(),
    unitCounts: defaultUnitCounts(),
    deployed: defaultUnitCounts(),
    areasUnlocked: {
      prairie: true,
      cave: false,
      forest: false,
      village: false,
      city: false,
    },
    selectedAreaId: "prairie",
    selectedUnitId: "fleshmite",
    bulkBuy: "1",
    activeHunt: null,
    lastHuntReport: null,
    huntLog: [],
    lastTick: Date.now(),
    flavorTimer: null,
    /** preyId → true once that prey has been encountered on a hunt (dossier names). */
    preyDiscovered: {},
    /** unitId → true once that unit has been hatched at least once (sticky reveal for some masked units). */
    unitStickRevealed: defaultUnitStickRevealed(),
    /** Avoid resetting area preview image every tick when area unchanged. */
    lastRenderedPreviewAreaId: null,
  };

  function $(id) {
    return document.getElementById(id);
  }

  function getPrey(id) {
    return PREY[id] || null;
  }

  function getUnit(id) {
    var i;
    for (i = 0; i < UNITS.length; i++) {
      if (UNITS[i].id === id) return UNITS[i];
    }
    return null;
  }

  function isUnitNameRevealed(unit) {
    if (!unit) return true;
    if (unit.maskNameUntilOwned) {
      if ((state.unitCounts[unit.id] || 0) > 0) return true;
      if (
        unit.stickRevealAfterFirstPurchase &&
        state.unitStickRevealed &&
        state.unitStickRevealed[unit.id]
      )
        return true;
      return false;
    }
    if (unit.maskNameUntilResourceDiscovered) {
      var rid = unit.maskNameUntilResourceDiscovered;
      if (state.resourceDiscovered && state.resourceDiscovered[rid]) return true;
      if ((state.unitCounts[unit.id] || 0) > 0) return true;
      return false;
    }
    return true;
  }

  function unitDisplayName(unit) {
    return isUnitNameRevealed(unit) ? unit.name : "??????";
  }

  function ensurePreyDiscoveredMap() {
    if (!state.preyDiscovered || typeof state.preyDiscovered !== "object")
      state.preyDiscovered = {};
  }

  function markPreyDiscovered(preyId) {
    if (!preyId || !PREY[preyId]) return;
    ensurePreyDiscoveredMap();
    if (state.preyDiscovered[preyId]) return;
    state.preyDiscovered[preyId] = true;
    log("New prey catalogued: " + PREY[preyId].name + ".", true);
  }

  function isPreyDiscovered(preyId) {
    return !!(state.preyDiscovered && state.preyDiscovered[preyId]);
  }

  /** Dossier / UI: hide prey type name until encountered. */
  function preyDisplayName(prey) {
    if (!prey) return "?????";
    return isPreyDiscovered(prey.id) ? prey.name : "?????";
  }

  function ingestEncounterSummaryForDiscovery(encStr) {
    if (!encStr || encStr === "nothing") return;
    ensurePreyDiscoveredMap();
    var parts = encStr.split(";");
    var j;
    for (j = 0; j < parts.length; j++) {
      var m = parts[j].trim().match(/^(\d+)×\s+(.+)$/);
      if (!m) continue;
      var pid = PREY_NAME_TO_ID[m[2]];
      if (pid) state.preyDiscovered[pid] = true;
    }
  }

  function mergePreyDiscoveredFromSave(d) {
    ensurePreyDiscoveredMap();
    if (!d || !d.preyDiscovered || typeof d.preyDiscovered !== "object") return;
    var pk;
    for (pk in d.preyDiscovered) {
      if (
        d.preyDiscovered.hasOwnProperty(pk) &&
        PREY[pk] &&
        d.preyDiscovered[pk]
      )
        state.preyDiscovered[pk] = true;
    }
  }

  function backfillPreyDiscoveredFromReports() {
    ensurePreyDiscoveredMap();
    var i;
    for (i = 0; i < state.huntLog.length; i++)
      ingestEncounterSummaryForDiscovery(state.huntLog[i].preyEncountered);
    if (state.lastHuntReport)
      ingestEncounterSummaryForDiscovery(
        state.lastHuntReport.preyEncountered
      );
  }

  /** Shop: show revealed units, plus only the next masked unit in list order. */
  function shouldShowUnitInShop(unit, index) {
    if (isUnitNameRevealed(unit)) return true;
    var pi;
    for (pi = 0; pi < index; pi++) {
      if (!isUnitNameRevealed(UNITS[pi])) return false;
    }
    return true;
  }

  function getArea(id) {
    var i;
    for (i = 0; i < AREAS.length; i++) {
      if (AREAS[i].id === id) return AREAS[i];
    }
    return null;
  }

  /** Saves from before Prairie: free cave start → keep cave if it was unlocked. */
  function applyAreasUnlockedFromSave(au) {
    var out = {
      prairie: true,
      cave: false,
      forest: false,
      village: false,
      city: false,
    };
    if (au && typeof au === "object") {
      if (au.prairie === undefined) {
        out.prairie = true;
        out.cave = au.cave !== false;
        out.forest = !!au.forest;
        out.village = !!au.village;
        out.city = !!au.city;
      } else {
        out.prairie = au.prairie === true;
        out.cave = au.cave === true;
        out.forest = au.forest === true;
        out.village = au.village === true;
        out.city = au.city === true;
      }
    }
    if (!out.prairie) out.prairie = true;
    return out;
  }

  function syncSelectedAreaToUnlocked() {
    if (state.selectedAreaId && state.areasUnlocked[state.selectedAreaId])
      return;
    var i;
    for (i = 0; i < AREAS.length; i++) {
      if (state.areasUnlocked[AREAS[i].id]) {
        state.selectedAreaId = AREAS[i].id;
        return;
      }
    }
    state.selectedAreaId = "prairie";
    state.areasUnlocked.prairie = true;
  }

  var areaPreviewImgToken = 0;

  function unitPortraitSrc(unit) {
    if (!unit) return "";
    /* Masked units: painted shop portrait only after the first hatch (sprite until then). */
    if (
      unit.maskNameUntilOwned &&
      (state.unitCounts[unit.id] || 0) < 1
    ) {
      return "";
    }
    return resolveAssetUrl(
      unit.portrait || "assets/organisms/" + unit.id + ".png"
    );
  }

  function areaPreviewSrc(area) {
    if (!area) return "";
    return resolveAssetUrl(
      area.previewImage || "assets/areas/" + area.id + ".png"
    );
  }

  function sumEncounterWeights(weights) {
    var s = 0;
    if (!weights) return 0;
    var ids = Object.keys(weights);
    var i;
    for (i = 0; i < ids.length; i++) s += weights[ids[i]] || 0;
    return s;
  }

  /** Rarity styling from share of encounter table (same ground). */
  function preyChipTierFromEncounterPct(pct) {
    if (pct >= 15) return "common";
    if (pct >= 5) return "uncommon";
    return "rare";
  }

  function describePreyDropsForTooltip(prey) {
    var drops = prey && prey.drops ? prey.drops : [];
    if (!drops.length) return "No loot table.";
    var lines = [];
    var i;
    for (i = 0; i < drops.length; i++) {
      var d = drops[i];
      var lab = resourceLabel(d.resource);
      var lo = d.min;
      var hi = d.max;
      var range =
        lo === hi ? formatNum(lo) : formatNum(lo) + "–" + formatNum(hi);
      if (d.chance != null && isFinite(Number(d.chance))) {
        var c = clamp01(Number(d.chance));
        if (c < 1)
          lines.push(
            lab + ": " + range + " (" + pctDisplay(c) + " chance for this line)"
          );
        else lines.push(lab + ": " + range);
      } else lines.push(lab + ": " + range);
    }
    return lines.join("\n");
  }

  function buildPreyChipTooltip(prey, encounterPct) {
    return (
      "Encounters on this ground: " +
      Math.round(encounterPct) +
      "% per pick (weights).\n\n" +
      "If killed, loot:\n" +
      describePreyDropsForTooltip(prey)
    );
  }

  function renderAreaPreviewPreyChips(area) {
    var preyRow = $("area-preview-prey");
    if (!preyRow) return;
    preyRow.innerHTML = "";
    if (!area || !area.encounterWeights) return;

    var w = area.encounterWeights;
    var sum = sumEncounterWeights(w);
    if (sum <= 0) return;

    var entries = [];
    var pid;
    for (pid in w) {
      if (w.hasOwnProperty(pid) && (w[pid] || 0) > 0)
        entries.push({ id: pid, weight: w[pid] });
    }
    entries.sort(function (a, b) {
      if (b.weight !== a.weight) return b.weight - a.weight;
      return String(a.id).localeCompare(String(b.id));
    });

    var ei;
    for (ei = 0; ei < entries.length; ei++) {
      var e = entries[ei];
      if (!isPreyDiscovered(e.id)) continue;
      var prey = getPrey(e.id);
      if (!prey) continue;
      var pct = (100 * e.weight) / sum;
      var tier = preyChipTierFromEncounterPct(pct);
      var sp = document.createElement("span");
      sp.className = "prey-chip prey-chip--" + tier;
      sp.setAttribute("tabindex", "0");
      sp.appendChild(document.createTextNode(prey.name));
      var sm = document.createElement("small");
      sm.textContent = Math.round(pct) + "%";
      sp.appendChild(sm);
      sp.setAttribute("title", buildPreyChipTooltip(prey, pct));
      sp.setAttribute(
        "aria-label",
        prey.name + ", about " + Math.round(pct) + "% encounter rate. Hover for drop details."
      );
      preyRow.appendChild(sp);
    }
  }

  function updateAreaPreview(area) {
    var aid = area && area.id ? area.id : "";
    if (state.lastRenderedPreviewAreaId === aid) return;
    state.lastRenderedPreviewAreaId = aid;

    var titleEl = $("area-preview-title");
    var scene = $("area-preview-scene");
    var img = $("area-preview-img");
    var viewport = $("area-preview-viewport");
    var preyRow = $("area-preview-prey");
    if (!scene || !viewport) return;
    areaPreviewImgToken++;
    var tok = areaPreviewImgToken;
    if (!area) {
      if (titleEl) titleEl.textContent = "—";
      scene.className = "area-preview__scene";
      viewport.classList.remove("area-preview__viewport--has-image");
      if (img) {
        img.removeAttribute("src");
        img.classList.remove("is-loaded", "is-broken");
        img.alt = "";
      }
      if (preyRow) preyRow.innerHTML = "";
      return;
    }
    if (titleEl) titleEl.textContent = area.name;
    scene.className = "area-preview__scene area-preview__scene--" + area.id;
    if (img) {
      img.alt = area.name + " — hunt ground preview";
      img.classList.remove("is-loaded", "is-broken");
      viewport.classList.remove("area-preview__viewport--has-image");
      img.onload = function () {
        if (tok !== areaPreviewImgToken) return;
        img.classList.add("is-loaded");
        img.classList.remove("is-broken");
        viewport.classList.add("area-preview__viewport--has-image");
      };
      img.onerror = function () {
        if (tok !== areaPreviewImgToken) return;
        img.classList.remove("is-loaded");
        img.classList.add("is-broken");
        viewport.classList.remove("area-preview__viewport--has-image");
      };
      img.src = areaPreviewSrc(area);
    }
  }

  function formatNum(n) {
    if (!isFinite(n)) return "0";
    n = Math.trunc(n);
    if (n === 0) return "0";
    var sign = n < 0 ? "-" : "";
    var x = Math.abs(n);
    if (x < 1000) return sign + String(x);
    var suf = ["K", "M", "B", "T"];
    var i = -1;
    while (x >= 1000 && i < suf.length - 1) {
      x = Math.trunc(x / 1000);
      i++;
    }
    return sign + String(x) + suf[i];
  }

  function floorDivPositive(numer, denom) {
    if (!(denom > 0) || !isFinite(numer)) return 0;
    var q = (numer + 1e-7) / denom;
    if (!isFinite(q) || q < 0) return 0;
    return Math.floor(q);
  }

  function randInt(min, max) {
    return min + Math.floor(Math.random() * (max - min + 1));
  }

  function pickPreyFromArea(area) {
    var w = area.encounterWeights;
    var ids = Object.keys(w);
    var sum = 0;
    var i;
    for (i = 0; i < ids.length; i++) sum += w[ids[i]] || 0;
    if (sum <= 0) return ids[0];
    var r = Math.random() * sum;
    for (i = 0; i < ids.length; i++) {
      r -= w[ids[i]] || 0;
      if (r <= 0) return ids[i];
    }
    return ids[ids.length - 1];
  }

  function effectivenessAgainst(unit, preyId) {
    var base = unit.huntEffectiveness || 1;
    var m = unit.vsPrey && unit.vsPrey[preyId] != null ? unit.vsPrey[preyId] : 1;
    return base * m;
  }

  function rollDrops(prey) {
    var loot = emptyResources();
    var drops = prey.drops || [];
    var i;
    for (i = 0; i < drops.length; i++) {
      var d = drops[i];
      if (d.chance != null && Math.random() > d.chance) continue;
      var amt = randInt(d.min, d.max);
      if (amt > 0) loot[d.resource] = (loot[d.resource] || 0) + amt;
    }
    return loot;
  }

  function addLoot(target, delta) {
    var k;
    for (k in delta) {
      if (delta.hasOwnProperty(k))
        target[k] = (target[k] || 0) + delta[k];
    }
  }

  function preyCanCauseTripDeaths(prey) {
    return !!(prey && prey.canCauseTripDeaths);
  }

  function preyUsesFleshmiteBinary(unit, prey) {
    return (
      unit &&
      unit.id === "fleshmite" &&
      prey &&
      (prey.fleshmiteAlwaysLoses ||
        prey.preyAlwaysDiesForFleshmite ||
        (prey.fleshmiteWinChance != null && isFinite(Number(prey.fleshmiteWinChance))))
    );
  }

  function preyUsesAlienFeederBinary(unit, prey) {
    return (
      unit &&
      unit.id === "tunnel_jack" &&
      prey &&
      ALIEN_FEEDER_SOLO[prey.id]
    );
  }

  function preyUsesCaveDevourerBinary(unit, prey) {
    return (
      unit &&
      unit.id === "cave_devourer" &&
      prey &&
      CAVE_DEVOURER_SOLO[prey.id]
    );
  }

  function clamp01(x) {
    if (!isFinite(x)) return 0;
    if (x < 0) return 0;
    if (x > 1) return 1;
    return x;
  }

  function pctDisplay(p) {
    return Math.round(p * 100) + "%";
  }

  /** Dossier: solo table rows (Alien Feeder / Cave devourer shape). */
  function buildSoloTableRatesHtml(encounterLabel, soloTable) {
    var h2 =
      '<h3 class="unit-rates-heading">Solo hunt (one encounter per ' +
      encounterLabel +
      ')</h3><div class="unit-rates-list">';
    var ii;
    for (ii = 0; ii < PREY_DOSSIER_ORDER.length; ii++) {
      var pidF = PREY_DOSSIER_ORDER[ii];
      var pF = PREY[pidF];
      var dF = soloTable[pidF];
      if (!pF || !dF) continue;
      if (dF.kind === "alwaysKill") {
        h2 +=
          "<div><strong>" +
          preyDisplayName(pF) +
          "</strong>: always killed — you always get loot.</div>";
      } else if (dF.kind === "alwaysLose") {
        h2 +=
          "<div><strong>" +
          preyDisplayName(pF) +
          "</strong>: 100% death rate — no loot.</div>";
      } else if (dF.kind === "odds") {
        var pwF = clamp01(Number(dF.pw));
        var plRawF = dF.pl;
        var plF =
          plRawF != null && isFinite(Number(plRawF))
            ? clamp01(Number(plRawF))
            : null;
        var rowF = "<div><strong>" + preyDisplayName(pF) + "</strong>: ";
        rowF += pctDisplay(pwF) + " kill rate";
        if (plF == null) {
          rowF += " · " + pctDisplay(1 - pwF) + " death rate";
        } else {
          var pl2F = Math.min(plF, 1 - pwF);
          var stF = Math.max(0, 1 - pwF - pl2F);
          rowF += " · " + pctDisplay(pl2F) + " death rate";
          if (stF > 0.0005)
            rowF += " · " + pctDisplay(stF) + " stalemate";
        }
        rowF += "</div>";
        h2 += rowF;
      }
    }
    h2 += "</div>";
    return h2;
  }

  function buildUnitRatesHtml(unit) {
    if (!unit) return "";
    if (unit.id === "fleshmite") {
      var h =
        '<h3 class="unit-rates-heading">Solo hunt (one encounter per Fleshmite)</h3><div class="unit-rates-list">';
      var anyStrongerPrey = false;
      var i;
      for (i = 0; i < PREY_DOSSIER_ORDER.length; i++) {
        var pid = PREY_DOSSIER_ORDER[i];
        var p = PREY[pid];
        if (!p) continue;
        if (p.preyAlwaysDiesForFleshmite) {
          h +=
            "<div><strong>" +
            preyDisplayName(p) +
            "</strong>: always killed — you always get loot.</div>";
        } else if (p.fleshmiteWinChance != null) {
          var pw = clamp01(Number(p.fleshmiteWinChance));
          var plRaw = p.fleshmiteLoseChance;
          var pl =
            plRaw != null && isFinite(Number(plRaw))
              ? clamp01(Number(plRaw))
              : null;
          var row = "<div><strong>" + preyDisplayName(p) + "</strong>: ";
          row += pctDisplay(pw) + " kill rate";
          if (pl == null) {
            row += " · " + pctDisplay(1 - pw) + " death rate";
          } else {
            var pl2 = Math.min(pl, 1 - pw);
            var st = Math.max(0, 1 - pw - pl2);
            row += " · " + pctDisplay(pl2) + " death rate";
            if (st > 0.0005)
              row += " · " + pctDisplay(st) + " stalemate";
          }
          row += "</div>";
          h += row;
        } else {
          anyStrongerPrey = true;
        }
      }
      if (anyStrongerPrey)
        h += "<div>Dies to every stronger animal.</div>";
      h += "</div>";
      return h;
    }
    if (unit.id === "tunnel_jack") {
      return buildSoloTableRatesHtml(unit.name, ALIEN_FEEDER_SOLO);
    }
    if (unit.id === "cave_devourer") {
      return buildSoloTableRatesHtml(unit.name, CAVE_DEVOURER_SOLO);
    }
    var out =
      '<h3 class="unit-rates-heading">Pack combat</h3><p class="unit-rates-note">HP-based fights per encounter (not fixed win %). Effectiveness vs prey:</p><ul class="unit-rates-list">';
    var j;
    for (j = 0; j < PREY_DOSSIER_ORDER.length; j++) {
      var pid2 = PREY_DOSSIER_ORDER[j];
      var p2 = PREY[pid2];
      if (!p2 || !unit.vsPrey || unit.vsPrey[pid2] == null) continue;
      out +=
        "<li><strong>" +
        preyDisplayName(p2) +
        "</strong>: ×" +
        unit.vsPrey[pid2].toFixed(2) +
        "</li>";
    }
    out += "</ul>";
    return out;
  }

  function closeUnitDetailModal() {
    var m = $("unit-detail-modal");
    if (!m) return;
    m.classList.add("is-hidden");
    m.setAttribute("aria-hidden", "true");
  }

  function openUnitDetailModal(unit) {
    if (!unit) return;
    var m = $("unit-detail-modal");
    if (!m) return;
    var title = $("modal-unit-name");
    var flavor = $("creature-flavor");
    var vis = $("creature-visual");
    var dossierImg = $("creature-dossier-img");
    var stage = $("creature-stage");
    var rates = $("unit-combat-rates");
    if (title) title.textContent = unitDisplayName(unit);
    if (flavor)
      flavor.textContent = isUnitNameRevealed(unit)
        ? unit.chamberFlavor
        : "—";
    var name = unitDisplayName(unit);
    var showDossierPhoto =
      unit.dossierPortrait &&
      isUnitNameRevealed(unit) &&
      dossierImg &&
      stage;
    if (showDossierPhoto) {
      stage.classList.add("creature-stage--dossier-photo");
      dossierImg.hidden = false;
      dossierImg.alt = name;
      dossierImg.src = resolveAssetUrl(unit.dossierPortrait);
      if (vis) vis.hidden = true;
    } else {
      if (stage) stage.classList.remove("creature-stage--dossier-photo");
      if (dossierImg) {
        dossierImg.hidden = true;
        dossierImg.removeAttribute("src");
        dossierImg.alt = "";
      }
      if (vis) {
        vis.hidden = false;
        vis.className = "creature creature--" + unit.chamberLevel;
        vis.setAttribute("aria-label", name);
      }
    }
    if (rates) rates.innerHTML = buildUnitRatesHtml(unit);
    m.classList.remove("is-hidden");
    m.setAttribute("aria-hidden", "false");
    var c = $("unit-detail-close");
    if (c) c.focus();
  }

  /**
   * Fleshmite 1v1: win (loot), lose (hunter dies), or stalemate (hunter lives, no loot) when fleshmiteLoseChance is set.
   * Otherwise binary: win vs lose only.
   */
  function resolveFleshmiteBinaryEncounter(survivors, prey) {
    var loot = emptyResources();
    if (prey.fleshmiteAlwaysLoses) {
      return {
        survivors: 0,
        killed: false,
        casualties: survivors,
        loot: loot,
        line:
          "Lost to " + prey.name + " — the hunter did not survive.",
      };
    }
    if (prey.preyAlwaysDiesForFleshmite) {
      return {
        survivors: survivors,
        killed: true,
        casualties: 0,
        loot: rollDrops(prey),
        line: "Killed " + prey.name + ".",
      };
    }

    var pw = clamp01(Number(prey.fleshmiteWinChance));
    var plRaw = prey.fleshmiteLoseChance;
    var pl =
      plRaw != null && isFinite(Number(plRaw)) ? clamp01(Number(plRaw)) : null;
    var r = Math.random();
    var win;
    var lose;

    if (pl == null) {
      win = r < pw;
      lose = !win;
    } else {
      pl = Math.min(pl, 1 - pw);
      if (r < pw) {
        win = true;
        lose = false;
      } else if (r < pw + pl) {
        win = false;
        lose = true;
      } else {
        win = false;
        lose = false;
      }
    }

    var killed = win;
    var died = lose ? survivors : 0;
    var newSurvivors = lose ? 0 : survivors;
    if (win) loot = rollDrops(prey);

    var line;
    if (win) line = "Killed " + prey.name + ".";
    else if (lose)
      line = "Lost to " + prey.name + " — the hunter did not survive.";
    else line = "No kill — " + prey.name + " slips away.";

    return {
      survivors: newSurvivors,
      killed: killed,
      casualties: died,
      loot: loot,
      line: line,
    };
  }

  /** Shared solo table: alwaysKill / alwaysLose / odds (kill, death, stalemate). */
  function resolveSoloTableEncounter(survivors, prey, def) {
    var loot = emptyResources();
    if (!def) {
      return {
        survivors: 0,
        killed: false,
        casualties: survivors,
        loot: loot,
        line:
          "Lost to " + prey.name + " — the hunter did not survive.",
      };
    }
    if (def.kind === "alwaysLose") {
      return {
        survivors: 0,
        killed: false,
        casualties: survivors,
        loot: loot,
        line:
          "Lost to " + prey.name + " — the hunter did not survive.",
      };
    }
    if (def.kind === "alwaysKill") {
      return {
        survivors: survivors,
        killed: true,
        casualties: 0,
        loot: rollDrops(prey),
        line: "Killed " + prey.name + ".",
      };
    }

    var pw = clamp01(Number(def.pw));
    var plRaw = def.pl;
    var pl =
      plRaw != null && isFinite(Number(plRaw)) ? clamp01(Number(plRaw)) : null;
    var r = Math.random();
    var win;
    var lose;

    if (pl == null) {
      win = r < pw;
      lose = !win;
    } else {
      pl = Math.min(pl, 1 - pw);
      if (r < pw) {
        win = true;
        lose = false;
      } else if (r < pw + pl) {
        win = false;
        lose = true;
      } else {
        win = false;
        lose = false;
      }
    }

    var killed = win;
    var died = lose ? survivors : 0;
    var newSurvivors = lose ? 0 : survivors;
    if (win) loot = rollDrops(prey);

    var line;
    if (win) line = "Killed " + prey.name + ".";
    else if (lose)
      line = "Lost to " + prey.name + " — the hunter did not survive.";
    else line = "No kill — " + prey.name + " slips away.";

    return {
      survivors: newSurvivors,
      killed: killed,
      casualties: died,
      loot: loot,
      line: line,
    };
  }

  function resolveAlienFeederBinaryEncounter(survivors, prey) {
    return resolveSoloTableEncounter(
      survivors,
      prey,
      ALIEN_FEEDER_SOLO[prey.id]
    );
  }

  function resolveCaveDevourerBinaryEncounter(survivors, prey) {
    return resolveSoloTableEncounter(
      survivors,
      prey,
      CAVE_DEVOURER_SOLO[prey.id]
    );
  }

  /**
   * One encounter. Fleshmite, Alien Feeder, Cave devourer: fixed solo rules.
   * Other units: pack HP sim, no mid-hunt deaths in that loop.
   */
  function resolveEncounter(survivors, unit, prey) {
    if (survivors <= 0) {
      return {
        survivors: 0,
        killed: false,
        casualties: 0,
        loot: emptyResources(),
        line: "The pack was already gone—nothing left to fight.",
      };
    }

    if (preyUsesFleshmiteBinary(unit, prey)) {
      return resolveFleshmiteBinaryEncounter(survivors, prey);
    }
    if (preyUsesAlienFeederBinary(unit, prey)) {
      return resolveAlienFeederBinaryEncounter(survivors, prey);
    }
    if (preyUsesCaveDevourerBinary(unit, prey)) {
      return resolveCaveDevourerBinaryEncounter(survivors, prey);
    }

    var eff = effectivenessAgainst(unit, prey.id);
    var packHp = survivors * unit.health;
    var preyHp = prey.health;
    var rounds = 0;
    var packDps = survivors * unit.attack * eff;
    var preyStress = 1 + prey.danger * 0.4;
    var preyDps = (prey.attack * preyStress) / Math.max(0.3, eff);

    while (preyHp > 0 && packHp > 0 && rounds < 14) {
      rounds++;
      preyHp -= packDps * (0.82 + Math.random() * 0.36);
      if (preyHp <= 0) break;
      packHp -= preyDps * (0.8 + Math.random() * 0.35);
    }

    var killed = preyHp <= 0;
    var died = 0;

    var loot = emptyResources();
    if (killed) loot = rollDrops(prey);
    else {
      var scrape = rollDrops(prey);
      var rk;
      for (rk in scrape) {
        if (scrape.hasOwnProperty(rk))
          scrape[rk] = Math.floor(scrape[rk] * (0.15 + Math.random() * 0.2));
      }
      loot = scrape;
    }

    var newSurvivors = survivors;
    var line = (killed ? "Killed " : "Bloodied ") + prey.name + ".";
    return {
      survivors: newSurvivors,
      killed: killed,
      casualties: died,
      loot: loot,
      line: line,
    };
  }

  function availableUnits(unitId) {
    var t = state.unitCounts[unitId] || 0;
    var d = state.deployed[unitId] || 0;
    return Math.max(0, Math.floor(t - d));
  }

  function anyReadyHunters() {
    var i;
    for (i = 0; i < UNITS.length; i++) {
      if (availableUnits(UNITS[i].id) >= 1) return true;
    }
    return false;
  }

  /** activeHunt.wings[] or legacy { unitId, count }. */
  function normalizeHuntWings(h) {
    if (!h) return [];
    if (h.wings && h.wings.length) {
      var out = [];
      var wi;
      for (wi = 0; wi < h.wings.length; wi++) {
        var w = h.wings[wi];
        var c = Math.max(0, Math.floor(Number(w.count) || 0));
        if (w.unitId && c > 0) out.push({ unitId: w.unitId, count: c });
      }
      return out;
    }
    var leg = Math.max(0, Math.floor(Number(h.count) || 0));
    if (h.unitId && leg > 0) return [{ unitId: h.unitId, count: leg }];
    return [];
  }

  function mergePreyCounts(into, from) {
    var n;
    for (n in from) {
      if (from.hasOwnProperty(n))
        into[n] = (into[n] || 0) + from[n];
    }
  }

  /**
   * One unit type × count on this area (solo 1v1 loop or pack encounters).
   * Returns combat stats before trip deaths.
   */
  function runWingHunt(area, unit, count) {
    var wingLoot = emptyResources();
    var lines = [];
    var preySeen = {};
    var preyKilled = {};
    var metTripRiskPrey = false;
    var aliveAfterCombat = 0;

    if (unit.oneEncounterPerUnit) {
      var fi;
      for (fi = 0; fi < count; fi++) {
        var pidSolo = pickPreyFromArea(area);
        var preySolo = getPrey(pidSolo);
        if (!preySolo) continue;
        markPreyDiscovered(preySolo.id);
        preySeen[preySolo.name] = (preySeen[preySolo.name] || 0) + 1;
        if (preyCanCauseTripDeaths(preySolo)) metTripRiskPrey = true;
        var resSolo = resolveEncounter(1, unit, preySolo);
        aliveAfterCombat += resSolo.survivors;
        if (resSolo.killed)
          preyKilled[preySolo.name] = (preyKilled[preySolo.name] || 0) + 1;
        addLoot(wingLoot, resSolo.loot);
        lines.push(
          "One " + unit.name + " met " + preySolo.name + " — " + resSolo.line
        );
      }
      if (count > 0 && aliveAfterCombat <= 0) {
        lines.push("None of the " + unit.name + "s made it back.");
      }
    } else {
      var survivors = count;
      var nEnc = randInt(area.encountersMin, area.encountersMax);
      var ei;
      for (ei = 0; ei < nEnc; ei++) {
        if (survivors <= 0) break;
        var pid = pickPreyFromArea(area);
        var prey = getPrey(pid);
        if (!prey) continue;
        markPreyDiscovered(prey.id);
        preySeen[prey.name] = (preySeen[prey.name] || 0) + 1;
        if (preyCanCauseTripDeaths(prey)) metTripRiskPrey = true;
        var res = resolveEncounter(survivors, unit, prey);
        survivors = res.survivors;
        if (res.killed) preyKilled[prey.name] = (preyKilled[prey.name] || 0) + 1;
        addLoot(wingLoot, res.loot);
        lines.push(res.line);
      }

      if (survivors <= 0) {
        lines.push("The last of the pack stops moving in the dark.");
      }

      aliveAfterCombat = Math.max(0, survivors);
    }

    return {
      unitId: unit.id,
      unitName: unit.name,
      sent: count,
      loot: wingLoot,
      lines: lines,
      preySeen: preySeen,
      preyKilled: preyKilled,
      metTripRiskPrey: metTripRiskPrey,
      aliveAfterCombat: aliveAfterCombat,
    };
  }

  function distributeTripDeathsAcrossWings(
    alivePerWing,
    tripDeaths,
    tripEligible
  ) {
    var d;
    for (d = 0; d < tripDeaths; d++) {
      var pool = [];
      var i;
      for (i = 0; i < alivePerWing.length; i++) {
        if (
          alivePerWing[i] > 0 &&
          (!tripEligible || tripEligible[i])
        )
          pool.push(i);
      }
      if (!pool.length) break;
      var pick = pool[Math.floor(Math.random() * pool.length)];
      alivePerWing[pick]--;
    }
  }

  function resolveHunt() {
    var h = state.activeHunt;
    if (!h) return;

    var area = getArea(h.areaId);
    var wings = normalizeHuntWings(h);
    if (!area || !wings.length) {
      state.activeHunt = null;
      return;
    }

    var totalLoot = emptyResources();
    var lines = [];
    var preySeen = {};
    var preyKilled = {};
    var metTripRiskPrey = false;
    var wingResults = [];
    var wi;

    for (wi = 0; wi < wings.length; wi++) {
      var w = wings[wi];
      var unit = getUnit(w.unitId);
      if (!unit || w.count < 1) continue;
      var wr = runWingHunt(area, unit, w.count);
      wingResults.push(wr);
      addLoot(totalLoot, wr.loot);
      var li;
      for (li = 0; li < wr.lines.length; li++) lines.push(wr.lines[li]);
      mergePreyCounts(preySeen, wr.preySeen);
      mergePreyCounts(preyKilled, wr.preyKilled);
      if (wr.metTripRiskPrey) metTripRiskPrey = true;
    }

    if (!wingResults.length) {
      state.activeHunt = null;
      return;
    }

    var alivePerWing = [];
    var totalSent = 0;
    for (wi = 0; wi < wingResults.length; wi++) {
      alivePerWing.push(wingResults[wi].aliveAfterCombat);
      totalSent += wingResults[wi].sent;
    }

    var tripEligible = [];
    var wiTrip;
    for (wiTrip = 0; wiTrip < wingResults.length; wiTrip++) {
      var uTrip = getUnit(wingResults[wiTrip].unitId);
      tripEligible.push(!!(uTrip && uTrip.id !== "cave_devourer"));
    }

    var totalAliveCombatTrip = 0;
    for (wiTrip = 0; wiTrip < wingResults.length; wiTrip++) {
      if (tripEligible[wiTrip])
        totalAliveCombatTrip += wingResults[wiTrip].aliveAfterCombat;
    }

    var tripDeaths = 0;
    if (metTripRiskPrey && totalAliveCombatTrip > 0) {
      var pTrip = HUNT_BALANCE.deathChancePerUnitPerHuntIfRiskMet;
      if (!(pTrip >= 0 && pTrip <= 1)) pTrip = 0.25;
      var ti;
      for (ti = 0; ti < totalAliveCombatTrip; ti++) {
        if (Math.random() < pTrip) tripDeaths++;
      }
    }
    distributeTripDeathsAcrossWings(alivePerWing, tripDeaths, tripEligible);

    var totalSurvivors = 0;
    for (wi = 0; wi < alivePerWing.length; wi++)
      totalSurvivors += alivePerWing[wi];
    var totalLost = totalSent - totalSurvivors;

    if (tripDeaths > 0) {
      lines.push(
        "After tangling with something meaner than bugs, " +
          formatNum(tripDeaths) +
          " more of the pack did not make it home."
      );
    }

    var k;
    for (k in totalLoot) {
      if (totalLoot.hasOwnProperty(k) && totalLoot[k] > 0)
        state.resources[k] = (state.resources[k] || 0) + totalLoot[k];
    }

    for (wi = 0; wi < wingResults.length; wi++) {
      var wr2 = wingResults[wi];
      var aliveF = alivePerWing[wi];
      var cas = wr2.sent - aliveF;
      state.unitCounts[wr2.unitId] = Math.max(
        0,
        (state.unitCounts[wr2.unitId] || 0) - cas
      );
      state.deployed[wr2.unitId] = Math.max(
        0,
        (state.deployed[wr2.unitId] || 0) - wr2.sent
      );
    }

    state.activeHunt = null;

    var seenStr = Object.keys(preySeen)
      .map(function (n) {
        return preySeen[n] + "× " + n;
      })
      .join("; ");
    var killedStr = Object.keys(preyKilled).length
      ? Object.keys(preyKilled)
          .map(function (n) {
            return preyKilled[n] + "× " + n;
          })
          .join("; ")
      : "none";

    var lootParts = [];
    for (k in totalLoot) {
      if (totalLoot.hasOwnProperty(k) && totalLoot[k] > 0) {
        var lab = resourceLabel(k);
        lootParts.push(formatNum(totalLoot[k]) + " " + lab);
      }
    }

    var packParts = [];
    for (wi = 0; wi < wingResults.length; wi++) {
      var ws = wingResults[wi].sent;
      packParts.push(
        formatNum(ws) +
          " " +
          wingResults[wi].unitName +
          (ws === 1 ? "" : "s")
      );
    }
    var packDesc = packParts.join(", ");
    var repUnitName =
      wingResults.length === 1 ? wingResults[0].unitName : "all hosts";

    var report = {
      areaName: area.name,
      unitName: repUnitName,
      packDesc: packDesc,
      sent: totalSent,
      survivorsReturned: totalSurvivors,
      lost: totalLost,
      preyEncountered: seenStr || "nothing",
      preyKilled: killedStr,
      lootStr: lootParts.length ? lootParts.join(", ") : "nothing useful",
      lines: lines,
    };
    state.lastHuntReport = report;
    state.huntLog.unshift(report);
    while (state.huntLog.length > MAX_HUNT_LOG) state.huntLog.pop();

    log(
      "Hunt returns from " +
        area.name +
        ": +" +
        lootParts.join(", ") +
        " | " +
        formatNum(totalSurvivors) +
        "/" +
        formatNum(totalSent) +
        " survived.",
      true
    );
  }

  function resourceLabel(resId) {
    var i;
    for (i = 0; i < RESOURCE_DEFS.length; i++) {
      if (RESOURCE_DEFS[i].id === resId) return RESOURCE_DEFS[i].label;
    }
    return resId;
  }

  function canPay(costs) {
    if (!costs) return true;
    var k;
    for (k in costs) {
      if (costs.hasOwnProperty(k)) {
        if ((state.resources[k] || 0) < costs[k]) return false;
      }
    }
    return true;
  }

  function payCosts(costs) {
    var k;
    for (k in costs) {
      if (costs.hasOwnProperty(k)) state.resources[k] -= costs[k];
    }
  }

  function resourceFloored(key) {
    return Math.max(0, Math.floor(Number(state.resources[key]) || 0));
  }

  function totalUnitsOwned() {
    var t = 0;
    var i;
    for (i = 0; i < UNITS.length; i++) {
      t += state.unitCounts[UNITS[i].id] || 0;
    }
    return t;
  }

  /** Broke softlock: 0 units and under 10 meat — hatch 1 Fleshmite for all current meat (0–9), then normal 10 Meat price. */
  function isFleshmiteEmergencyBuyEligible() {
    if (totalUnitsOwned() !== 0) return false;
    if (resourceFloored("meat") >= 10) return false;
    return true;
  }

  function affordableBulkUnit(unit) {
    var c = unit.costs;
    var keys = Object.keys(c);
    var minN = Infinity;
    var i;
    for (i = 0; i < keys.length; i++) {
      var key = keys[i];
      var n = floorDivPositive(resourceFloored(key), c[key]);
      if (n < minN) minN = n;
    }
    return minN === Infinity ? 0 : minN;
  }

  function bulkPurchaseCountUnit(unit) {
    if (unit.id === "fleshmite" && isFleshmiteEmergencyBuyEligible()) return 1;
    var a = affordableBulkUnit(unit);
    if (a <= 0) return 0;
    var m = state.bulkBuy;
    if (m === "max") return a;
    var cap = parseInt(String(m), 10);
    if (!isFinite(cap) || cap < 1) cap = 1;
    var out = Math.min(cap, a);
    return isFinite(out) && out > 0 ? out : 0;
  }

  function unitCostLabel(unit) {
    if (unit.id === "fleshmite" && isFleshmiteEmergencyBuyEligible()) {
      return formatNum(resourceFloored("meat")) + " Meat";
    }
    var n = bulkPurchaseCountUnit(unit);
    var parts = [];
    var k;
    for (k in unit.costs) {
      if (unit.costs.hasOwnProperty(k)) {
        var lab = resourceLabel(k);
        var each = unit.costs[k];
        parts.push(formatNum(n > 0 ? n * each : each) + " " + lab);
      }
    }
    return parts.join(", ");
  }

  function buyUnit(unit) {
    if (unit.id === "fleshmite" && isFleshmiteEmergencyBuyEligible()) {
      var pay = resourceFloored("meat");
      state.resources.meat = Math.max(0, (state.resources.meat || 0) - pay);
      state.unitCounts.fleshmite = (state.unitCounts.fleshmite || 0) + 1;
      fullRender();
      maybeAutoStartHunt();
      return;
    }
    var n = bulkPurchaseCountUnit(unit);
    if (!isFinite(n) || n <= 0) return;
    var k;
    for (k in unit.costs) {
      if (unit.costs.hasOwnProperty(k))
        state.resources[k] -= unit.costs[k] * n;
    }
    var prevOwned = state.unitCounts[unit.id] || 0;
    state.unitCounts[unit.id] = prevOwned + n;
    if (
      unit.stickRevealAfterFirstPurchase &&
      prevOwned < 1 &&
      n > 0
    ) {
      if (!state.unitStickRevealed) state.unitStickRevealed = defaultUnitStickRevealed();
      state.unitStickRevealed[unit.id] = true;
    }
    fullRender();
    maybeAutoStartHunt();
  }

  function tryUnlockArea(area) {
    if (state.areasUnlocked[area.id]) return;
    var c = area.unlockCost;
    if (!c || !canPay(c)) return;
    payCosts(c);
    state.areasUnlocked[area.id] = true;
    log(area.name + " grounds are open to the pack.", true);
    fullRender();
    maybeAutoStartHunt();
  }

  function tryStartHunt() {
    if (state.activeHunt) return;
    var area = getArea(state.selectedAreaId);
    if (!area || !state.areasUnlocked[area.id]) return;
    var wings = [];
    var logParts = [];
    var i;
    for (i = 0; i < UNITS.length; i++) {
      var u = UNITS[i];
      var av = availableUnits(u.id);
      if (av < 1) continue;
      wings.push({ unitId: u.id, count: av });
      state.deployed[u.id] = (state.deployed[u.id] || 0) + av;
      logParts.push(
        formatNum(av) + " " + u.name + (av === 1 ? "" : "s")
      );
    }
    if (!wings.length) return;
    state.selectedUnitId = wings[0].unitId;

    state.activeHunt = {
      areaId: area.id,
      wings: wings,
      endsAt: Date.now() + HUNT_DURATION_SEC * 1000,
    };
    log(
      "Sent all ready toward " +
        area.name +
        ": " +
        logParts.join(", ") +
        ".",
      true
    );
    fullRender();
  }

  /** When idle, immediately send all ready troops to the selected unlocked area. */
  function maybeAutoStartHunt() {
    if (state.activeHunt) return;
    var area = getArea(state.selectedAreaId);
    if (!area || !state.areasUnlocked[area.id]) return;
    if (!anyReadyHunters()) return;
    tryStartHunt();
  }

  function checkHuntComplete() {
    if (!state.activeHunt) return;
    if (Date.now() >= state.activeHunt.endsAt) resolveHunt();
  }

  function shaveHuntTimeOnClick() {
    if (!state.activeHunt) return;
    state.activeHunt.endsAt = Math.max(
      Date.now(),
      state.activeHunt.endsAt - HUNT_CLICK_SHAVE_MS
    );
    checkHuntComplete();
    fullRender();
  }

  function onHuntButtonClick() {
    if (state.activeHunt) shaveHuntTimeOnClick();
  }

  var els = {};

  function log(msg, important) {
    var box = els.log;
    if (!box) return;
    var div = document.createElement("div");
    div.className = "line" + (important ? " important" : "");
    div.textContent = msg;
    box.insertBefore(div, box.firstChild);
    while (box.children.length > 45) box.removeChild(box.lastChild);
  }

  function syncBulkBuyUI() {
    var buttons = document.querySelectorAll(".bulk-opt[data-bulk]");
    var k;
    for (k = 0; k < buttons.length; k++) {
      var el = buttons[k];
      var mode = el.getAttribute("data-bulk");
      var on = mode === state.bulkBuy;
      el.classList.toggle("active", on);
      el.setAttribute("aria-pressed", on ? "true" : "false");
    }
  }

  function setBulkBuy(mode) {
    if (mode !== "1" && mode !== "10" && mode !== "100" && mode !== "max")
      return;
    state.bulkBuy = mode;
    fullRender();
  }

  function renderResourcesHeader() {
    syncResourceDiscoveredFromBalances();
    var row = $("resources-row");
    if (!row) return;
    while (row.firstChild) row.removeChild(row.firstChild);
    var j = 0;
    for (; j < RESOURCE_DEFS.length; j++) {
      if (!state.resourceDiscovered[RESOURCE_DEFS[j].id]) break;
    }
    var i;
    for (i = 0; i < j; i++) {
      appendResourceHeaderStat(row, RESOURCE_DEFS[i], false);
    }
    if (j < RESOURCE_DEFS.length) {
      appendResourceHeaderStat(row, RESOURCE_DEFS[j], true);
    }
  }

  function appendResourceHeaderStat(row, d, locked) {
    var wrap = document.createElement("div");
    wrap.className = "stat" + (locked ? " stat-locked" : "");
    var lab = document.createElement("span");
    lab.className = "stat-label";
    lab.textContent = d.label;
    var val = document.createElement("span");
    val.className = "stat-value" + (d.statClass ? " " + d.statClass : "");
    val.textContent = locked ? "—" : formatNum(state.resources[d.id] || 0);
    wrap.appendChild(lab);
    wrap.appendChild(val);
    row.appendChild(wrap);
  }

  function renderOrganismShop() {
    var root = els.organisms;
    if (!root) return;
    root.innerHTML = "";
    var i;
    for (i = 0; i < UNITS.length; i++) {
      var u = UNITS[i];
      if (!shouldShowUnitInShop(u, i)) continue;
      var n = bulkPurchaseCountUnit(u);
      var ok = n > 0;
      var card = document.createElement("div");
      card.className = "card card--dossier";
      card.setAttribute("data-unit-id", u.id);
      card.setAttribute("role", "button");
      card.setAttribute("tabindex", "0");
      card.setAttribute(
        "aria-label",
        "Open dossier: " + unitDisplayName(u)
      );
      card.innerHTML =
        '<div class="card-unit-row">' +
        '<div class="card-portrait">' +
        '<img class="card-portrait__img" alt="" decoding="async" />' +
        '<div class="card-portrait__fallback" aria-hidden="true">' +
        '<div class="creature creature--1 card-portrait-creature"></div>' +
        "</div></div>" +
        '<div class="card-unit-main">' +
        '<div class="card-head"><span class="card-name"></span><span class="card-owned"></span></div>' +
        '<div class="card-foot"><span class="card-cost"></span><button type="button" class="btn-buy"></button></div>' +
        "</div></div>";
      var pImg = card.querySelector(".card-portrait__img");
      var pCreature = card.querySelector(".card-portrait-creature");
      if (pCreature)
        pCreature.className =
          "creature card-portrait-creature creature--" +
          (u.chamberLevel || 1);
      if (pImg) {
        (function (imgEl, unitRef) {
          var url = unitPortraitSrc(unitRef);
          imgEl.alt = unitDisplayName(unitRef);
          imgEl.classList.remove("is-loaded", "is-broken");
          imgEl.onload = function () {
            imgEl.classList.add("is-loaded");
            imgEl.classList.remove("is-broken");
          };
          imgEl.onerror = function () {
            imgEl.classList.remove("is-loaded");
            imgEl.classList.add("is-broken");
          };
          if (!url) {
            imgEl.removeAttribute("src");
          } else {
            imgEl.src = url;
            if (imgEl.complete && imgEl.naturalWidth > 0) {
              imgEl.classList.add("is-loaded");
              imgEl.classList.remove("is-broken");
            }
          }
        })(pImg, u);
      }
      var revealed = isUnitNameRevealed(u);
      card.classList.toggle("card-mysterious", !revealed);
      card.querySelector(".card-name").textContent = unitDisplayName(u);
      card.querySelector(".card-owned").textContent =
        "×" +
        formatNum(availableUnits(u.id)) +
        " ready · " +
        formatNum(state.unitCounts[u.id] || 0) +
        " total";
      var costEl = card.querySelector(".card-cost");
      costEl.textContent = unitCostLabel(u);
      /* Affordability only — masked names must still allow the first hatch. */
      costEl.classList.toggle("bad", !ok && revealed);
      var btn = card.querySelector(".btn-buy");
      var verb = u.buyVerb || "Add";
      btn.textContent = ok ? verb + " ×" + formatNum(n) : verb;
      btn.disabled = !ok;
      btn.addEventListener(
        "click",
        (function (unit) {
          return function (ev) {
            ev.stopPropagation();
            buyUnit(unit);
          };
        })(u)
      );
      card.addEventListener(
        "click",
        (function (unit) {
          return function (ev) {
            if (ev.target.closest(".btn-buy")) return;
            openUnitDetailModal(unit);
          };
        })(u)
      );
      (function (unit) {
        card.addEventListener("keydown", function (ev) {
          if (ev.key === "Enter" || ev.key === " ") {
            ev.preventDefault();
            if (!ev.target.closest(".btn-buy")) openUnitDetailModal(unit);
          }
        });
      })(u);
      root.appendChild(card);
    }
  }

  /** Sync buy buttons / costs / counts without rebuilding cards (tick + avoids stale disabled state). */
  function refreshOrganismShopRowState() {
    var root = els.organisms;
    if (!root) return;
    var cards = root.querySelectorAll(".card[data-unit-id]");
    var i;
    for (i = 0; i < cards.length; i++) {
      var card = cards[i];
      var id = card.getAttribute("data-unit-id");
      var u = getUnit(id);
      if (!u) continue;
      var ownedEl = card.querySelector(".card-owned");
      if (ownedEl) {
        ownedEl.textContent =
          "×" +
          formatNum(availableUnits(u.id)) +
          " ready · " +
          formatNum(state.unitCounts[u.id] || 0) +
          " total";
      }
      var revealed = isUnitNameRevealed(u);
      var nameEl = card.querySelector(".card-name");
      if (nameEl) nameEl.textContent = unitDisplayName(u);
      card.classList.toggle("card-mysterious", !revealed);
      var n = bulkPurchaseCountUnit(u);
      var ok = n > 0;
      var costEl = card.querySelector(".card-cost");
      if (costEl) {
        costEl.textContent = unitCostLabel(u);
        costEl.classList.toggle("bad", !ok && revealed);
      }
      var btn = card.querySelector(".btn-buy");
      if (btn) {
        var verb = u.buyVerb || "Add";
        btn.textContent = ok ? verb + " ×" + formatNum(n) : verb;
        btn.disabled = !ok;
      }
    }
  }

  function renderExpedition() {
    var areaList = $("area-list");
    if (!areaList) return;
    areaList.innerHTML = "";
    var i;
    var oneLockedShown = false;
    var visibleAreas = [];
    for (i = 0; i < AREAS.length; i++) {
      var a0 = AREAS[i];
      var u0 = !!state.areasUnlocked[a0.id];
      if (!u0) {
        if (oneLockedShown) continue;
        oneLockedShown = true;
      }
      visibleAreas.push(a0);
    }
    if (visibleAreas.length) {
      var selOk = false;
      for (i = 0; i < visibleAreas.length; i++) {
        if (visibleAreas[i].id === state.selectedAreaId) {
          selOk = true;
          break;
        }
      }
      if (!selOk) state.selectedAreaId = visibleAreas[0].id;
    }

    for (i = 0; i < visibleAreas.length; i++) {
      var a = visibleAreas[i];
      var unlocked = !!state.areasUnlocked[a.id];
      var row = document.createElement("div");
      row.className =
        "area-row" +
        (a.id === state.selectedAreaId ? " selected" : "") +
        (!unlocked ? " locked" : "");
      row.setAttribute("data-area-id", a.id);
      var title = document.createElement("div");
      title.className = "area-row-title";
      title.textContent = a.name + (unlocked ? "" : " (locked)");
      row.appendChild(title);
      if (!unlocked && a.unlockCost) {
        var uc = document.createElement("div");
        uc.className = "area-unlock-cost";
        var parts = [];
        var k;
        for (k in a.unlockCost) {
          if (a.unlockCost.hasOwnProperty(k))
            parts.push(
              formatNum(a.unlockCost[k]) + " " + resourceLabel(k)
            );
        }
        uc.textContent = "Unlock: " + parts.join(", ");
        row.appendChild(uc);
        var ub = document.createElement("button");
        ub.type = "button";
        ub.className = "btn btn-unlock";
        ub.textContent = "Unlock";
        ub.disabled = !canPay(a.unlockCost);
        ub.addEventListener(
          "click",
          (function (ar) {
            return function () {
              tryUnlockArea(ar);
            };
          })(a)
        );
        row.appendChild(ub);
      } else if (unlocked) {
        row.addEventListener(
          "click",
          (function (aid) {
            return function () {
              state.selectedAreaId = aid;
              fullRender();
              maybeAutoStartHunt();
            };
          })(a.id)
        );
      }
      areaList.appendChild(row);
    }

    var sel = getArea(state.selectedAreaId);
    var blurb = $("area-blurb");
    if (blurb) blurb.textContent = sel ? sel.blurb : "";
    updateAreaPreview(sel);
    renderAreaPreviewPreyChips(sel);

    if (anyReadyHunters()) {
      var hi;
      for (hi = 0; hi < UNITS.length; hi++) {
        if (availableUnits(UNITS[hi].id) >= 1) {
          state.selectedUnitId = UNITS[hi].id;
          break;
        }
      }
    }

    var idleStatus = $("expedition-idle-status");
    var huntProgress = $("hunt-progress");
    var huntProgressFill = $("hunt-progress-fill");
    var btnHunt = $("btn-hunt");
    if (state.activeHunt) {
      var left = Math.max(
        0,
        Math.ceil((state.activeHunt.endsAt - Date.now()) / 1000)
      );
      var remainingMs = Math.max(0, state.activeHunt.endsAt - Date.now());
      var denom = HUNT_DURATION_SEC * 1000;
      var pctDone = Math.max(
        0,
        Math.min(100, (1 - remainingMs / denom) * 100)
      );
      if (idleStatus) {
        idleStatus.textContent = "";
        idleStatus.setAttribute("aria-hidden", "true");
      }
      if (huntProgress && huntProgressFill) {
        huntProgress.classList.remove("hunt-progress--hidden");
        huntProgress.setAttribute("aria-hidden", "false");
        huntProgress.setAttribute("aria-valuenow", String(Math.round(pctDone)));
        huntProgress.setAttribute(
          "aria-valuetext",
          Math.round(pctDone) +
            "% complete, about " +
            left +
            " seconds left"
        );
        huntProgressFill.style.width = pctDone + "%";
      }
      if (btnHunt) {
        btnHunt.disabled = false;
        btnHunt.textContent = "Speed up hunt";
        btnHunt.setAttribute(
          "aria-label",
          "Speed up hunt — removes 1 second per click"
        );
        btnHunt.title = "Each click removes 1 second from the hunt timer.";
      }
    } else {
      if (idleStatus) {
        var arWait = getArea(state.selectedAreaId);
        var canAuto =
          arWait &&
          state.areasUnlocked[arWait.id] &&
          anyReadyHunters();
        if (canAuto) {
          idleStatus.textContent = "";
          idleStatus.setAttribute("aria-hidden", "true");
        } else {
          idleStatus.textContent = "No hunt in progress.";
          idleStatus.removeAttribute("aria-hidden");
        }
      }
      if (huntProgress) {
        huntProgress.classList.add("hunt-progress--hidden");
        huntProgress.setAttribute("aria-hidden", "true");
        huntProgress.removeAttribute("aria-valuenow");
        huntProgress.removeAttribute("aria-valuetext");
      }
      if (huntProgressFill) huntProgressFill.style.width = "0%";
      if (btnHunt) {
        btnHunt.disabled = true;
        btnHunt.textContent = "Hunt";
        btnHunt.setAttribute(
          "aria-label",
          "Hunt (automatic); becomes Speed up hunt during a run"
        );
        btnHunt.removeAttribute("title");
      }
    }

    var report = $("hunt-last-report");
    if (report) {
      if (state.lastHuntReport) {
        var r = state.lastHuntReport;
        var sentLine = r.packDesc
          ? r.packDesc
          : formatNum(r.sent) +
            " " +
            r.unitName +
            (r.sent === 1 ? "" : "s");
        report.innerHTML =
          "<strong>Last report — " +
          r.areaName +
          "</strong><br/>" +
          "Sent " +
          sentLine +
          "<br/>" +
          "Survivors: " +
          formatNum(r.survivorsReturned) +
          " · Lost: " +
          formatNum(r.lost) +
          "<br/>" +
          "Prey seen: " +
          r.preyEncountered +
          "<br/>" +
          "Prey killed: " +
          r.preyKilled +
          "<br/>" +
          "Loot: " +
          r.lootStr;
      } else {
        report.textContent = "No hunt reports yet.";
      }
    }

  }

  function renderHuntHistory() {
    var box = $("hunt-history");
    if (!box) return;
    box.innerHTML = "";
    var i;
    for (i = 0; i < state.huntLog.length; i++) {
      var r = state.huntLog[i];
      var item = document.createElement("div");
      item.className = "hunt-history-item";
      var histSent = r.packDesc
        ? r.packDesc
        : formatNum(r.sent) +
          " " +
          r.unitName +
          (r.sent === 1 ? "" : "s");
      item.innerHTML =
        "<strong>" +
        r.areaName +
        "</strong> — " +
        histSent +
        " · back " +
        formatNum(r.survivorsReturned) +
        " · loot: " +
        r.lootStr;
      box.appendChild(item);
    }
  }

  function fullRender() {
    syncBulkBuyUI();
    renderResourcesHeader();
    renderOrganismShop();
    renderExpedition();
    renderHuntHistory();
  }

  function tick() {
    var now = Date.now();
    var dt = (now - state.lastTick) / 1000;
    if (dt < 0) dt = 0;
    if (dt > OFFLINE_CAP_SEC) dt = OFFLINE_CAP_SEC;
    state.lastTick = now;
    checkHuntComplete();
    maybeAutoStartHunt();
    renderResourcesHeader();
    refreshOrganismShopRowState();
    renderExpedition();
  }

  function serialize() {
    return JSON.stringify({
      v: 2,
      resources: state.resources,
      resourceDiscovered: state.resourceDiscovered,
      unitCounts: state.unitCounts,
      deployed: state.deployed,
      areasUnlocked: state.areasUnlocked,
      selectedAreaId: state.selectedAreaId,
      selectedUnitId: state.selectedUnitId,
      bulkBuy: state.bulkBuy,
      activeHunt: state.activeHunt,
      lastHuntReport: state.lastHuntReport,
      huntLog: state.huntLog,
      lastTick: state.lastTick,
      preyDiscovered: state.preyDiscovered,
      unitStickRevealed: state.unitStickRevealed,
    });
  }

  function load(raw) {
    try {
      var d = JSON.parse(raw);
      if (d.v !== 2) return false;
      state.resources = d.resources || emptyResources();
      state.resourceDiscovered = defaultResourceDiscovered();
      if (d.resourceDiscovered) {
        var rdk;
        for (rdk in d.resourceDiscovered) {
          if (
            d.resourceDiscovered.hasOwnProperty(rdk) &&
            state.resourceDiscovered.hasOwnProperty(rdk)
          )
            state.resourceDiscovered[rdk] = !!d.resourceDiscovered[rdk];
        }
      }
      state.unitCounts = d.unitCounts || defaultUnitCounts();
      state.deployed = d.deployed || defaultUnitCounts();
      state.areasUnlocked = applyAreasUnlockedFromSave(d.areasUnlocked);
      state.selectedAreaId = d.selectedAreaId || "prairie";
      syncSelectedAreaToUnlocked();
      state.selectedUnitId = d.selectedUnitId || "fleshmite";
      state.bulkBuy =
        d.bulkBuy === "1" ||
        d.bulkBuy === "10" ||
        d.bulkBuy === "100" ||
        d.bulkBuy === "max"
          ? d.bulkBuy
          : "1";
      state.activeHunt = d.activeHunt || null;
      state.lastHuntReport = d.lastHuntReport || null;
      state.huntLog = d.huntLog || [];
      state.lastTick =
        typeof d.lastTick === "number" ? d.lastTick : Date.now();
      mergePreyDiscoveredFromSave(d);
      state.unitStickRevealed = defaultUnitStickRevealed();
      if (d.unitStickRevealed && typeof d.unitStickRevealed === "object") {
        var uk;
        for (uk in d.unitStickRevealed) {
          if (d.unitStickRevealed.hasOwnProperty(uk))
            state.unitStickRevealed[uk] = !!d.unitStickRevealed[uk];
        }
      }
      var tj = getUnit("tunnel_jack");
      if (
        tj &&
        tj.stickRevealAfterFirstPurchase &&
        (state.unitCounts.tunnel_jack || 0) > 0
      )
        state.unitStickRevealed.tunnel_jack = true;
      backfillPreyDiscoveredFromReports();
      return true;
    } catch (e) {
      return false;
    }
  }

  function applyOfflineHunt() {
    var now = Date.now();
    state.lastTick = now;
    if (state.activeHunt && now >= state.activeHunt.endsAt) resolveHunt();
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, serialize());
    } catch (e) {}
  }

  function resetGame() {
    if (
      !confirm(
        "Erase all progress—resources, organisms, hunts, and unlocks? This cannot be undone."
      )
    )
      return;
    localStorage.removeItem(STORAGE_KEY);
    state.resources = emptyResources();
    state.resources.meat = 15;
    state.resourceDiscovered = defaultResourceDiscovered();
    state.preyDiscovered = {};
    state.unitStickRevealed = defaultUnitStickRevealed();
    state.unitCounts = defaultUnitCounts();
    state.unitCounts.fleshmite = 0;
    state.deployed = defaultUnitCounts();
    state.areasUnlocked = {
      prairie: true,
      cave: false,
      forest: false,
      village: false,
      city: false,
    };
    state.selectedAreaId = "prairie";
    state.selectedUnitId = "fleshmite";
    state.bulkBuy = "1";
    state.activeHunt = null;
    state.lastHuntReport = null;
    state.huntLog = [];
    state.lastRenderedPreviewAreaId = null;
    state.lastTick = Date.now();
    $("event-log").innerHTML = "";
    log("The colony remembers nothing. Fifteen lumps of meat and a hunger.", true);
    fullRender();
    save();
  }

  function init() {
    els.organisms = $("organisms-list");
    els.log = $("event-log");

    document.title = "Alien Colony — Prototype v" + GAME_VERSION;
    var verEl = $("game-version");
    if (verEl) verEl.textContent = "Prototype v" + GAME_VERSION;

    var raw = localStorage.getItem(STORAGE_KEY);
    if (raw && load(raw)) {
      applyOfflineHunt();
      log("State restored.", false);
    } else {
      state.resources = emptyResources();
      state.resources.meat = 15;
      state.resourceDiscovered = defaultResourceDiscovered();
      state.preyDiscovered = {};
      state.unitStickRevealed = defaultUnitStickRevealed();
      state.unitCounts = defaultUnitCounts();
      state.unitCounts.fleshmite = 0;
      state.deployed = defaultUnitCounts();
      state.lastTick = Date.now();
      log(
        "Fifteen Meat in the wet dark. Hatch a Fleshmite—ready hunters deploy to the Prairie on their own.",
        true
      );
    }

    $("btn-save").addEventListener("click", function () {
      save();
      log("Saved.", false);
    });
    $("btn-reset").addEventListener("click", resetGame);

    var bulkBtns = document.querySelectorAll(".bulk-opt[data-bulk]");
    var bi;
    for (bi = 0; bi < bulkBtns.length; bi++) {
      bulkBtns[bi].addEventListener("click", function () {
        setBulkBuy(this.getAttribute("data-bulk"));
      });
    }

    $("btn-hunt").addEventListener("click", onHuntButtonClick);

    var unitBackdrop = $("unit-detail-backdrop");
    if (unitBackdrop) unitBackdrop.addEventListener("click", closeUnitDetailModal);
    var unitClose = $("unit-detail-close");
    if (unitClose) unitClose.addEventListener("click", closeUnitDetailModal);
    document.addEventListener("keydown", function (ev) {
      if (ev.key !== "Escape") return;
      var um = $("unit-detail-modal");
      if (!um || um.classList.contains("is-hidden")) return;
      closeUnitDetailModal();
    });

    fullRender();
    maybeAutoStartHunt();
    setInterval(tick, TICK_MS);
    setInterval(save, AUTOSAVE_MS);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
