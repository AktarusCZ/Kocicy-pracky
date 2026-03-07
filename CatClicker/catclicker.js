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
  let upgradeTab = "normal";

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
  {v:1e33,s:"Dc"},
  {v:1e30,s:"No"},
  {v:1e27,s:"Oc"},
  {v:1e24,s:"Sp"},
  {v:1e21,s:"Sx"},
  {v:1e18,s:"Qi"},
  {v:1e15,s:"Qa"},
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

  /* =========================
   BUILDING MULTIPLIERS
   ========================= */

  let buildingBoosts = {};
  const BUILDING_UPGRADES = [

  {
  id:"helper_tools",
  name:"Lepší nástroje",
  target:"paw-helper",
  mult:2,
  cost:2000,
  unlock:1000,
  desc:"Tlapky produkují ×2"
  },

  {
  id:"fishing_boats",
  name:"Rybářské lodě",
  target:"fisher",
  mult:3,
  cost:10000,
  unlock:5000,
  desc:"Rybáři produkují ×3"
  },

  {
  id:"factory_automation",
  name:"Automatizace továren",
  target:"factory",
  mult:4,
  cost:100000,
  unlock:50000,
  desc:"Továrny produkují ×4"
  },

  {
  id:"portal_stability",
  name:"Stabilizace portálů",
  target:"portal",
  mult:5,
  cost:5000000,
  unlock:1000000,
  desc:"Portály produkují ×5"
  }

  ];
  /*** ========== DEFINICE HERNÍCH ENTIT ========== ***/
  // Autoclickers: id, name, baseCost, costMult, cps (per unit), description
  const AUTOCLICKER_DEFS = [

    { id:'paw-helper', name:'Tlapky', baseCost:25, costMult:1.5, cps:1, unlock:0, desc:'+1 pracky / s' },
    { id:'fisher', name:'Rybář', baseCost:500, costMult:1.6, cps:5, unlock:200, desc:'+5 pracek / s' },
    { id:'breeder', name:'Množitel', baseCost:8000, costMult:1.7, cps:120, unlock:3000, desc:'+120 pracek / s' },
    { id:'factory', name:'Továrna', baseCost:150000, costMult:1.75, cps:2000, unlock:10000, desc:'+2000 pr/s' },
    { id:'lab', name:'Laboratoř', baseCost:5000000, costMult:1.8, cps:50000, unlock:200000, desc:'+50k pr/s' },
    { id:'portal', name:'Kočičí portál', baseCost:200000000, costMult:1.9, cps:1000000, unlock:2000000, desc:'+100k pr/s' },
    { id:'planet', name:'Kočičí planeta', baseCost:10000000000, costMult:2.0, cps:250000, unlock:500000000, desc:'+250k pr/s' },
    { id:'galaxy', name:'Kočičí galaxie', baseCost:500000000000, costMult:2.1, cps:500000000, unlock:5000000000, desc:'+500k pr/s' },
    { id:'university', name:'Kočičí univerzita', baseCost:1e12, costMult:2.1, cps:5e9, unlock:1e10, desc:'+2M pr/s' },
    { id:'time_machine', name:'Stroj času', baseCost:1e15, costMult:2.2, cps:15e6, unlock:1e13, desc:'+15M pr/s' },
    { id:'dimension', name:'Kočičí dimenze', baseCost:1e18, costMult:2.3, cps:100e6, unlock:1e16, desc:'+100M pr/s' },
    { id:'blackhole', name:'Kočičí černá díra', baseCost:1e22, costMult:2.4, cps:1e18, unlock:1e20, desc:'+1B pr/s' },
    { id:'multiverse', name:'Kočičí multivesmír', baseCost:1e27, costMult:2.5, cps:50e9, unlock:1e25, desc:'+50B pr/s' }  
  ];

  // Upgrady: id, name, baseCost, costMult, type, value, maxLevel (0 = neomezeno), descriptionFn
  // type: 'click' => zvyšuje clickPower, 'cps' => multiplikátor CPS, 'global' => obecný efekt
    const UPGRADE_DEFS = [

/* EARLY GAME */

  {
  id:"sharp_claws",
  name:"Ostré drápky",
  baseCost:25,
  costMult:2,
  type:"click_flat",
  value:1,
  unlock:0,
  desc:"+1 pracka za klik"
  },

  {
  id:"steel_paws",
  name:"Ocelové tlapky",
  baseCost:200,
  costMult:2.2,
  type:"click_flat",
  value:5,
  unlock:100,
  desc:"+5 pracek za klik"
  },

  {
  id:"cat_gloves",
  name:"Kočičí rukavice",
  baseCost:1500,
  costMult:2.3,
  type:"click_flat",
  value:15,
  unlock:500,
  desc:"+15 pracek za klik"
  },

  /* MID GAME */

  {
  id:"robot_claws",
  name:"Robotické drápy",
  baseCost:5000,
  costMult:2.4,
  type:"click_flat",
  value:20,
  unlock:3000,
  desc:"+20 pracek za klik"
  },

  {
  id:"auto_tools",
  name:"Automatizace",
  baseCost:20000,
  costMult:2.5,
  type:"cps_mult",
  value:1.5,
  unlock:10000,
  desc:"Produkce ×1.5"
  },

  {
  id:"factory_ai",
  name:"AI továrny",
  baseCost:250000,
  costMult:2.6,
  type:"factory_boost",
  target:"factory",
  value:1.2,
  unlock:100000,
  desc:"Továrny ×1.2 výkon"
  },

  /* LATE GAME */

  {
  id:"cat_research",
  name:"Kočičí výzkum",
  baseCost:2000000,
  costMult:2.8,
  type:"global_mult",
  value:1.2,
  unlock:500000,
  desc:"Celá produkce ×1.2"
  },

  {
  id:"quantum_claws",
  name:"Kvantové drápy",
  baseCost:20000000,
  costMult:3,
  type:"click_mult",
  value:1.5,
  unlock:2000000,
  desc:"Klik ×1.5"
  },

  {
  id:"dimensional_factory",
  name:"Dimenzionální továrny",
  baseCost:200000000,
  costMult:3.2,
  type:"factory_boost",
  target:"factory",
  value:1.25,
  unlock:20000000,
  desc:"Továrny ×5 výkon"
  },

  /* ENDGAME */

  {
  id:"cat_singularity",
  name:"Kočičí singularita",
  baseCost:5000000000,
  costMult:3.5,
  type:"global_mult",
  value:1.5,
  unlock:500000000,
  desc:"Celá produkce ×1.5"
  }

  ];
  function isUnlocked(def){
  if(!def.unlock) return true;
  if(def.unlock.total && G.state.total < def.unlock.total) return false;
  if(def.unlock.units){
  for(const k in def.unlock.units){
  if((G.state.units[k]||0) < def.unlock.units[k]) return false;
  }
  }
  return true;
  }


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
      upgradeTab: "normal",
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
      buildingUpgrades:{},
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

  let buyMode = 1;
  document.querySelectorAll("[data-buy]").forEach(btn=>{
  btn.onclick = ()=>{
  document.querySelectorAll("[data-buy]").forEach(b=>b.classList.remove("active"));
  btn.classList.add("active");
  const val = btn.dataset.buy;
  buyMode = val === "max" ? "max" : parseInt(val);
  };
  });

  function buyMax(def){
  let bought = 0;
  while(true){
  const cost = getNextUnitCost(def);
  if(G.state.paws < cost) break;
  G.state.paws -= cost;
  incUnit(def.id,1);
  bought++;
  }
  return bought;
  }

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
    let power = def.cps;
    // aplikace upgrade boostů
    for(const up of UPGRADE_DEFS){
      const lvl = getUpgradeLevel(up.id);
      if(!lvl) continue;
      if(up.type === "factory_boost" && up.target === def.id){
        power *= Math.pow(up.value,lvl);
      }
    }
    const count = G.state.units[def.id] || 0;
    cps += count * power;
    let mult = buildingBoosts[def.id] || 1;
    cps += count * def.cps * mult;
  }
  // prestige bonus
  cps *= (1 + (G.state.prestigePoints * 0.02));
  // global multipliers
  cps *= (G.state.cpsMultiplier || 1);
  cps *= (1 + (G.state.prestigePoints * 0.02));
  cps *= getBuffMultiplier("cps");

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

  function updatePrestigeStyle(){
  const el = document.querySelector(".prestige-display");

  if(!el) return;
  const p = G.state.prestigePoints;
  const glow = Math.min(p*3,30);
  const border = Math.min(2 + p*0.3,6);
  el.style.borderWidth = border + "px";
  el.style.boxShadow =
  `0 0 ${glow}px rgba(211,163,74,.6)`;
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

    const container = document.querySelector("#autoclickers");
    if(!container) return;

    container.innerHTML = "";

    for(const def of AUTOCLICKER_DEFS){

    if(G.state.total < def.unlock) continue;

    container.appendChild(createUnitElement(def));

    }

  }

  function renderUpgradesList(){

    const container = document.querySelector("#upgrades");
    if(!container) return;

    container.innerHTML = "";

    /* zvýraznění tabů */
    document.getElementById("tab-upgrades")?.classList.toggle(
    "active",
    G.state.upgradeTab === "normal"
    );

    document.getElementById("tab-building")?.classList.toggle(
    "active",
    G.state.upgradeTab === "building"
    );

    /* ===== KLASICKÉ UPGRADY ===== */

    if(G.state.upgradeTab === "normal"){

    for(const def of UPGRADE_DEFS){

    if(G.state.total < def.unlock) continue;

    const lvl = getUpgradeLevel(def.id);

    if(def.maxLevel === 1 && lvl >= 1) continue;

    container.appendChild(createUpgradeElement(def));

    }

    }

    /* ===== BUILDING UPGRADY ===== */

    if(G.state.upgradeTab === "building"){

    for(const up of BUILDING_UPGRADES){

    if(G.state.total < up.unlock) continue;

    if(G.state.buildingUpgrades?.[up.id]) continue;

    const el = document.createElement("div");

    el.className = "item";

    el.innerHTML = `
    <div class="meta">
    <div class="name">${up.name}</div>
    <div class="desc">${up.desc}</div>
    </div>

    <div>
    <div class="status">${fmt(up.cost)}</div>
    <button class="btn-gold">Koupit</button>
    </div>
    `;

    el.querySelector("button").onclick = ()=>buyBuildingUpgrade(up.id);

    container.appendChild(el);

    }

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

  function renderAll(){
  renderHeader();
  updateListsUI();
  renderUnitsList();
  renderUpgradesList();
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

  /* =========================
   GOLDEN EVENTS SYSTEM
   ========================= */

  const GOLD_EVENTS = [

  {
  id:"fish",
  icon:"🐟",
  name:"Golden Fish",
  effect(){
  const reward = calculateCPS()*300 + 500;
  G.state.paws += reward;
  G.state.total += reward;
  spawnFloatingText("+"+fmt(reward),null,{color:"gold"});
  renderAll();
  }
  },

  {
  id:"frenzy",
  icon:"🐱",
  name:"Cat Frenzy",
  duration:20,
  mult:7,
  effect(){
  activateBuff("cps",7,20);
  }
  },

  {
  id:"click",
  icon:"🐾",
  name:"Golden Paw",
  duration:20,
  mult:10,
  effect(){
  activateBuff("click",10,20);
  }
  },

  {
  id:"catch",
  icon:"🎣",
  name:"Mega Catch",
  effect(){
  const reward = calculateCPS()*600;
  G.state.paws += reward;
  G.state.total += reward;
  spawnFloatingText("+"+fmt(reward),null,{color:"gold"});
  renderAll();
  }
  }

  ];

    /* =========================
    BUFF SYSTEM
    ========================= */

  let activeBuffs = [];

  function activateBuff(type,mult,duration){

  activeBuffs.push({
  type:type,
  mult:mult,
  end:Date.now()+duration*1000
  });

  spawnFloatingText(type+" x"+mult,null,{color:"gold"});

  }

  function getBuffMultiplier(type){

  let m = 1;

  for(const b of activeBuffs){

  if(b.type === type && b.end > Date.now()){
  m *= b.mult;
  }

  }

  return m;

  }

  function updateBuffs(){

  activeBuffs = activeBuffs.filter(b=>b.end > Date.now());

  }

  function spawnGoldenEvent(){

  const root = document.querySelector(".game-root");
  const event = GOLD_EVENTS[
  Math.floor(Math.random()*GOLD_EVENTS.length)
  ];
  const el = document.createElement("div");
  el.textContent = event.icon;
  el.style.position = "absolute";
  el.style.fontSize = "32px";
  el.style.left = (20 + Math.random()*60) + "%";
  el.style.top = (30 + Math.random()*40) + "%";
  el.style.cursor = "pointer";
  el.style.zIndex = 1000;
  root.appendChild(el);
  el.onclick = ()=>{
  event.effect();
  el.remove();
  };

  setTimeout(()=>{
  el.remove();
  },8000);

  }
  /*** ========== NÁKUPY / AKCE ========== ***/
  function canAfford(cost) {
    return G.state.paws >= cost;
  }

  function buyUnit(id){
    const def = AUTOCLICKER_DEFS.find(d=>d.id===id);
    if(!def) return;
    if(buyMode === "max"){
    while(true){
    const cost = getNextUnitCost(def);
    if(G.state.paws < cost) break;
    G.state.paws -= cost;
    incUnit(id,1);
    }
    }else{
    for(let i=0;i<buyMode;i++){
    const cost = getNextUnitCost(def);
    if(G.state.paws < cost) break;
    G.state.paws -= cost;
    incUnit(id,1);
    // small visual feedback
    spawnFloatingText('-' + fmt(cost), null, { color: '#f2b84f' });
    updateListsUI();
    applyDerivedState();
    renderHeader();
    checkAchievements();
  }
  }
  }

  function buyUpgrade(id){

  const def = UPGRADE_DEFS.find(d => d.id === id);
  if(!def) return;
  if(buyMode === "max"){
  while(true){
  const cost = getNextUpgradeCost(def);
  if(G.state.paws < cost) break;
  if(def.maxLevel && getUpgradeLevel(id) >= def.maxLevel) break;
  G.state.paws -= cost;
  incUpgrade(id,1);
  }
  }else{
  for(let i=0;i<buyMode;i++){
  const cost = getNextUpgradeCost(def);
  if(G.state.paws < cost) break;
  if(def.maxLevel && getUpgradeLevel(id) >= def.maxLevel) break;
  G.state.paws -= cost;
  incUpgrade(id,1);
  }
  }
  applyDerivedState();
  updateListsUI();
  renderHeader();
  checkAchievements();
  toast(`Koupil jsi: ${def.name}`);
  }

  function buyBuildingUpgrade(id){

  const up = BUILDING_UPGRADES.find(u=>u.id===id);
  if(!up) return;
  /* už koupeno */
  if(G.state.buildingUpgrades[id]) return;
  if(G.state.paws < up.cost) return;
  G.state.paws -= up.cost;
  /* uložit že upgrade je koupen */
  G.state.buildingUpgrades[id] = true;
  /* aplikovat bonus */
  buildingBoosts[up.target] =
  (buildingBoosts[up.target] || 1) * up.mult;
  spawnFloatingText(up.name,null,{color:"gold"});

  renderUpgradesList();
  renderBuildingUpgrades();   // 🔥 přidat
  renderAll();

  }

  /*** ========== PRESTIGE (reinkarnace) ========== ***/
  function prestigeAvailable() {
    // jednoduchá formule: prestige points = floor(total^(1/4) / 10)
    const pts = Math.floor(Math.pow(G.state.total / 1e15, 0.6));
    return pts > G.state.prestigePoints;
  }

  function calculatePrestigeReward() {
    const pts = Math.floor(Math.pow(G.state.total / 1e15, 0.6));
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
    
    document.getElementById("prestige-preview").textContent =
    calculatePrestigeReward();
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
  function maybeSpawnGoldenFish(){
    let chance = 0.08;
    // bonus z prestige shopu
    if(G.state.prestigeUpgrades?.golden_fish_luck){
    chance *= 1.2; // +20%
    }
    if(Math.random() < chance){
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
  let globalMult = 1;
  let cpsMult = 1;
  // projít upgrady
  for(const def of UPGRADE_DEFS){
  const lvl = getUpgradeLevel(def.id);
  if(!lvl) continue;
  /* FLAT CLICK BONUS */
  if(def.type === "click_flat"){
  G.state.clickPower += def.value * lvl;
  }
  /* CLICK MULTIPLIER */
  if(def.type === "click_mult"){
  G.state.clickPower *= Math.pow(def.value,lvl);
  }
  /* CPS MULTIPLIER */
  if(def.type === "cps_mult"){
  cpsMult *= Math.pow(def.value,lvl);
  }
  /* GLOBAL MULTIPLIER */
  if(def.type === "global_mult"){
  globalMult *= Math.pow(def.value,lvl);
  }

  }
  G.state.cpsMultiplier = cpsMult * globalMult;
  }

  /*** ========== TICK FUNKCE ========== ***/

function tick(){
const cps = calculateCPS();
if(cps > 0){
  G.state.paws += cps;
  G.state.total += cps;
}
renderAll();

}

  /*** ========== CONNECT UI a STARTUP ========== ***/
  function bindStaticButtons() {
    // hlavní
    const cat = $('#cat-btn');
    if (cat) {
      cat.addEventListener('click', () => {
        const clickValue = G.state.clickPower * getBuffMultiplier("click");
        G.state.paws += clickValue;
        G.state.total += clickValue;
        showClickAnimation(clickValue);
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
    renderBuildingUpgrades();
    bindStaticButtons();
    bindPrestigeUI();
    applyDerivedState();
    renderAll();
    // start ticks
    if (!G.tickHandle) G.tickHandle = setInterval(tick, TICK_MS);
    if (!G.autosaveHandle) G.autosaveHandle = setInterval(saveGame, AUTOSAVE_MS);
    G.running = true;
    upgradeTab = upgradeTab || "normal";
    // small startup golden fish timer
    setInterval(maybeSpawnGoldenFish, 20_000 + Math.floor(Math.random() * 20_000));
    // accessibility: keyboard click (space / enter) when focused on cat
    setInterval(()=>{
      if(Math.random() < 0.15){
        spawnGoldenPaw();
        let chance = 0.15;
        if(G.state.prestigeUpgrades?.golden_fish_luck){
          chance *= 1.2;
        }
        if(Math.random() < chance){
          spawnGoldenEvent();
        }
      }
    }, 20000);
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
  const flashSaveIndicator = (ok) => {
        const el = $('#save-indicator');
        if (!el) return;
        el.textContent = ok ? 'Uloženo' : 'Uložit selhalo';
        el.style.opacity = '1';
        setTimeout(() => { el.style.opacity = '0.7'; }, 800);
      };

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

  
/*** ========== PRESTIGE SHOP (SAFE) ========== ***/
// definice obchodu (relikvie)


// nákup položky v prestige shopu
function buyPrestigeItem(item){
  if(!G.state) return;
  if(G.state.prestigePoints < item.cost){
    toast("Nemáš dost relikvií.");
    return;
  }

  // utratit
  G.state.prestigePoints -= item.cost;
  G.state.prestigeUpgrades = G.state.prestigeUpgrades || {};
  // uložit, co hráč koupil (můžeme také uchovat levely později)
  G.state.prestigeUpgrades[item.id] = (G.state.prestigeUpgrades[item.id] || 0) + 1;

  // aplikovat okamžité efekty (některé vyžadují změnu stavu / multiplikátorů)
  if(item.type === "golden_chance"){
    // efekt čteme v maybeSpawnGoldenFish()
  } else if(item.type === "click_mult"){
    // přidáme do derivátů - implementujeme jako "syntetický" upgrade
    // pro jednoduchost přidáme záznam do upgrades nebo do prestigeUpgrades detailněji
    // zde si jen uložíme flag — a applyDerivedState zohlední prestižní buffy
  } else if(item.type === "factory_mult" || item.type === "global_mult" || item.type === "prestige_scaling"){
    // necháme applyDerivedState běžet a renderAll aktualizuje UI
  }

  applyDerivedState();
  renderPrestigeShop();
  renderAll();
  saveGame();
  toast(`Koupeno: ${item.name}`);
}

/*** ========== připojení tlačítek (bezpečně) ========== ***/
// místo globálních getElementById volání registrovat v bindStaticButtons
// upravíme bindStaticButtons, aby zajistil i prestige shop wiring:
(function patchBindStaticButtons(){
  const old = bindStaticButtons;
  bindStaticButtons = function(...args){
    // zavolat původní binding (klik na kočku, reset, export atd.)
    try { old(...args); } catch(e){ console.warn("bindStaticButtons original failed:", e); }

    // teď bezpečně zaregistrujeme prestige-shop tlačítka (DOM už existuje)
    const btnPrestigeShop = document.getElementById("btn-prestige-shop");
    const prestigeShopPanel = document.getElementById("prestige-shop-panel");
    const btnClosePrestigeShop = document.getElementById("btn-close-prestige-shop");

    if(btnPrestigeShop){
      btnPrestigeShop.addEventListener('click', () => {
        if(prestigeShopPanel) {
          prestigeShopPanel.classList.remove('hidden');
          renderPrestigeShop();
          prestigeShopPanel.scrollIntoView({ behavior: "smooth" });
        } else {
          // pokud nemáme pravý panel, otevřeme v rámci levého (fallback)
          renderPrestigeShop();
        }
      });
    }

    if(btnClosePrestigeShop && prestigeShopPanel){
      btnClosePrestigeShop.addEventListener('click', () => {
        prestigeShopPanel.classList.add('hidden');
      });
    }

    // taky update UI pro tlačítko (vizuální stav)
    const prestigeBtn = document.getElementById('btn-prestige-shop');
    if(prestigeBtn){
      prestigeBtn.classList.toggle('active', !!(G.state && G.state.prestigeUpgrades && G.state.prestigeUpgrades['golden_fish_luck']));
    }
  };
})();

/* =========================
   PRESTIGE SHOP — data + UI
   ========================= */

// definuj položky obchodu relikvií
/* ----- PRESTIGE SHOP (vložit) ----- */
const PRESTIGE_SHOP_ITEMS = [
  { id: 'gold_magnet', name: 'Zlatý magnet', cost: 1000, desc: '+20% šance na golden fish', apply(state){ state.prestigeBonuses = state.prestigeBonuses || {}; state.prestigeBonuses.goldChance = (state.prestigeBonuses.goldChance||0) + 0.20; } },
  { id: 'cat_reflex',  name: 'Kočičí reflexy', cost: 1000, desc: 'Klik ×1.25', apply(state){ state.clickMultiplier = (state.clickMultiplier||1) * 1.25; } },
  { id: 'industrial_paws', name: 'Průmyslové tlapky', cost: 1000, desc: 'Továrny ×1.15 výkon', apply(state){ state.prestigeBonuses = state.prestigeBonuses || {}; state.prestigeBonuses.factoryMult = (state.prestigeBonuses.factoryMult||1) * 1.15; } },
  { id: 'cat_intel', name: 'Kočičí inteligence', cost: 2500, desc: 'Celková produkce ×1.10', apply(state){ state.cpsMultiplier = (state.cpsMultiplier||1) * 1.10; } },
  { id: 'dim_pocket', name: 'Dimenzionální kapsa', cost: 10000, desc: '+5% produkce za každý prestige bod', apply(state){ state.prestigeBonuses = state.prestigeBonuses || {}; state.prestigeBonuses.perPrestigePct = (state.prestigeBonuses.perPrestigePct||0) + 0.05; } }
];

function renderPrestigeShop(){
  const container = document.getElementById('prestige-items');
  if(!container) return;
  container.innerHTML = '';
  for(const it of PRESTIGE_SHOP_ITEMS){
    const el = document.createElement('div'); el.className='item'; el.dataset.id=it.id;
    const meta = document.createElement('div'); meta.className='meta';
    const name = document.createElement('div'); name.className='name'; name.textContent = it.name;
    const desc = document.createElement('div'); desc.className='desc'; desc.textContent = it.desc;
    meta.appendChild(name); meta.appendChild(desc);
    const right = document.createElement('div'); right.style.textAlign='right';
    const cost = document.createElement('div'); cost.className='status'; cost.textContent = it.cost + ' relikvií';
    const btn = document.createElement('button'); btn.className='btn-gold'; btn.textContent='Koupit';
    btn.addEventListener('click', ()=> buyPrestigeItem(it.id));
    right.appendChild(cost); right.appendChild(btn);
    el.appendChild(meta); el.appendChild(right);
    container.appendChild(el);
  }
}

function togglePrestigeShop(show){
  const shop = document.getElementById('prestige-shop');
  const btn = document.getElementById('btn-prestige-shop');
  if(!shop || !btn) return;
  const isShown = !shop.classList.contains('hidden');
  const want = (typeof show === 'boolean') ? show : !isShown;
  if(want){ shop.classList.remove('hidden'); shop.setAttribute('aria-hidden','false'); btn.classList.add('active'); }
  else { shop.classList.add('hidden'); shop.setAttribute('aria-hidden','true'); btn.classList.remove('active'); }
}

function buyPrestigeItem(itemId){
  const it = PRESTIGE_SHOP_ITEMS.find(x => x.id === itemId);
  if(!it){ toast('Chybná položka'); return; }
  if(G.state.prestigePoints < it.cost){ toast('Nemáš dost relikvií'); return; }
  G.state.prestigePoints -= it.cost;
  if(typeof it.apply === 'function') it.apply(G.state);
  saveGame();
  renderPrestigeShop();
  renderAll();
  toast('Koupeno: ' + it.name);
}

function bindPrestigeUI(){
  const btn = document.getElementById('btn-prestige-shop'); if(btn) btn.addEventListener('click', ()=> togglePrestigeShop());
  const btnClose = document.getElementById('btn-close-prestige-shop'); if(btnClose) btnClose.addEventListener('click', ()=> togglePrestigeShop(false));
  renderPrestigeShop();
}

function renderBuildingUpgrades(){

const container = document.querySelector("#upgrades");
container.innerHTML = ""; 
for(const up of BUILDING_UPGRADES){
/* už koupené nezobrazovat */
if(G.state.buildingUpgrades?.[up.id]) continue;
if(G.state.total < up.unlock) continue;

const el = document.createElement("div");

el.className = "item";

el.innerHTML = `
<div class="meta">
<div class="name">${up.name}</div>
<div class="desc">${up.desc}</div>
</div>

<div>
<div class="status">${fmt(up.cost)}</div>
<button>Koupit</button>
</div>
`;

el.querySelector("button").onclick = ()=>buyBuildingUpgrade(up.id);

container.appendChild(el);

}

}

const tabUpgrades = document.getElementById("tab-upgrades");
const tabBuilding = document.getElementById("tab-building");

if(tabUpgrades && tabBuilding){

tabUpgrades.onclick = ()=>{
G.state.upgradeTab = "normal";
tabUpgrades.classList.add("active");
tabBuilding.classList.remove("active");
renderUpgradesList();
};

tabBuilding.onclick = ()=>{
G.state.upgradeTab = "building";
tabBuilding.classList.add("active");
tabUpgrades.classList.remove("active");
renderUpgradesList();
};

}


  // END of module
})();