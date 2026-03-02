/* ===============================
   TLAPKING 4.0 — FULL ARCADE ENGINE
   Single-file: game.js
   Author: ChatGPT (architektura & design)
   Notes: vlož tento soubor místo předchozího game.js
   Requires in HTML: #gameArea, #score, #lives, #buffStatus, #gameOver, #finalScore
================================ */
let gameInterval = null;

const Game = (function () {
  "use strict";

  /* -------------------------
     CONFIG (tweak these to taste)
  ------------------------- */
  const CFG = {
    baseSpeed: 2.8,             // baseline falling speed (pixels / tick unit)
    tickMs: 16.67,              // nominal ms per "tick" for speed normalization
    spawnRateInit: 850,         // ms between spawns at start
    difficultyScoreStep: 30,    // every X points difficulty increases
    difficultySpawnDecrease: 35,// spawnRate decrease per difficulty level
    difficultySpeedIncrease: 0.35,
    maxSimultaneousObjects: 14, // soft cap on objects on screen (adjust)
    comboTimeoutMs: 1100,       // time to continue combo
    frenzyThreshold: 30,        // combo hits to get frenzy
    frenzySpawnBoost: 0.7,      // spawnRate multiplied in frenzy (smaller => faster)
    bossBaseThreshold: 100,     // boss every X points (threshold crossing)
    bossHPBase: 6,              // base boss HP
    bossReward: 40,
    floatingLifetime: 850,
    buffHudTimeout: 2200,
    waveBurstCount: 5,
    waveBurstInterval: 120,
    sessionLeaderboardMax: 10
  };

  /* -------------------------
     INTERNAL STATE
  ------------------------- */
  const state = {
    running: false,
    score: 0,
    lives: 3,
    speed: CFG.baseSpeed,
    baseSpeed: CFG.baseSpeed,
    spawnRate: CFG.spawnRateInit,
    difficultyLevel: 1,
    combo: 0,
    lastComboTick: 0,
    frenzy: false,
    objects: [],        // active objects in arena
    buffs: [],          // active buff objects {id,name,end,meta}
    bossActive: false,
    boss: null,         // boss object structure when active
    nextBossScore: CFG.bossBaseThreshold,
    gameTimeSec: 0      // seconds since start
  };

  /* -------------------------
     DOM references (cached)
  ------------------------- */
  const DOM = {
    area: document.getElementById("gameArea"),
    score: document.getElementById("score"),
    lives: document.getElementById("lives"),
    buffHud: document.getElementById("buffStatus"),
    gameOver: document.getElementById("gameOver"),
    finalScore: document.getElementById("finalScore"),
    // optional (if present in HTML)
    leaderboardList: document.getElementById("scoresList"),
    playerNameInput: document.getElementById("playerName")
  };

  // sanity checks
  if (!DOM.area || !DOM.score || !DOM.lives || !DOM.buffHud || !DOM.gameOver || !DOM.finalScore) {
    console.error("Game.js: missing required DOM elements (#gameArea, #score, #lives, #buffStatus, #gameOver, #finalScore)");
    // don't throw — allow dev to inspect
  }

  /* -------------------------
     UTILITIES
  ------------------------- */
  function nowMs() { return performance.now(); }
  function rand(min, max) { return Math.random() * (max - min) + min; }
  function chooseWeighted(list) {
    // list: [[item,weight],...]
    const total = list.reduce((s, it) => s + it[1], 0);
    let r = Math.random() * total;
    for (const [item, w] of list) {
      if (r < w) return item;
      r -= w;
    }
    return list[0][0];
  }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function uid(prefix = "") { return prefix + Math.random().toString(36).slice(2, 9); }

  /* -------------------------
     OBJECT TYPES / DATA
  ------------------------- */
  const ITEM_TYPES = {
    mouse: { icon: "🐭", score: 1, good: true },
    fish:  { icon: "🐟", score: 3, good: true },
    milk:  { icon: "🥛", score: 10, good: true },
    golden: { icon: "💎", score: 25, good: true, rare:true },
    magnet: { icon: "🧲", buff: "MAGNET", good:true },
    lightning: { icon: "⚡", buff: "LIGHTNING", good:true },
    freeze: { icon: "🕒", buff: "FREEZE", good:true },
    shield: { icon: "🛡️", buff: "SHIELD", good:true },

    snake: { icon: "🐍", damage: 1, good:false },
    bomb:  { icon: "💣", damage: 1, good:false },
    blackBomb: { icon: "🧨", damage:2, good:false },
    killer: { icon: "☠️", damage:5, good:false },
    redmouse: { icon: "🔥", score:15, gamble:true } // gives lots if you click, but penalty if missed
  };

  /* -------------------------
     SPAWN PATTERNS
     We generate objects with types according to weighted tables,
     optionally influenced by wave type or difficulty.
  ------------------------- */
  function pickItemType(waveType) {
    // base probabilities
    const base = [
      ["mouse", 35],
      ["fish", 20],
      ["milk", 7],
      ["golden", 1],
      ["magnet", 3],
      ["lightning", 2],
      ["freeze", 2],
      ["shield", 2],
      ["snake", 12],
      ["bomb", 10],
      ["blackBomb", 1],
      ["redmouse", 3],
      ["killer", 0.5]
    ];

    // adjust based on difficulty and wave type
    const table = base.map(([t, w]) => {
      let weight = w;
      // difficulty increases negative weights slightly
      if (["snake", "bomb", "blackBomb", "killer"].includes(t)) {
        weight += (state.difficultyLevel - 1) * 1.2;
      }
      // adjust for wave types
      if (waveType === "danger" && ["snake", "bomb", "blackBomb", "killer"].includes(t)) weight *= 1.8;
      if (waveType === "bonus" && ["mouse", "fish", "milk", "golden"].includes(t)) weight *= 2.2;
      if (state.frenzy && ["mouse", "fish", "milk"].includes(t)) weight *= 1.4;
      // make golden more rare but possible
      if (t === "golden") weight = Math.max(0.3, weight - (state.difficultyLevel * 0.1));
      return [t, weight];
    });

    return chooseWeighted(table);
  }

  /* -------------------------
     VISUAL HELPERS
  ------------------------- */
  // create floating text; target can be an object element or area (for global)
  function createFloatingText(targetRectOrEl, text, color = "#ffd166") {
    const el = document.createElement("div");
    el.className = "floating-text";
    el.textContent = text;
    el.style.color = color;
    el.style.position = "absolute";
    el.style.pointerEvents = "none";
    // compute position
    let leftPx = 0, topPx = 0;
    const parentRect = DOM.area.getBoundingClientRect();
    if (targetRectOrEl instanceof HTMLElement) {
      const r = targetRectOrEl.getBoundingClientRect();
      leftPx = r.left - parentRect.left + (r.width / 2);
      topPx = r.top - parentRect.top;
    } else {
      // assume rect {left, top, width}
      leftPx = targetRectOrEl.left - parentRect.left + (targetRectOrEl.width / 2);
      topPx = targetRectOrEl.top - parentRect.top;
    }
    el.style.left = leftPx + "px";
    el.style.top = topPx + "px";
    el.style.transform = "translateX(-50%)";
    DOM.area.appendChild(el);
    setTimeout(() => {
      el.remove();
    }, CFG.floatingLifetime);
  }

  function pulseArea(duration = 500) {
    DOM.area.style.transition = `box-shadow ${duration}ms ease`;
    DOM.area.style.boxShadow = "0 0 40px rgba(211,163,74,0.25)";
    setTimeout(() => {
      DOM.area.style.boxShadow = "";
    }, duration);
  }

  function screenShake(intensity = 6, duration = 220) {
    const el = DOM.area;
    el.style.transition = "";
    el.style.transform = `translateX(${intensity}px)`;
    setTimeout(() => el.style.transform = `translateX(${-intensity}px)`, duration * 0.4);
    setTimeout(() => el.style.transform = `translateX(0px)`, duration);
  }

  /* -------------------------
     OBJECT LIFECYCLE
     objects: {id, el, type, x, y, vy, createdAt, meta}
  ------------------------- */

  function spawnObject(waveType = null) {
    // enforce soft cap
    if (state.objects.length >= CFG.maxSimultaneousObjects) return;

    const type = pickItemType(waveType);
    const metaDef = ITEM_TYPES[type] || ITEM_TYPES.mouse;

    // DOM element
    const el = document.createElement("div");
    el.className = "object";
    el.textContent = metaDef.icon || "❓";
    el.dataset.type = type;
    el.dataset.id = uid("o_");
    el.style.left = Math.floor(rand(8, Math.max(10, DOM.area.clientWidth - 48))) + "px";
    el.style.top = "0px";
    el.style.fontSize = (metaDef.rare ? 42 + rand(6, 14) : 32 + (metaDef.buff ? 4 : 0)) + "px";

    // place into DOM
    DOM.area.appendChild(el);

    // object model
    const obj = {
      id: el.dataset.id,
      el: el,
      type: type,
      createdAt: nowMs(),
      y: 0,
      vy: state.speed * rand(0.9, 1.25),
      meta: metaDef
    };

    // event handlers
    el.addEventListener("click", (ev) => {
      ev.preventDefault();
      handleHit(obj);
    }, { passive: false });

    el.addEventListener("touchstart", (ev) => {
      ev.preventDefault();
      handleHit(obj);
    }, { passive: false });

    state.objects.push(obj);
  }

  function removeObject(obj) {
    try {
      obj.el.remove();
    } catch (e) { /* ignore DOM missing */ }
    const idx = state.objects.findIndex(o => o.id === obj.id);
    if (idx >= 0) state.objects.splice(idx, 1);
  }

  /* -------------------------
     HIT / PLAYER INTERACTIONS
  ------------------------- */
  function handleHit(obj) {
    // if boss active and clicked object is boss (boss represented separately), handle elsewhere
    if (!obj || !obj.meta) return;
    const t = obj.type;
    const meta = obj.meta;

    // apply immediate effects
    if (meta.good) {
      // points, combo, special handling for golden etc.
      let points = meta.score || 0;
      // apply gamble or risk for redmouse
      if (meta.gamble && t === "redmouse") {
        // redmouse: points high but if missed: -2 life (handled on miss); award points if hit
        points = meta.score;
      }
      // apply multiplier & combo multiplier
      incrementCombo();
      let comboMultiplier = 1 + (state.combo * 0.12);
      if (state.frenzy) comboMultiplier *= 1.8;
      if (hasBuff("POWER")) points *= 2;
      const gained = Math.round(points * comboMultiplier);
      state.score += gained;
      createFloatingText(obj.el, "+" + gained, "#ffd166");
      pulseArea(180);
    } else {
      // negative items harm the player
      if (meta.damage) {
        loseLife(meta.damage);
        createFloatingText(obj.el, "-" + meta.damage + " ❤️", "red");
        screenShake(8, 200);
      }
      if (t === "redmouse") {
        // redmouse if hit: award but softer combo effect
        incrementCombo();
        let points = meta.score;
        if (hasBuff("POWER")) points *= 2;
        const gained = Math.round(points * (1 + state.combo * 0.08));
        state.score += gained;
        createFloatingText(obj.el, "+" + gained, "#ff7a7a");
      }
    }

    // buff items trigger
    if (meta.buff) {
      applyBuff(meta.buff);
    }

    // remove
    removeObject(obj);
    updateUI();

    // check boss spawn threshold crossing
    checkBossSpawn();
  }

  function loseLife(amount) {
    state.lives = Math.max(0, state.lives - amount);
    updateUI();
    createFloatingText(DOM.area, "-" + amount + " ❤️", "red");
    screenShake(8, 200);
    comboReset();
    if (state.lives <= 0) {
      endGame();
    }
  }

  /* -------------------------
     COMBO LOGIC
  ------------------------- */
  function incrementCombo() {
    state.combo++;
    state.lastComboTick = nowMs();
    clearTimeout(state.comboTimer);
    state.comboTimer = setTimeout(comboReset, CFG.comboTimeoutMs);

    // handle frenzy
    if (!state.frenzy && state.combo >= CFG.frenzyThreshold) {
      enterFrenzy();
    }

    // optionally show combo UI
    renderComboUI();
  }

  function comboReset() {
    state.combo = 0;
    state.frenzy = false;
    removeFrenzyVisual();
    renderComboUI();
  }

  function renderComboUI() {
    // ensure combo bar exists
    let cb = DOM.area.querySelector(".combo-bar");
    if (!cb) {
      cb = document.createElement("div");
      cb.className = "combo-bar";
      cb.style.position = "absolute";
      cb.style.top = "8px";
      cb.style.left = "50%";
      cb.style.transform = "translateX(-50%)";
      cb.style.zIndex = 120;
      cb.style.padding = "6px 12px";
      cb.style.borderRadius = "12px";
      cb.style.background = "rgba(0,0,0,0.55)";
      cb.style.color = "var(--gold, #d3a34a)";
      cb.style.fontWeight = "800";
      DOM.area.appendChild(cb);
    }
    if (state.combo <= 0) {
      cb.style.display = "none";
    } else {
      cb.style.display = "block";
      cb.textContent = `COMBO ×${1 + Math.floor(state.combo / 5)}  (${state.combo})`;
      if (state.frenzy) cb.textContent = `FRENZY ×${1 + Math.floor(state.combo / 5)}  (${state.combo})`;
    }
  }

  function enterFrenzy() {
    state.frenzy = true;
    // visual
    DOM.area.classList.add("frenzy");
    // temporary visual pulse
    DOM.area.style.transition = "filter 200ms";
    DOM.area.style.filter = "saturate(1.25) brightness(1.06)";
    setTimeout(() => {
      // keep effect minimal; will be removed on comboReset
    }, 800);
  }

  function removeFrenzyVisual() {
    DOM.area.classList.remove("frenzy");
    DOM.area.style.filter = "";
  }

  /* -------------------------
     BUFF MANAGER
  ------------------------- */
  function applyBuff(name) {
    const id = uid("buff_");
    const buff = {
      id,
      name,
      start: nowMs(),
      end: nowMs() + (name === "POWER" ? 5000 : name === "SLOW" ? 3000 : name === "MAGNET" ? 5000 : 3000),
      meta: {}
    };
    state.buffs.push(buff);
    // buff start effect
    if (name === "SLOW") {
      state.speed = Math.max(0.6, state.baseSpeed * 0.5);
    } else if (name === "POWER") {
      // power doubles points handled elsewhere
    } else if (name === "MAGNET") {
      // magnet auto-collect in update loop
    } else if (name === "FREEZE") {
      // freeze: temporarily pause movement
      // We'll implement by setting a freeze flag on state (freeze until buff end)
      state._frozen = true;
    } else if (name === "SHIELD") {
      state._shield = true;
    } else if (name === "LIGHTNING") {
      // clears negative objects
      clearNegativeObjects();
    }
    renderBuffHUD();
  }

  function clearNegativeObjects() {
    // remove snake, bomb, blackBomb, killer
    const toRemove = state.objects.filter(o => ["snake", "bomb", "blackBomb", "killer"].includes(o.type));
    toRemove.forEach(removeObject);
    pulseArea(240);
    createFloatingText(DOM.area, "⚡ Negatives removed", "#bfefff");
  }

  function hasBuff(name) {
    return state.buffs.some(b => b.name === name && b.end > nowMs());
  }

  function renderBuffHUD() {
    // ensure buffHud is in area and centered (DOM.buffHud)
    if (!DOM.buffHud) return;
    // filter expired
    const now = nowMs();
    state.buffs = state.buffs.filter(b => b.end > now);
    if (state.buffs.length === 0) {
      DOM.buffHud.classList.add("hidden");
      DOM.buffHud.textContent = "";
      // clear freeze/shield flags
      state._frozen = false;
      state._shield = false;
      state.speed = state.baseSpeed;
      return;
    }
    DOM.buffHud.classList.remove("hidden");
    // build text with timers
    const parts = state.buffs.map(b => {
      const sec = Math.max(0, ((b.end - now) / 1000)).toFixed(1);
      return `${b.name} (${sec}s)`;
    });
    DOM.buffHud.textContent = parts.join("  |  ");
    // schedule next update via rAF so HUD shows ticking timers smoothly
    requestAnimationFrame(renderBuffHUD);
  }

  /* -------------------------
     DIFFICULTY & WAVES
  ------------------------- */
  function scheduleWave() {
    // called occasionally to produce waves randomly
    const r = Math.random();
    if (r < 0.15) spawnWave("danger");
    else if (r < 0.28) spawnWave("bonus");
    else if (r < 0.35) spawnWave("chaos");
    // else normal continues
  }

  function spawnWave(kind) {
    const count = CFG.waveBurstCount;
    for (let i = 0; i < count; i++) {
      setTimeout(() => spawnObject(kind === "danger" ? "danger" : kind === "bonus" ? "bonus" : null), i * CFG.waveBurstInterval);
    }
  }

  /* -------------------------
     BOSS SYSTEM
  ------------------------- */
  function checkBossSpawn() {
    // spawn when crossing threshold
    if (state.score >= state.nextBossScore && !state.bossActive) {
      state.nextBossScore += CFG.bossBaseThreshold;
      spawnBoss();
    }
  }

  function spawnBoss() {
    state.bossActive = true;
    const hp = Math.max(4, Math.round(CFG.bossHPBase + (state.difficultyLevel - 1) * 1.3));
    state.boss = {
      hp: hp,
      maxHp: hp,
      id: uid("boss_"),
      el: null
    };

    // create boss DOM element
    const bossEl = document.createElement("div");
    bossEl.className = "object boss";
    bossEl.textContent = "🐲";
    bossEl.style.position = "absolute";
    bossEl.style.left = Math.max(40, (DOM.area.clientWidth / 2 - 60)) + "px";
    bossEl.style.top = "-20px";
    bossEl.style.fontSize = "84px";
    DOM.area.appendChild(bossEl);
    state.boss.el = bossEl;

    // boss HP bar
    const hpBar = document.createElement("div");
    hpBar.className = "boss-hp";
    hpBar.style.position = "absolute";
    hpBar.style.top = "8px";
    hpBar.style.left = "50%";
    hpBar.style.transform = "translateX(-50%)";
    hpBar.style.zIndex = 200;
    hpBar.style.background = "rgba(0,0,0,0.7)";
    hpBar.style.padding = "6px 12px";
    hpBar.style.borderRadius = "10px";
    hpBar.style.border = "1px solid var(--gold, #d3a34a)";
    hpBar.style.color = "var(--gold, #d3a34a)";
    hpBar.textContent = `BOSS ${state.boss.hp}/${state.boss.maxHp}`;
    DOM.area.appendChild(hpBar);
    state.boss.hpBar = hpBar;

    // boss hit handler
    bossEl.addEventListener("click", () => {
      if (!state.bossActive) return;
      // on hit: reduce hp, feedback
      state.boss.hp -= 1;
      createFloatingText(bossEl, "-1", "#ffb3b3");
      bossEl.style.transform = "scale(0.96)";
      setTimeout(() => bossEl.style.transform = "", 160);
      state.boss.hpBar.textContent = `BOSS ${state.boss.hp}/${state.boss.maxHp}`;
      if (state.boss.hp <= 0) {
        onBossDefeated(bossEl);
      }
    });

    // boss falls slowly downward whilst active; move via small animation loop
    // note: when active, normal spawn continues but limited
    let bossY = -20;
    const bossMoveInterval = setInterval(() => {
      if (!state.bossActive) { clearInterval(bossMoveInterval); return; }
      bossY += Math.max(0.6, state.baseSpeed * 0.3);
      bossEl.style.top = bossY + "px";
      // if boss reaches bottom -> penalty
      if (bossY > DOM.area.clientHeight - 120) {
        // boss escapes - heavy penalty
        loseLife(3);
        // remove boss
        removeBoss();
        clearInterval(bossMoveInterval);
      }
    }, 40);

    // slight visual cue
    pulseArea(320);
  }

  function onBossDefeated(bossEl) {
    // reward and cleanup
    state.score += CFG.bossReward;
    createFloatingText(bossEl, `+${CFG.bossReward}`, "#ffd166");
    // remove boss DOMs
    try { state.boss.el.remove(); } catch (e) { }
    try { state.boss.hpBar.remove(); } catch (e) { }
    state.boss = null;
    state.bossActive = false;
    // escalate difficulty slightly after boss
    state.baseSpeed += 0.3;
    state.speed = state.baseSpeed;
    state.spawnRate = Math.max(300, state.spawnRate - 30);
    updateUI();
    pulseArea(380);
  }

  function removeBoss() {
    if (state.boss && state.boss.el) try { state.boss.el.remove(); } catch (e) { }
    if (state.boss && state.boss.hpBar) try { state.boss.hpBar.remove(); } catch (e) { }
    state.boss = null;
    state.bossActive = false;
  }

  /* -------------------------
     UPDATE LOOP (rAF)
  ------------------------- */
  let lastTick = 0;
  function mainLoop(ts) {
    if (!state.running) return;
    if (!lastTick) lastTick = ts;
    const dt = ts - lastTick;
    lastTick = ts;

    // periodic gameTime is incremented by separate timer, but we can also update visual things here
    // move objects (skip movement if frozen)
    const frozen = state._frozen === true;
    // update each object position according to state.speed (normalized to dt)
    for (let i = state.objects.length - 1; i >= 0; i--) {
      const obj = state.objects[i];
      if (!obj.el) {
        state.objects.splice(i, 1);
        continue;
      }
      if (!frozen) {
        obj.y += obj.vy * (dt / CFG.tickMs);
        obj.el.style.top = obj.y + "px";
      }

      // magnet auto-collect: if active and object is positive, automatically collect when within certain y
      if (hasBuff("MAGNET") && obj.meta && obj.meta.good && obj.y > (DOM.area.clientHeight * 0.35)) {
        handleHit(obj); // handleHit will remove object
        continue;
      }

      if (obj.y > DOM.area.clientHeight + 30) {
        // object reached bottom: consequences
        // if object is positive and not collected -> may penalize combo or health
        if (obj.meta && obj.meta.good) {
          // for redmouse if missed -> penalty
          if (obj.type === "redmouse") {
            loseLife(2);
          } else {
            // missing positive resets combo slightly
            comboReset();
          }
        } else {
          // negative objects simply disappear or if killer fell -> heavy penalty
          if (obj.type === "killer") loseLife(5);
        }
        removeObject(obj);
      }
    }

    // buff housekeeping happens in renderBuffHUD, keep there

    // occasionally schedule a wave (based on gameTime and randomness)
    if (Math.random() < 0.01 + (state.difficultyLevel * 0.002)) {
      scheduleWave();
    }

    // update UI
    updateUI();

    // request next frame
    requestAnimationFrame(mainLoop);
  }

  /* -------------------------
     START / PAUSE / RESTART / END
  ------------------------- */
  let rAFHandle = null;
  function start() {
    if (state.running) return;
    // initialize state
    state.running = true;
    state.score = 0;
    state.lives = 3;
    state.baseSpeed = CFG.baseSpeed;
    state.speed = state.baseSpeed;
    state.spawnRate = CFG.spawnRateInit;
    state.difficultyLevel = 1;
    state.combo = 0;
    state.frenzy = false;
    state.objects = [];
    state.buffs = [];
    state.bossActive = false;
    state.boss = null;
    state.nextBossScore = CFG.bossBaseThreshold;
    state.gameTimeSec = 0;
    state._frozen = false;
    state._shield = false;

    // clear DOM area
    DOM.area.querySelectorAll(".object,.floating-text,.boss-hp,.combo-bar").forEach(e => e.remove());
    DOM.gameOver?.classList.add("hidden");

    // start spawn timer using interval but engine will adapt spawnRate
    if (typeof gameInterval !== "undefined") {
      clearInterval(gameInterval);
    }
    gameInterval = setInterval(spawnEngine, state.spawnRate);

    // start gameTime counter
    if (typeof window.__tlap_time_interval !== "undefined") clearInterval(window.__tlap_time_interval);
    window.__tlap_time_interval = setInterval(() => { state.gameTimeSec++; }, 1000);

    // start rAF loop
    lastTick = 0;
    rAFHandle = requestAnimationFrame(mainLoop);
    updateUI();
    renderBuffHUD();
    renderComboUI();
  }

  function spawnEngine() {

  if (!Game._state.running) return;

  // základní spawn
  spawnObject();

  // postupné zrychlování
  if (Game._state.score > 0 && Game._state.score % CFG.difficultyScoreStep === 0) {

    Game._state.difficultyLevel++;
    Game._state.baseSpeed += CFG.difficultySpeedIncrease;
    Game._state.speed = Game._state.baseSpeed;

    Game._state.spawnRate = Math.max(
      280,
      Game._state.spawnRate - CFG.difficultySpawnDecrease
    );

    clearInterval(gameInterval);
    gameInterval = setInterval(spawnEngine, Game._state.spawnRate);
  }

  // boss kontrola
  if (Game._state.score >= Game._state.nextBossScore) {
    Game._state.nextBossScore += CFG.bossBaseThreshold;
    spawnBoss();
  }
}
  function pause() {
    state.running = !state.running;
    if (state.running) {
      lastTick = 0;
      rAFHandle = requestAnimationFrame(mainLoop);
      if (typeof gameInterval !== "undefined") {
        clearInterval(gameInterval);
        gameInterval = setInterval(spawnEngine, state.spawnRate);
      }
    } else {
      if (rAFHandle) cancelAnimationFrame(rAFHandle);
      if (typeof gameInterval !== "undefined") clearInterval(gameInterval);
    }
  }

  function restart() {
    end(); // clean
    start();
  }

  function end() {
    state.running = false;
    if (typeof gameInterval !== "undefined") clearInterval(gameInterval);
    if (typeof window.__tlap_time_interval !== "undefined") clearInterval(window.__tlap_time_interval);
    removeBoss();
    // show game over panel
    if (DOM.finalScore) DOM.finalScore.textContent = state.score;
    if (DOM.gameOver) DOM.gameOver.classList.remove("hidden");
  }

  /* -------------------------
     UI UPDATES (score, lives)
  ------------------------- */
  function updateUI() {
    if (DOM.score) DOM.score.textContent = state.score;
    if (DOM.lives) DOM.lives.textContent = state.lives;
    // update difficulty visual (optional)
    // update boss hp bar text if active (handled in boss)
  }

  /* -------------------------
     CHECKS & HELPERS
  ------------------------- */
  function checkBossSpawn() { checkBossSpawn; } // placeholder if wanted elsewhere

  /* -------------------------
     PUBLIC API
  ------------------------- */
  return {
    start: start,
    pause: pause,
    restart: restart,
    end: end,
    // simulation / debug helpers
    _state: state,
    _spawnObject: spawnObject
  };
})();

/* ===============================
   Auto-bind default start button
   If your HTML uses onclick="startGame()", keep it,
   otherwise this assigns to window for console control.
================================ */
window.startGame = function () { Game.start(); };
window.pauseGame = function () { Game.pause(); };
window.restartGame = function () { Game.restart(); };
window.endGame = function () { Game.end(); };
