/* =================================================================================
   Cat Clicker — PRO verze
   Rozsáhlý, dobře strukturovaný a rozšiřitelný engine inspirovaný Cookie Clicker.
   Funkce:
   - klikání + vizuální efekty
   - mnoho automatických jednotek (autoclickers) + upgradů
   - achievementy
   - prestige / reset s bonusem
   - offline progress
   - export/import uložené hry
   - autosave + manual save
   - základní economy (ceny exponenciální)
   - drobné náhodné eventy (golden fish)
   - čistá separace dat / UI / logiky
   ---------------------------------------------------------------------------------
   Předpoklady HTML (ID / struktura):
   - #score (kde se zobrazí počet prack)
   - #persec (CPS text)
   - #cat-btn (hlavní klikací tlačítko)
   - #click-anim (kontejner pro animace + popy)
   - #upgrades (kontejner pro seznam upgradů)
   - #autoclickers (kontejner pro autopoložky)
   - #prestige-points (zobrazení prestižních bodů)
   - #btn-prestige (tlačítko prestiž)
   - #btn-reset (reset tlačítko)
   - #btn-export (export)
   - #dlg-save (dialog) a #txt-save (textarea)
   ================================================================================= */

(() => {
  'use strict';

  /*** ========== KONFIG ========== ***/
  const SAVE_KEY = 'catclicker_pro_save_v1';
  const TICK_MS = 1000;                  // hlavní tick každou sekundu
  const AUTOSAVE_MS = 5000;             // autosave co 5s
  const VERSION = '1.0.0-pro';
  const OFFLINE_CAP_SECONDS = 60 * 60 * 24 * 7; // max 7 dní offline progress
  const RNG = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;

  /*** ========== HELPER FUNKCE ========== ***/
  const $ = sel => document.querySelector(sel);
  const $all = sel => Array.from(document.querySelectorAll(sel));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  // Formátování čísel: stovky -> plné, vyšší -> s k, M, B...
  function fmt(n){
  if(n < 1000) return Math.floor(n).toLocaleString();
  const units = [
  {v:1e12,s:"T"},
  {v:1e9,s:"B"},
  {v:1e6,s:"M"},
  {v:1e3,s:"k"}
  ];
  for(const u of units){
  if(n >= u.v){
  return (n/u.v).toFixed(2).replace(/\.00$/,"") + u.s;
  }
  }
  return n.toLocaleString();
  }

  // přesnější formát pro UI (např. 0.5 /s)
  function fmtFloat(n, decimals = 2) {
    if (Math.abs(n) < 1) return Number(n.toFixed(decimals)).toString();
    if (n >= 1000) return fmt(n);
    return Number(n.toFixed(decimals)).toLocaleString();
  }

  // bezpečný přístup do objektu
  const safeGet = (obj, path, fallback = undefined) => {
    return path.split('.').reduce((o, k) => (o && o[k] !== undefined) ? o[k] : fallback, obj);
  };

  /*** ========== DEFINICE HERNÍCH ENTIT ========== ***/
  // Autoclickers: id, name, baseCost, costMult, cps (per unit), description
  const AUTOCLICKER_DEFS = [

  { id:'paw-helper', name:'Tlapky', baseCost:25, costMult:1.5, cps:0.5, unlock:0, desc:'+0.5 pracky / s' },
  { id:'fisher', name:'Rybář', baseCost:500, costMult:1.6, cps:8, unlock:200, desc:'+8 pracek / s' },
  { id:'breeder', name:'Množitel', baseCost:8000, costMult:1.7, cps:120, unlock:3000, desc:'+120 pracek / s' },
  { id:'factory', name:'Továrna', baseCost:150000, costMult:1.75, cps:2000, unlock:10000, desc:'+2000 pr/s' },
  { id:'lab', name:'Laboratoř', baseCost:5000000, costMult:1.8, cps:50000, unlock:200000, desc:'+50k pr/s' },
  { id:'portal', name:'Kočičí portál', baseCost:200000000, costMult:1.9, cps:2000000, unlock:2000000, desc:'+2M pr/s' },
  { id:'planet', name:'Kočičí planeta', baseCost:10000000000, costMult:2.0, cps:80000000, unlock:500000000, desc:'+80M pr/s' },
  { id:'galaxy', name:'Kočičí galaxie', baseCost:500000000000, costMult:2.1, cps:3000000000, unlock:5000000000, desc:'+3B pr/s' }

  ];

  // Upgrady: id, name, baseCost, costMult, type, value, maxLevel (0 = neomezeno), descriptionFn
  // type: 'click' => zvyšuje clickPower, 'cps' => multiplikátor CPS, 'global' => obecný efekt
  const UPGRADE_DEFS = [
    { id:'click1', name:'Silnější tlapky', baseCost:10, costMult:1.6, type:'click', value:1, desc:'+1 pracka za klik' },
    { id:'click2', name:'Kočičí krmivo', baseCost:120, costMult:1.7, type:'click', value:5, desc:'+5 pracek za klik' },
    { id:'click3', name:'Trénink koček', baseCost:2000, costMult:1.7, type:'click', value:25, desc:'+25 pracek za klik' },
    { id:'cps1', name:'Lepší nástroje', baseCost:2000, costMult:1.6, type:'cps', value:0.10, desc:'+10% produkce' },
    { id:'cps2', name:'Průmyslové tlapky', baseCost:20000, costMult:1.7, type:'cps', value:0.25, desc:'+25% produkce' },
    { id:'cps3', name:'Mega továrny', baseCost:200000, costMult:1.8, type:'cps', value:0.50, desc:'+50% produkce' }
  ];

  // Achievements: id, name, desc, condition(state) => boolean, reward: { type:'paws'|'prestige'|'unlock', value }
  const ACHIEVEMENT_DEFS = [
    { id: 'first-click', name: 'První klik', desc: 'Proveď první klik.', condition: s => s.total >= 1, reward: { type: 'paws', value: 10 } },
    { id: 'century', name: 'Stovka prack', desc: 'Nasbírej 100 prack.', condition: s => s.total >= 100, reward: { type: 'paws', value: 50 } },
    { id: 'helper-horde', name: 'Tým tlapek', desc: 'Měj 50 tlapek (helpers).', condition: s => (s.units && s.units["paw-helper"] >= 50), reward: { type: 'prestige', value: 1 } },
    { id: 'industrial', name: 'Průmyslník', desc: 'Postav 10 továren.', condition: s => s.units && s.units.factory >= 10, reward: { type: 'paws', value: 5000 } },
    // dodat další achievementy dle potřeby
  ];

  /*** ========== POČÁTEČNÍ STAV HRY ========== ***/
  function defaultState() {
    // struktura setkatelná s novými verzemi
    return {
      version: VERSION,
      paws: 0,               // aktuální pracky
      total: 0,              // celkové nasbírané pracky (ne resetované)
      clickPower: 1,         // základní pracky za klik
      // složené upgrady (vyplněné při načtení)
      upgrades: {},          // {id: level}
      units: {},             // {autoclickerId: count}
      cpsMultiplier: 1,      // všeobecný multiplikátor CPS z upgradů/prestige
      prestigePoints: 0,     // prestižní body
      achievements: {},      // {achievementId: boolean}
      lastTick: Date.now(),  // timestamp pro offline výpočet
      createdAt: Date.now(),
      playStart: Date.now(),
      stats: { clicks: 0, ticks: 0 },
    };
  }

  // herní objekt
  const G = {
    state: defaultState(),
    running: false,
    tickHandle: null,
    autosaveHandle: null,
    ui: {},
  };

  /*** ========== SAVE / LOAD / EXPORT / IMPORT ========== ***/
  function saveGame() {
    try {
      G.state.lastTick = Date.now();
      localStorage.setItem(SAVE_KEY, JSON.stringify(G.state));
      flashSaveIndicator(true);
    } catch (e) {
      console.error('Save failed', e);
      flashSaveIndicator(false);
    }
  }

  function loadGame() {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) {
      G.state = defaultState();
      return;
    }
    try {
      const parsed = JSON.parse(raw);
      // merge with default to ensure fields present
      const base = defaultState();
      // shallow merge
      G.state = Object.assign(base, parsed);
      // backfill missing nested objects
      G.state.upgrades = Object.assign(base.upgrades, parsed.upgrades || {});
      G.state.units = Object.assign(base.units, parsed.units || {});
      G.state.achievements = Object.assign(base.achievements, parsed.achievements || {});
      // apply compatibility adjustments if needed (version migrations could go here)
      applyDerivedState();
      // offline progress
      handleOfflineProgress(parsed.lastTick || parsed.createdAt || G.state.lastTick);
    } catch (e) {
      console.error('Load failed', e);
      G.state = defaultState();
    }
  }

  function exportSave() {
    const txt = JSON.stringify(G.state);
    if ($('#dlg-save') && $('#txt-save')) {
      $('#txt-save').value = txt;
      $('#dlg-save').showModal?.();
    } else {
      // fallback: copy to clipboard
      navigator.clipboard?.writeText(txt).then(() => alert('Export zkopírován do schránky.'), () => alert('Export: zkopírujte ručně:\n' + txt));
    }
  }

  function importSave(txt) {
    try {
      const parsed = JSON.parse(txt);
      if (!parsed || typeof parsed !== 'object') throw new Error('Neplatný formát');
      // validate minimal fields
      if (typeof parsed.paws !== 'number') throw new Error('Neplatný formát: chybí paws');
      // replace state
      G.state = Object.assign(defaultState(), parsed);
      applyDerivedState();
      saveGame();
      renderAll();
      alert('Import dokončen.');
    } catch (e) {
      alert('Import selhal: ' + e.message);
    }
  }

  function handleOfflineProgress(prevTimestamp) {
    const then = prevTimestamp || G.state.lastTick || G.state.createdAt;
    const now = Date.now();
    const sec = Math.floor((now - then) / 1000);
    if (sec <= 0) return;
    const capped = Math.min(sec, OFFLINE_CAP_SECONDS);
    const cps = calculateCPS();
    const gain = cps * capped;
    if (gain > 0) {
      G.state.paws += gain;
      G.state.total += gain;
      // optional: display a small toast about offline progress
      spawnFloatingText('+' + fmt(Math.floor(gain)) + ' offline', { x: 0.5, y: 0.2 }, { color: 'var(--accent)' });
    }
  }

  /*** ========== HERNÍ EKONOMIE ========== ***/
  function getUnitCount(id) {
    return G.state.units[id] || 0;
  }

  function incUnit(id, n = 1){
  if(!G.state.units[id]){
  G.state.units[id] = 0;
  }
  G.state.units[id] += n;
  }

  function getUpgradeLevel(id) {
    return G.state.upgrades[id] || 0;
  }

  function incUpgrade(id, n = 1) {
    G.state.upgrades[id] = (G.state.upgrades[id] || 0) + n;
  }

  function calcCost(base, mult, level) {
    // základní exponenciální: base * mult^level, ale zjemníme pro velká čísla
    return Math.floor(base * Math.pow(mult, level));
  }
  function calculateCPS(){
    let cps = 0;
    for(const def of AUTOCLICKER_DEFS){
    const count = G.state.units[def.id] || 0;
    if(count > 0){
    cps += count * def.cps;
    }
    }
    // prestige multiplier
    cps *= (1 + (G.state.prestigePoints * 0.02));
    // global multiplier
    cps *= (G.state.cpsMultiplier || 1);
    return cps;
  }
  function getNextUnitCost(def) {
    const level = getUnitCount(def.id);
    return calcCost(def.baseCost, def.costMult, level);
  }

  function getNextUpgradeCost(def) {
    const lvl = getUpgradeLevel(def.id);
    return calcCost(def.baseCost, def.costMult, lvl);
  }

  /*** ========== UI: tvorba elementů a render ========== ***/
  function createUnitElement(def) {
    const item = document.createElement('div');
    item.className = 'item';
    item.dataset.id = def.id;

    const meta = document.createElement('div');
    meta.className = 'meta';

    const name = document.createElement('div');
    name.className = 'name';
    name.textContent = def.name;

    const desc = document.createElement('div');
    desc.className = 'desc';
    desc.textContent = def.desc;

    meta.appendChild(name);
    meta.appendChild(desc);

    const right = document.createElement('div');
    right.style.textAlign = 'right';

    const status = document.createElement('div');
    status.className = 'status';
    status.style.marginBottom = '6px';
    status.textContent = `${getUnitCount(def.id)} • ${fmt(getNextUnitCost(def))} prack`;

    const btn = document.createElement('button');
    btn.className = 'btn-gold';
    btn.textContent = 'Koupit';
    btn.addEventListener('click', () => buyUnit(def.id));

    right.appendChild(status);
    right.appendChild(btn);

    item.appendChild(meta);
    item.appendChild(right);

    return item;
  }

  function createUpgradeElement(def) {
    const item = document.createElement('div');
    item.className = 'item';
    item.dataset.id = def.id;

    const meta = document.createElement('div');
    meta.className = 'meta';

    const name = document.createElement('div');
    name.className = 'name';
    name.textContent = def.name;

    const desc = document.createElement('div');
    desc.className = 'desc';
    desc.textContent = def.desc;

    meta.appendChild(name);
    meta.appendChild(desc);

    const right = document.createElement('div');
    right.style.textAlign = 'right';

    const status = document.createElement('div');
    status.className = 'status';
    status.style.marginBottom = '6px';
    status.textContent = `lvl ${getUpgradeLevel(def.id)} • ${fmt(getNextUpgradeCost(def))} prack`;

    const btn = document.createElement('button');
    btn.className = 'btn-gold';
    btn.textContent = 'Koupit';
    btn.addEventListener('click', () => buyUpgrade(def.id));

    right.appendChild(status);
    right.appendChild(btn);

    item.appendChild(meta);
    item.appendChild(right);

    return item;
  }

  function renderUnitsList(){
    const container = $("#autoclickers");
    container.innerHTML="";
    for(const def of AUTOCLICKER_DEFS){
    if(G.state.total < def.unlock) continue;
    container.appendChild(createUnitElement(def));
    } 
  }

  function renderUpgradesList() {
    const container = $('#upgrades');
    if (!container) return;
    container.innerHTML = '';
    for (const def of UPGRADE_DEFS) {
      container.appendChild(createUpgradeElement(def));
    }
  }

  function renderAchievements() {
    // optional: render list somewhere (not required if no UI)
    // we'll just ensure achievement state exists
    for (const a of ACHIEVEMENT_DEFS) {
      if (!(a.id in G.state.achievements)) G.state.achievements[a.id] = false;
    }
  }

  function renderHeader() {
    const scoreEl = $('#score');
    if (scoreEl) {
      scoreEl.innerHTML = `<span class="score-number">${fmt(Math.floor(G.state.paws))}</span> <span class="label">pracky</span>`;
    }
    const persecEl = $('#persec');
    if (persecEl) {
      persecEl.textContent = `${fmtFloat(calculateCPS(), 2)} /s`;
    }
    const prestigePoints = $('#prestige-points');
    if (prestigePoints) {
      prestigePoints.textContent = fmt(G.state.prestigePoints);
    }
  }

  // update jednotlivých statusů (ceny/počty) v listech (po nákupu)
  function updateListsUI() {
    // units
    for (const def of AUTOCLICKER_DEFS) {
      const el = document.querySelector(`[data-id="${def.id}"]`);
      if (!el) continue;
      const status = el.querySelector('.status');
      if (status) {
        status.textContent = `${getUnitCount(def.id)} • ${fmt(getNextUnitCost(def))} prack`;
      }
    }
    // upgrades
    for (const def of UPGRADE_DEFS) {
      const el = document.querySelector(`[data-id="${def.id}"]`);
      if (!el) continue;
      const status = el.querySelector('.status');
      if (status) {
        status.textContent = `lvl ${getUpgradeLevel(def.id)} • ${fmt(getNextUpgradeCost(def))} prack`;
      }
    }
  }

  function renderAll() {
    renderHeader();
    updateListsUI();
  }

function spawnGoldenPaw(){
  const root = document.querySelector(".game-root");
  const paw = document.createElement("div");

  paw.textContent = "🐾";
  paw.style.position = "absolute";
  paw.style.fontSize = "32px";
  paw.style.left = (20 + Math.random()*60) + "%";
  paw.style.top = (30 + Math.random()*40) + "%";
  paw.style.cursor = "pointer";
  paw.style.zIndex = 1000;

  root.appendChild(paw);

  const reward = calculateCPS() * 60 + 100;

  paw.onclick = ()=>{

  G.state.paws += reward;
  G.state.total += reward;

  spawnFloatingText("+"+fmt(reward));

  paw.remove();
  renderAll();

  };

  setTimeout(()=>{
  paw.remove();
  },8000);

  }
  /*** ========== NÁKUPY / AKCE ========== ***/
  function canAfford(cost) {
    return G.state.paws >= cost;
  }

  function buyUnit(id) {
    const def = AUTOCLICKER_DEFS.find(d => d.id === id);
    if (!def) return;
    const cost = getNextUnitCost(def);
    if (!canAfford(cost)) {
      flashBuyFail(id);
      return;
    }
    G.state.paws -= cost;
    incUnit(id, 1);
    // small visual feedback
    spawnFloatingText('-' + fmt(cost), null, { color: '#f2b84f' });
    updateListsUI();
    applyDerivedState();
    renderHeader();
    checkAchievements();
  }

  function buyUpgrade(id) {
    const def = UPGRADE_DEFS.find(d => d.id === id);
    if (!def) return;
    const cost = getNextUpgradeCost(def);
    if (!canAfford(cost)) {
      flashBuyFail(id);
      return;
    }
    if (def.maxLevel && getUpgradeLevel(id) >= def.maxLevel) {
      // already maxed
      toast('Tento upgrade je již na max. úrovni.');
      return;
    }
    G.state.paws -= cost;
    incUpgrade(id, 1);
    // pokud upgrade přidává clickPower
    // apply derived adjustments if needed
    applyDerivedState();
    updateListsUI();
    renderHeader();
    toast(`Koupil jsi: ${def.name}`);
    checkAchievements();
  }

  /*** ========== PRESTIGE (reinkarnace) ========== ***/
  function prestigeAvailable() {
    // jednoduchá formule: prestige points = floor(total^(1/4) / 10)
    const pts = Math.floor(Math.pow(G.state.total, 1 / 4) / 10);
    return pts > G.state.prestigePoints;
  }

  function calculatePrestigeReward() {
    const pts = Math.floor(Math.pow(G.state.total, 1 / 4) / 10);
    return Math.max(0, pts - G.state.prestigePoints);
  }

  function performPrestige() {
    const reward = calculatePrestigeReward();
    if (reward <= 0) {
      toast('Nemáš zatím dostatek prack na prestiž.');
      return;
    }
    if (!confirm(`Prestige restartuje pokrok výměnou za ${reward} prestižních bodů. Pokračovat?`)) return;
    // award points
    G.state.prestigePoints += reward;
    // store prestige points, but reset most progress
    const preserved = {
      version: VERSION,
      prestigePoints: G.state.prestigePoints,
      createdAt: Date.now(),
      playStart: Date.now(),
      stats: { clicks: 0, ticks: 0 }
    };
    G.state = Object.assign(defaultState(), preserved);
    applyDerivedState();
    saveGame();
    renderUnitsList();
    renderUpgradesList();
    renderAll();
    toast(`Získal jsi ${reward} prestižních bodů!`);
  }

  /*** ========== ACHIEVEMENTS ========== ***/
  function checkAchievements() {
    for (const a of ACHIEVEMENT_DEFS) {
      if (!G.state.achievements[a.id] && a.condition(G.state)) {
        G.state.achievements[a.id] = true;
        // give reward
        if (a.reward) {
          if (a.reward.type === 'paws') {
            G.state.paws += a.reward.value;
            G.state.total += a.reward.value;
            spawnFloatingText('+' + a.reward.value + ' pracky', null, { color: 'var(--accent)' });
          } else if (a.reward.type === 'prestige') {
            G.state.prestigePoints += a.reward.value;
            spawnFloatingText('+' + a.reward.value + ' prestige', null, { color: 'var(--accent)' });
          } // else unlocks / other rewards...
        }
        // visual notification
        toast(`Achievement: ${a.name} — ${a.desc}`);
        saveGame();
      }
    }
  }

  /*** ========== VIZUÁLNÍ EFEKTY (floating text, particles) ========== ***/
  function spawnFloatingText(text, normalizedPos = null, opts = {}) {
    // normalizedPos: {x: 0..1, y: 0..1} relative to .game-root; if null, center above button
    const container = $('#click-anim') || document.body;
    const el = document.createElement('div');
    el.className = 'click-pop pop-gold';
    el.textContent = text;
    el.style.position = 'absolute';
    el.style.left = '50%';
    el.style.transform = 'translateX(-50%)';
    el.style.top = '-40px';
    el.style.pointerEvents = 'none';
    if (opts.color) el.style.color = opts.color;
    container.appendChild(el);
    // animate
    requestAnimationFrame(() => {
      el.style.transition = 'transform 900ms cubic-bezier(.2,.9,.2,1), opacity 900ms';
      el.style.transform = 'translate(-50%,-140px) scale(1)';
      el.style.opacity = '0';
    });
    setTimeout(() => { el.remove(); }, 1000);
    return el;
  }

  // Hlavní click animation: +X číslo u tlačítka
  function showClickAnimation(val) {
    const container = $('#click-anim') || document.body;
    const el = document.createElement('div');
    el.className = 'click-number click-pop';
    el.textContent = '+' + fmt(val);
    el.style.position = 'absolute';
    el.style.left = '50%';
    el.style.transform = 'translateX(-50%)';
    el.style.top = '-30px';
    el.style.pointerEvents = 'none';
    container.appendChild(el);
    requestAnimationFrame(() => {
      el.style.transition = 'transform 700ms ease, opacity 700ms';
      el.style.transform = 'translate(-50%,-120px)';
      el.style.opacity = '0';
    });
    setTimeout(() => { el.remove(); }, 800);
  }

  // Flash purchase fail (shake item)
  function flashBuyFail(itemId) {
    const el = document.querySelector(`[data-id="${itemId}"]`);
    if (!el) return;
    el.animate([
      { transform: 'translateX(0)' },
      { transform: 'translateX(-6px)' },
      { transform: 'translateX(6px)' },
      { transform: 'translateX(0)' }
    ], { duration: 300, easing: 'ease-out' });
  }

  function toast(msg, timeout = 2600) {
    // Simple toast at bottom-right of game-root
    let root = $('.game-root');
    if (!root) {
      alert(msg);
      return;
    }
    const t = document.createElement('div');
    t.className = 'cat-toast';
    t.textContent = msg;
    t.style.position = 'absolute';
    t.style.right = '18px';
    t.style.bottom = '18px';
    t.style.padding = '10px 14px';
    t.style.background = 'rgba(0,0,0,0.6)';
    t.style.color = 'var(--text)';
    t.style.borderRadius = '8px';
    t.style.boxShadow = '0 6px 20px rgba(0,0,0,0.6)';
    t.style.zIndex = 9999;
    root.appendChild(t);
    setTimeout(() => {
      t.style.transition = 'opacity 400ms';
      t.style.opacity = '0';
      setTimeout(() => t.remove(), 420);
    }, timeout);
  }

  /*** ========== RANDOM EVENT: GOLDEN FISH (bonus) ========== ***/
  function maybeSpawnGoldenFish() {
    // drobná pravděpodobnost každých 20-40s
    if (Math.random() < 0.08) {
      spawnGoldenFish();
    }
  }

  function spawnGoldenFish() {
    // vytvoří element na náhodné pozici uvnitř .game-root
    const root = $('.game-root') || document.body;
    const fish = document.createElement('div');
    fish.className = 'golden-fish';
    fish.textContent = '🐟';
    fish.style.position = 'absolute';
    fish.style.left = (20 + Math.random() * 60) + '%';
    fish.style.top = (30 + Math.random() * 40) + '%';
    fish.style.fontSize = '30px';
    fish.style.cursor = 'pointer';
    fish.style.zIndex = 999;
    fish.style.transform = 'scale(0.9)';
    fish.style.transition = 'transform .2s';
    root.appendChild(fish);
    fish.addEventListener('mouseenter', () => fish.style.transform = 'scale(1.05)');
    fish.addEventListener('mouseleave', () => fish.style.transform = 'scale(0.95)');
    const lifetime = 8000; // 8s to click
    const reward = RNG(100, 1000) + Math.floor(G.state.prestigePoints * 50);
    const onClick = () => {
      G.state.paws += reward;
      G.state.total += reward;
      spawnFloatingText('+' + fmt(reward), { x: 0.5, y: 0.4 }, { color: 'gold' });
      fish.remove();
      saveGame();
      renderAll();
    };
    fish.addEventListener('click', onClick, { once: true });
    setTimeout(() => { if (fish.parentNode) fish.remove(); }, lifetime);
  }

  /*** ========== DERIVED / HELPERS ========== ***/
  function applyDerivedState(){
  // reset základních hodnot
  G.state.clickPower = 1;
  let mult = 1;
  // přepočet všech upgrade bonusů
  for(const def of UPGRADE_DEFS){
  const lvl = getUpgradeLevel(def.id);
  if(!lvl) continue;
  // klik bonus
  if(def.type === "click"){
  G.state.clickPower += def.value * lvl;
  }
  // CPS bonus
  if(def.type === "cps"){
  mult *= (1 + def.value * lvl);
  }
  }
  // uložit globální multiplikátor
  G.state.cpsMultiplier = mult;
  }

  /*** ========== TICK FUNKCE ========== ***/
  function tick(){
  const cps = calculateCPS();
  if(cps > 0){
  G.state.paws += cps;
  G.state.total += cps;
  }
  const prevTotal = G.state.total;
  G.state.total += cps;
  if(Math.floor(prevTotal/1000) !== Math.floor(G.state.total/1000)){
  renderUnitsList();
  }
  renderAll();
  }

  /*** ========== CONNECT UI a STARTUP ========== ***/
  function bindStaticButtons() {
    // hlavní
    const cat = $('#cat-btn');
    if (cat) {
      cat.addEventListener('click', () => {
        G.state.paws += G.state.clickPower;
        G.state.total += G.state.clickPower;
        G.state.stats.clicks = (G.state.stats.clicks || 0) + 1;
        showClickAnimation(G.state.clickPower);
        // malý zvuk nebo vibrace by sem mohly
        renderAll();
        checkAchievements();
      });
    }

    // reset
    const btnReset = $('#btn-reset');
    if (btnReset) btnReset.addEventListener('click', resetGame);

    // prestige
    const btnPrestige = $('#btn-prestige');
    if (btnPrestige) btnPrestige.addEventListener('click', performPrestige);

    // export/import
    const btnExport = $('#btn-export');
    if (btnExport) btnExport.addEventListener('click', exportSave);
    const dlgClose = $('#dlg-close');
    if (dlgClose) dlgClose.addEventListener('click', () => $('#dlg-save')?.close());
    const dlgImport = $('#dlg-import');
    if (dlgImport) dlgImport.addEventListener('click', () => {
      const txt = $('#txt-save')?.value || '';
      importSave(txt);
      $('#dlg-save')?.close();
    });
  }

  function startGame() {
    // load state
    loadGame();
    // build UI (static lists)
    renderUnitsList();
    renderUpgradesList();
    renderAchievements();
    bindStaticButtons();
    applyDerivedState();
    renderAll();
    // start ticks
    if (!G.tickHandle) G.tickHandle = setInterval(tick, TICK_MS);
    if (!G.autosaveHandle) G.autosaveHandle = setInterval(saveGame, AUTOSAVE_MS);
    G.running = true;
    // small startup golden fish timer
    setInterval(maybeSpawnGoldenFish, 20_000 + Math.floor(Math.random() * 20_000));
    // accessibility: keyboard click (space / enter) when focused on cat
    setInterval(()=>{
    if(Math.random() < 0.15){
    spawnGoldenPaw();
    }
    },20000);
    document.addEventListener('keydown', (e) => {
      if (e.code === 'Space') {
        const target = document.activeElement;
        if (target && (target.id === 'cat-btn' || target.tagName === 'BODY')) {
          e.preventDefault();
          $('#cat-btn')?.click();
        }
      }
    });
  }
  function resetGame(){
  if(confirm("Opravdu resetovat hru?")){
  localStorage.removeItem(SAVE_KEY);
  location.reload();
  }

  }
  /*** ========== UI UTILS ========== ***/
  function flashSaveIndicator(ok) {
    const el = $('#save-indicator');
    if (!el) return;
    el.textContent = ok ? 'Uloženo' : 'Uložit selhalo';
    el.style.opacity = '1';
    setTimeout(() => { el.style.opacity = '0.7'; }, 800);
  }

  /*** ========== INICIALIZACE DOM READY ========== ***/
  document.addEventListener('DOMContentLoaded', () => {
    // if certain HTML elements are missing, create minimal ones to avoid errors
    if (!$('#click-anim')) {
      const root = $('.game-root') || document.body;
      const el = document.createElement('div');
      el.id = 'click-anim';
      el.style.position = 'relative';
      root.appendChild(el);
    }
    // start
    startGame();
  });

  // Expose for debug in console
  window.CatClicker = {
    G,
    saveGame,
    loadGame,
    exportSave,
    importSave,
    performPrestige,
    format: fmt
  };

  // END of module
})();