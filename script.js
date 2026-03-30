/**
 * Buried Hunger — one-currency horror idle prototype (Meat only).
 * Plain HTML/CSS/JS, localStorage, no dependencies.
 *
 * Version bump: change GAME_VERSION only — UI title, label, and save slot follow.
 */

(function () {
  "use strict";

  var GAME_VERSION = "0.2";
  var STORAGE_KEY =
    "buriedHunger_v" + GAME_VERSION.replace(/\./g, "");
  /* Steeper per-buy scaling = buildings stay meaningful longer. */
  var COST_MULT = 1.185;
  var AUTOSAVE_MS = 5000;
  var TICK_MS = 100;
  var OFFLINE_CAP_SEC = 86400;

  /** Building definitions: id matches state.counts key. */
  var BUILDINGS = [
    {
      id: "filament",
      name: "Sticky Filament",
      baseCost: 32,
      baseMps: 0.12,
      desc: "Sticky strands snag insects and anything small that crawls past.",
      unlockTotal: 0,
      doubleUpgradeId: "webbing",
    },
    {
      id: "sac",
      name: "Digestive Sac",
      baseCost: 115,
      baseMps: 0.62,
      desc: "What you swallow dissolves faster; more of it becomes Meat.",
      unlockTotal: 50,
      doubleUpgradeId: "digest",
    },
    {
      id: "lure",
      name: "Lure Gland",
      baseCost: 520,
      baseMps: 2.9,
      desc: "Heat and rot-sweet smell coax small things within reach.",
      unlockTotal: 250,
      doubleUpgradeId: "scent",
    },
    {
      id: "nest",
      name: "Crawler Nest",
      baseCost: 2400,
      baseMps: 11,
      desc: "Small hunters crawl the cracks and drag prey back to you.",
      unlockTotal: 1000,
      doubleUpgradeId: "clever",
    },
    {
      id: "throat",
      name: "Imitation Throat",
      baseCost: 12000,
      baseMps: 52,
      desc: "Mimics cries and calls from above to lure larger prey downward.",
      unlockTotal: 5000,
      doubleUpgradeId: null,
    },
  ];

  /**
   * Upgrades: unlockTotal = min total Meat ever gained to show in shop.
   * type: "click" | "passive" | "double" (double targets building id in targets)
   */
  var UPGRADES = [
    {
      id: "hooks",
      name: "Sharpened Hooks",
      cost: 70,
      unlockTotal: 0,
      type: "click",
      clickAdd: 1,
      desc: "Barbed hooks snag harder: +1 Meat added to every manual bite.",
    },
    {
      id: "acid",
      name: "Acidic Fluids",
      cost: 420,
      unlockTotal: 50,
      type: "passive",
      passiveMult: 1.25,
      desc: "Stronger digestive chemistry: +25% Meat from all passive sources.",
    },
    {
      id: "split",
      name: "Split Maw",
      cost: 290,
      unlockTotal: 150,
      type: "click",
      clickAdd: 2,
      desc: "A second set of jaws: +2 Meat added to every manual bite.",
    },
    {
      id: "webbing",
      name: "Adhesive Webbing",
      cost: 850,
      unlockTotal: 150,
      type: "double",
      targetBuilding: "filament",
      desc: "Filaments stick twice as well: each Sticky Filament yields double Meat.",
    },
    {
      id: "elastic",
      name: "Elastic Tendons",
      cost: 1200,
      unlockTotal: 950,
      type: "click",
      clickAdd: 4,
      desc: "Longer, faster strikes: +4 Meat added to every manual bite.",
    },
    {
      id: "dense",
      name: "Dense Muscle",
      cost: 1750,
      unlockTotal: 500,
      type: "passive",
      passiveMult: 1.25,
      desc: "Thicker muscle along the burrow: +25% Meat from all passive sources.",
    },
    {
      id: "digest",
      name: "Efficient Digestion",
      cost: 3800,
      unlockTotal: 1000,
      type: "double",
      targetBuilding: "sac",
      desc: "Sacs work in tandem: each Digestive Sac yields double Meat.",
    },
    {
      id: "warm",
      name: "Warm Nest",
      cost: 6500,
      unlockTotal: 2000,
      type: "passive",
      passiveMult: 1.5,
      desc: "Your mass stays warm and hungry: +50% Meat from all passive sources.",
    },
    {
      id: "scent",
      name: "Sweet Rot Scent",
      cost: 11000,
      unlockTotal: 3500,
      type: "double",
      targetBuilding: "lure",
      desc: "The lure reeks sweeter: each Lure Gland yields double Meat.",
    },
    {
      id: "clever",
      name: "Clever Young",
      cost: 32000,
      unlockTotal: 9000,
      type: "double",
      targetBuilding: "nest",
      desc: "The young learn ambush: each Crawler Nest yields double Meat.",
    },
  ];

  /**
   * Creature evolution: lifetime Meat thresholds, level, form name, flavor line, feed button.
   * Sorted by `min` ascending; getCreaturePhase() picks the highest tier the player has reached.
   * Sprite: assets/creature-evolution.png — 984×644 px, five columns; display size via --creature-display-h-num in CSS.
   */
  var CREATURE_TIERS = [
    {
      min: 0,
      level: 1,
      formName: "Larval Snare",
      flavor:
        "Barely alive—only just able to catch bugs in the cracks.",
      preyLabel: "Snatch Bug",
    },
    {
      min: 50,
      level: 2,
      formName: "Gnawing Cluster",
      flavor:
        "A stronger mouth; vermin-sized prey begins to vanish into you.",
      preyLabel: "Consume Vermin",
    },
    {
      min: 250,
      level: 3,
      formName: "Tendon Maw",
      flavor:
        "A larger feeding body—you can drag rats down from the edges.",
      preyLabel: "Drag In Rat",
    },
    {
      min: 1000,
      level: 4,
      formName: "Brood Throat",
      flavor:
        "A mature mass: lures, crawlers, and a throat that does not tire.",
      preyLabel: "Pull Down Bird",
    },
    {
      min: 5000,
      level: 5,
      formName: "Imitation Organ",
      flavor:
        "Advanced flesh: shaped cries draw larger prey toward the shaft.",
      preyLabel: "Take Stray",
    },
  ];

  var FLAVOR_LINES = [
    "Something shifts in the rock overhead.",
    "The brood feels your appetite and moves.",
    "Tiny legs skitter, then go still.",
    "The burrow widens a fraction where you press.",
    "A larger shape hesitates at the tunnel's edge.",
    "The false cry was wrong. The throat will try another shape.",
    "Water from the surface carries dust and old blood.",
    "Heat from your core seeps into cold stone.",
    "The seep tastes faintly of rain from above.",
  ];

  var state = {
    meat: 0,
    totalMeat: 0,
    counts: { filament: 0, sac: 0, lure: 0, nest: 0, throat: 0 },
    bought: {},
    lastTick: Date.now(),
    logFlags: {},
    flavorTimer: null,
  };

  function $(id) {
    return document.getElementById(id);
  }

  function formatNum(n) {
    if (!isFinite(n)) return "0";
    var sign = n < 0 ? "-" : "";
    var x = Math.abs(n);
    if (x < 1000) {
      if (x % 1 !== 0) {
        return sign + x.toFixed(2).replace(/\.?0+$/, "");
      }
      return sign + String(Math.round(x));
    }
    var suf = ["K", "M", "B", "T"];
    var i = -1;
    while (x >= 1000 && i < suf.length - 1) {
      x /= 1000;
      i++;
    }
    var d = x < 10 ? 2 : x < 100 ? 1 : 0;
    return sign + x.toFixed(d) + suf[i];
  }

  function getCreaturePhase(lifetimeMeat) {
    var phase = CREATURE_TIERS[0];
    var i;
    for (i = 0; i < CREATURE_TIERS.length; i++) {
      if (lifetimeMeat >= CREATURE_TIERS[i].min) phase = CREATURE_TIERS[i];
    }
    return phase;
  }

  /** Updates creature chamber: level, form, visual tier, prey label, flavor, compact stats. */
  function renderCreatureChamber() {
    var p = getCreaturePhase(state.totalMeat);
    var lvlEl = $("creature-level");
    var formEl = $("creature-form-name");
    var flavorEl = $("creature-flavor");
    var vis = $("creature-visual");
    if (lvlEl) lvlEl.textContent = "LVL " + p.level;
    if (formEl) formEl.textContent = p.formName;
    if (flavorEl) flavorEl.textContent = p.flavor;
    if (vis) {
      vis.className = "creature creature--" + p.level;
      vis.setAttribute(
        "aria-label",
        "Creature stage " + p.level + ": " + p.formName
      );
    }
    var fl = $("feed-label");
    var fh = $("feed-hint");
    if (fl) fl.textContent = p.preyLabel;
    if (fh) fh.textContent = "+" + formatNum(clickPower()) + " Meat per bite";

    var cm = $("center-meat");
    var cps = $("center-mps");
    var cc = $("center-click");
    var ct = $("center-total");
    if (cm) cm.textContent = formatNum(state.meat);
    if (cps) cps.textContent = formatNum(meatPerSecond()) + "/s";
    if (cc) cc.textContent = formatNum(clickPower());
    if (ct) ct.textContent = formatNum(state.totalMeat);
  }

  function hasUpgrade(id) {
    return !!state.bought[id];
  }

  /** Base Meat per second from buildings before global passive multipliers. */
  function baseMps() {
    var sum = 0;
    var i;
    for (i = 0; i < BUILDINGS.length; i++) {
      var b = BUILDINGS[i];
      var n = state.counts[b.id] || 0;
      if (n === 0) continue;
      var rate = b.baseMps * n;
      if (b.doubleUpgradeId && hasUpgrade(b.doubleUpgradeId)) rate *= 2;
      sum += rate;
    }
    return sum;
  }

  function passiveMult() {
    var m = 1;
    if (hasUpgrade("acid")) m *= 1.25;
    if (hasUpgrade("dense")) m *= 1.25;
    if (hasUpgrade("warm")) m *= 1.5;
    return m;
  }

  function meatPerSecond() {
    return baseMps() * passiveMult();
  }

  /** Meat/s from one building type (all owned), after double upgrades and global passive mult. */
  function buildingMps(b) {
    var n = state.counts[b.id] || 0;
    if (n === 0) return 0;
    var rate = b.baseMps * n;
    if (b.doubleUpgradeId && hasUpgrade(b.doubleUpgradeId)) rate *= 2;
    return rate * passiveMult();
  }

  function clickPower() {
    var p = 1;
    if (hasUpgrade("hooks")) p += 1;
    if (hasUpgrade("split")) p += 2;
    if (hasUpgrade("elastic")) p += 4;
    return p;
  }

  function buildingCost(b) {
    var owned = state.counts[b.id] || 0;
    return b.baseCost * Math.pow(COST_MULT, owned);
  }

  var els = {};

  var MAX_LOG = 45;

  function log(msg, important) {
    var box = els.log;
    if (!box) return;
    var div = document.createElement("div");
    div.className = "line" + (important ? " important" : "");
    div.textContent = msg;
    box.insertBefore(div, box.firstChild);
    while (box.children.length > MAX_LOG) box.removeChild(box.lastChild);
  }

  function logOnce(key, msg, important) {
    if (state.logFlags[key]) return;
    state.logFlags[key] = true;
    log(msg, important);
  }

  function scheduleFlavor() {
    if (state.flavorTimer) clearTimeout(state.flavorTimer);
    var delay = 20000 + Math.random() * 20000;
    state.flavorTimer = setTimeout(function () {
      log(FLAVOR_LINES[Math.floor(Math.random() * FLAVOR_LINES.length)], false);
      scheduleFlavor();
    }, delay);
  }

  function renderTop() {
    $("meat-display").textContent = formatNum(state.meat);
    $("mps-display").textContent = formatNum(meatPerSecond()) + "/s";
    $("total-display").textContent = formatNum(state.totalMeat);
    var clickTop = $("click-display");
    if (clickTop) clickTop.textContent = formatNum(clickPower());
    renderCreatureChamber();
  }

  function canAfford(price) {
    return state.meat >= price;
  }

  /** When this changes, building/upgrade rows or their counts/purchased state changed — full rebuild needed. */
  function getShopStructureSig() {
    var parts = [];
    var i;
    for (i = 0; i < BUILDINGS.length; i++) {
      var b = BUILDINGS[i];
      if (state.totalMeat < b.unlockTotal) continue;
      parts.push(b.id + ":" + (state.counts[b.id] || 0));
    }
    for (i = 0; i < UPGRADES.length; i++) {
      var u = UPGRADES[i];
      if (state.totalMeat < u.unlockTotal) continue;
      parts.push(u.id + ":" + (hasUpgrade(u.id) ? "1" : "0"));
    }
    return parts.join("|");
  }

  /** Update costs and disabled state without replacing nodes (avoids hover flicker on tick). */
  function refreshShopAffordability() {
    var rootB = els.buildings;
    var rootU = els.upgrades;
    if (!rootB || !rootU) return;

    var cards = rootB.querySelectorAll(".card[data-building-id]");
    var idx;
    for (idx = 0; idx < cards.length; idx++) {
      var card = cards[idx];
      var bid = card.getAttribute("data-building-id");
      var b = null;
      var j;
      for (j = 0; j < BUILDINGS.length; j++) {
        if (BUILDINGS[j].id === bid) {
          b = BUILDINGS[j];
          break;
        }
      }
      if (!b) continue;
      var cost = buildingCost(b);
      var ok = canAfford(cost);
      var owned = state.counts[b.id] || 0;
      var costEl = card.querySelector(".card-cost");
      var btn = card.querySelector(".btn-buy");
      var ownEl = card.querySelector(".card-owned");
      if (ownEl) ownEl.textContent = "×" + formatNum(owned);
      var mpsEl = card.querySelector(".card-mps-value");
      if (mpsEl) mpsEl.textContent = formatNum(buildingMps(b)) + "/s";
      if (costEl) {
        costEl.textContent = formatNum(cost) + " Meat";
        if (ok) costEl.classList.remove("bad");
        else costEl.classList.add("bad");
      }
      if (btn) btn.disabled = !ok;
    }

    var ucards = rootU.querySelectorAll(".card[data-upgrade-id]:not(.done)");
    for (idx = 0; idx < ucards.length; idx++) {
      var ucard = ucards[idx];
      var uid = ucard.getAttribute("data-upgrade-id");
      var u = null;
      for (j = 0; j < UPGRADES.length; j++) {
        if (UPGRADES[j].id === uid) {
          u = UPGRADES[j];
          break;
        }
      }
      if (!u || hasUpgrade(uid)) continue;
      var uok = canAfford(u.cost);
      var ucostEl = ucard.querySelector(".card-cost");
      var ubtn = ucard.querySelector(".btn-buy");
      if (ucostEl) {
        if (uok) ucostEl.classList.remove("bad");
        else ucostEl.classList.add("bad");
      }
      if (ubtn) ubtn.disabled = !uok;
    }
  }

  function renderBuildings() {
    var root = els.buildings;
    root.innerHTML = "";
    var i;
    for (i = 0; i < BUILDINGS.length; i++) {
      var b = BUILDINGS[i];
      if (state.totalMeat < b.unlockTotal) continue;

      var cost = buildingCost(b);
      var owned = state.counts[b.id] || 0;
      var ok = canAfford(cost);

      var card = document.createElement("div");
      card.className = "card";
      card.setAttribute("data-building-id", b.id);
      card.innerHTML =
        '<div class="card-head">' +
        '<span class="card-name"></span>' +
        '<span class="card-owned"></span></div>' +
        '<div class="card-mps">' +
        '<span class="card-mps-label">Meat/s</span>' +
        '<span class="card-mps-value"></span></div>' +
        '<div class="card-foot">' +
        '<span class="card-cost"></span>' +
        '<button type="button" class="btn-buy">Add</button></div>';

      card.querySelector(".card-name").textContent = b.name;
      card.querySelector(".card-owned").textContent = "×" + formatNum(owned);
      card.querySelector(".card-mps-value").textContent =
        formatNum(buildingMps(b)) + "/s";
      var costEl = card.querySelector(".card-cost");
      costEl.textContent = formatNum(cost) + " Meat";
      if (!ok) costEl.classList.add("bad");
      var btn = card.querySelector(".btn-buy");
      btn.disabled = !ok;
      btn.addEventListener("click", function (building) {
        return function () {
          buyBuilding(building);
        };
      }(b));

      root.appendChild(card);
    }
  }

  function renderUpgrades() {
    var root = els.upgrades;
    root.innerHTML = "";
    var i;
    for (i = 0; i < UPGRADES.length; i++) {
      var u = UPGRADES[i];
      if (state.totalMeat < u.unlockTotal) continue;
      var done = hasUpgrade(u.id);
      var ok = done || canAfford(u.cost);

      var card = document.createElement("div");
      card.className = "card" + (done ? " done" : "");
      card.setAttribute("data-upgrade-id", u.id);

      card.innerHTML =
        '<div class="card-head">' +
        '<span class="card-name"></span>' +
        '<span class="installed"></span></div>' +
        '<p class="card-desc"></p>' +
        '<div class="card-foot">' +
        '<span class="card-cost"></span>' +
        '<button type="button" class="btn-buy">Mutate</button></div>';

      card.querySelector(".card-name").textContent = u.name;
      var tag = card.querySelector(".installed");
      tag.textContent = done ? "Fused" : "";
      card.querySelector(".card-desc").textContent = u.desc;
      var costEl = card.querySelector(".card-cost");
      costEl.textContent = done ? "—" : formatNum(u.cost) + " Meat";
      if (!done && !ok) costEl.classList.add("bad");
      var btn = card.querySelector(".btn-buy");
      if (done) {
        btn.remove();
      } else {
        btn.disabled = !ok;
        btn.addEventListener("click", function (up) {
          return function () {
            buyUpgrade(up);
          };
        }(u));
      }
      root.appendChild(card);
    }
  }

  function checkMilestoneLogs() {
    var t = state.totalMeat;
    if (t >= 50)
      logOnce(
        "m50",
        "You are taking larger prey—vermin crowd the tunnels.",
        true
      );
    if (t >= 250)
      logOnce(
        "m250",
        "Rats fight the pull now. You are heavy enough to win.",
        true
      );
    if (t >= 1000)
      logOnce(
        "m1000",
        "Birds fall once. The imitation cry is improving.",
        true
      );
    if (t >= 5000)
      logOnce(
        "m5000",
        "Strays hear the wrong voice and step too close to the edge.",
        true
      );
  }

  function fullRender() {
    checkMilestoneLogs();
    renderTop();
    renderBuildings();
    renderUpgrades();
  }

  function buyBuilding(b) {
    var cost = buildingCost(b);
    if (state.meat < cost) return;
    state.meat -= cost;
    state.counts[b.id] = (state.counts[b.id] || 0) + 1;
    log("Added tissue: " + b.name + ".", true);
    fullRender();
  }

  function buyUpgrade(u) {
    if (hasUpgrade(u.id)) return;
    if (state.meat < u.cost) return;
    state.meat -= u.cost;
    state.bought[u.id] = true;
    log("Fused into the mass: " + u.name + ".", true);
    fullRender();
  }

  function onFeedClick() {
    var gain = clickPower();
    state.meat += gain;
    state.totalMeat += gain;
    var btn = $("btn-feed");
    btn.classList.remove("clicked");
    void btn.offsetWidth;
    btn.classList.add("clicked");
    setTimeout(function () {
      btn.classList.remove("clicked");
    }, 280);

    var stage = $("creature-stage");
    if (stage) {
      stage.classList.remove("creature-lunge");
      void stage.offsetWidth;
      stage.classList.add("creature-lunge");
      setTimeout(function () {
        stage.classList.remove("creature-lunge");
      }, 400);
    }
    var vis = $("creature-visual");
    if (vis) {
      vis.classList.remove("creature-snap");
      void vis.offsetWidth;
      vis.classList.add("creature-snap");
      setTimeout(function () {
        vis.classList.remove("creature-snap");
      }, 350);
    }

    logOnce("first", "First bite. The hunger knows its own name.", true);
    fullRender();
  }

  function tick() {
    var now = Date.now();
    var dt = (now - state.lastTick) / 1000;
    if (dt < 0) dt = 0;
    if (dt > OFFLINE_CAP_SEC) dt = OFFLINE_CAP_SEC;
    state.lastTick = now;

    var sigBefore = getShopStructureSig();

    var mps = meatPerSecond();
    if (mps > 0) {
      var gain = mps * dt;
      state.meat += gain;
      state.totalMeat += gain;
    }

    renderTop();
    checkMilestoneLogs();

    var sigAfter = getShopStructureSig();
    if (sigBefore !== sigAfter) {
      renderBuildings();
      renderUpgrades();
    } else {
      refreshShopAffordability();
    }
  }

  function serialize() {
    return JSON.stringify({
      meat: state.meat,
      totalMeat: state.totalMeat,
      counts: state.counts,
      bought: state.bought,
      lastTick: state.lastTick,
      logFlags: state.logFlags,
    });
  }

  function load(raw) {
    try {
      var d = JSON.parse(raw);
      state.meat = typeof d.meat === "number" ? d.meat : 0;
      state.totalMeat = typeof d.totalMeat === "number" ? d.totalMeat : 0;
      state.counts = d.counts || state.counts;
      state.bought = d.bought || {};
      state.lastTick = typeof d.lastTick === "number" ? d.lastTick : Date.now();
      state.logFlags = d.logFlags || {};
      return true;
    } catch (e) {
      return false;
    }
  }

  function applyOfflineCatchUp() {
    var now = Date.now();
    var dt = (now - state.lastTick) / 1000;
    if (dt < 0) dt = 0;
    if (dt > OFFLINE_CAP_SEC) dt = OFFLINE_CAP_SEC;
    state.lastTick = now;
    var mps = meatPerSecond();
    if (mps > 0 && dt > 0) {
      var gain = mps * dt;
      state.meat += gain;
      state.totalMeat += gain;
    }
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, serialize());
    } catch (e) {}
  }

  function reset() {
    if (
      !confirm(
        "Wipe the burrow—erase all Meat, tissue, and mutations? This cannot be undone."
      )
    )
      return;
    localStorage.removeItem(STORAGE_KEY);
    state.meat = 0;
    state.totalMeat = 0;
    state.counts = { filament: 0, sac: 0, lure: 0, nest: 0, throat: 0 };
    state.bought = {};
    state.logFlags = {};
    state.lastTick = Date.now();
    $("event-log").innerHTML = "";
    log("Silence in the stone. Then hunger starts over.", true);
    fullRender();
    save();
  }

  /** Prevent duplicate unlock lines after loading a late-game save. */
  function silencePastUnlockLogs() {
    var t = state.totalMeat;
    if (t >= 50) state.logFlags.m50 = true;
    if (t >= 250) state.logFlags.m250 = true;
    if (t >= 1000) state.logFlags.m1000 = true;
    if (t >= 5000) state.logFlags.m5000 = true;
    if (t > 0) state.logFlags.first = true;
  }

  function init() {
    els.buildings = $("buildings-list");
    els.upgrades = $("upgrades-list");
    els.log = $("event-log");

    var verLabel = "Prototype v" + GAME_VERSION;
    document.title = "Buried Hunger — " + verLabel;
    var verEl = $("game-version");
    if (verEl) verEl.textContent = verLabel;

    var raw = localStorage.getItem(STORAGE_KEY);
    if (raw && load(raw)) {
      silencePastUnlockLogs();
      applyOfflineCatchUp();
      log("Burrow state restored from save.", false);
    } else {
      state.lastTick = Date.now();
    }

    $("btn-feed").addEventListener("click", onFeedClick);
    $("btn-save").addEventListener("click", function () {
      save();
      log("Progress saved to this device.", false);
    });
    $("btn-reset").addEventListener("click", reset);

    fullRender();
    scheduleFlavor();
    setInterval(tick, TICK_MS);
    setInterval(save, AUTOSAVE_MS);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
