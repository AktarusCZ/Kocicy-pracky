/* Meow Marina v2
   - Timing-based fishing (skill)
   - Multiple maps & fish rarities
   - Upgrades affecting timing zone & rarity
   - Companions (autos)
   - Big Fish event (rapid taps)
   - Offline income, save/import/export
*/

// ---------- Config / Data ----------
const SAVE_KEY = 'meowmarina_v2_save_v1';
const AUTOSAVE_MS = 5000;
const OFFLINE_CAP_SEC = 12*3600; // cap offline to 12 hours

// maps: name, multiplier to value, rarity modifiers
const MAPS = [

{
id:"pond",
name:"Rybník",
desc:"Malý rybník plný běžných ryb.",
unlockFish:0,
mult:1
},

{
id:"river",
name:"Řeka",
desc:"Rychlá voda s většími rybami.",
unlockFish:10000,
mult:2
},

{
id:"sea",
name:"Moře",
desc:"Velké ryby a vyšší odměny.",
unlockFish:500000,
mult:4
},

{
id:"ocean",
name:"Oceán",
desc:"Největší ryby v celé hře.",
unlockSpecial:"sailboat20",
mult:8
}

];

// fish table (baseValue, weight for random)
const FISH_TABLE = [
  { id:'sardine', name:'Sardinka', base:1, weight:60, emoji:'🐟' },
  { id:'salmon',  name:'Losos',    base:5, weight:25, emoji:'🐠' },
  { id:'tuna',    name:'Tuňák',    base:15, weight:10, emoji:'🐡' },
  { id:'gold',    name:'Zlatá ryba',base:80, weight:5, emoji:'🐟✨' }
];

// upgrades (affect timing zone width, gold chance, value multipliers)
const UPGRADES = [
    { id:"hook", name:"Ostrý hák", desc:"Zvětšuje zelenou zónu při chytání.", baseCost:20 },
    { id:"line", name:"Silné lanko", desc:"Zvyšuje hodnotu chycených ryb.", baseCost:100 },
    { id:"bait", name:"Lepší návnada", desc:"Zvyšuje šanci na vzácné ryby.", baseCost:300 },
    { id:"gloves", name:"Rybářské rukavice", desc:"Zrychlují reakci při chytání.", baseCost:800 },
    { id:"instinct", name:"Kočičí instinkt", desc:"Zvyšuje šanci na úspěšný úlovek.", baseCost:2000 },
    { id:"sonar", name:"Rybářský sonar", desc:"Pomáhá najít větší ryby.", baseCost:5000 },
    { id:"fridge", name:"Lednice", desc:"Zvyšuje hodnotu ulovených ryb.", baseCost:12000 },
    { id:"motor", name:"Motor", desc:"Zvyšuje efektivitu lodí.", baseCost:30000 },
    { id:"magnet", name:"Magnet", desc:"Přitahuje více ryb do oblasti.", baseCost:70000 },
    { id:"legend", name:"Legenda rybářů", desc:"Velký bonus ke všem úlovkům.", baseCost:200000 }
];

function upgradeBonus(level){

if(level >= 500) return 5
if(level >= 100) return 3
if(level >= 50) return 2
if(level >= 10) return 1.5

return 1

}
// companions (autos that periodically do automated casts)
const COMPANIONS = [

{ id:"rod", name:"Prut", desc:"Automaticky chytá ryby.", baseCost:50, perSec:1 },

{ id:"carp", name:"Kapřík", desc:"Pomáhá přilákat ryby.", baseCost:300, perSec:4 },

{ id:"otter", name:"Vydra", desc:"Zkušený lovec ryb.", baseCost:1200, perSec:10 },

{ id:"boat", name:"Loďka", desc:"Loví ryby ve větším množství.", baseCost:6000, perSec:40 },

{ id:"sailboat", name:"Plachetnice", desc:"Velká rybářská loď.", baseCost:25000, perSec:150 }

];

function companionBonus(level){
if(level >= 500) return 6
if(level >= 100) return 3
if(level >= 50) return 2
if(level >= 10) return 1.5
return 1
}

// ---------- State ----------
let state = {
  fish:0,
  map: 'pond', // current map id
  perSec:0, // from companions
  upgrades: {}, // id -> level
  companions: {}, // id -> count
  lastTs: Date.now(),
  stats: { totalCaught:0, bestStreak:0 },
  version: 1
};

// ---------- DOM ----------
const $ = s => document.querySelector(s);
const uiFish = $('#ui-fish');
const uiPerSec = $('#ui-persec');
const uiSuccess = $('#ui-success');
const water = $('#water');
const fishLayer = $('#fish-layer');
const castBtn = $('#cast-btn');
const meter = $('#meter');
const meterIndicator = $('#meter-indicator');
const meterTarget = $('#meter-target');
const upgradeList = $('#upgrade-list');
const autoList = $('#auto-list');
const mapList = $('#map-list');
const saveInd = $('#save-ind');
const dlgImport = document.getElementById('dlg-import');
const txtSave = $('#txt-save');

// ---------- Helpers ----------
function fmt(n){
  if(n<1000) return ''+Math.floor(n);
  const units=['k','M','B'];
  let u=-1; let v=n;
  while(v>=1000 && u<units.length-1){ v/=1000; u++; }
  return (Math.round(v*100)/100) + units[u];
}

function randWeighted(arr){
  const total = arr.reduce((s,a)=>s+(a.weight||1),0);
  let r = Math.random()*total;
  for(const a of arr){
    r -= (a.weight||1);
    if(r<=0) return a;
  }
  return arr[arr.length-1];
}

function now(){ return Date.now(); }

function save(){
  state.lastTs = now();
  localStorage.setItem(SAVE_KEY, JSON.stringify(state));
  saveInd.textContent = 'Uloženo: ' + (new Date()).toLocaleTimeString();
}

function load(){
  const raw = localStorage.getItem(SAVE_KEY);
  if(!raw){ initDefaults(); renderAll(); return; }
  try{
    const parsed = JSON.parse(raw);
    state = Object.assign({}, state, parsed);
    // handle offline income
    const elapsed = Math.floor((now() - (state.lastTs||now()))/1000);
    if(elapsed > 5){
      const applied = Math.min(elapsed, OFFLINE_CAP_SEC);
      const gain = (state.perSec || 0) * applied;
      if(gain > 0){
        state.fish += gain;
        spawnPop(`+${fmt(gain)} (offline)`);
      }
    }
    // ensure structures exist
    state.upgrades = state.upgrades || {};
    state.companions = state.companions || {};
    recalcPerSec();
    renderAll();
  } catch(e){
    console.warn('Load failed', e);
    initDefaults();
    renderAll();
  }
}

function initDefaults(){
  state = {
    fish:0,
    map:'pond',
    perSec:0,
    upgrades:{},
    companions:{},
    lastTs: now(),
    stats:{ totalCaught:0, bestStreak:0 },
    version:1
  };
  recalcPerSec();
}

// ---------- Render UI ----------
function renderAll(){
  uiFish.textContent = fmt(state.fish);
  uiPerSec.textContent = (state.perSec||0).toFixed(1) + ' /s';
  uiSuccess.textContent = '—';
  renderUpgrades();
  renderCompanions();
  renderMaps();
}

function renderUpgrades(){
  upgradeList.innerHTML = '';
  UPGRADES.forEach(u => {
    const lvl = state.upgrades[u.id] || 0;
    const cost = Math.ceil(u.baseCost * Math.pow(1.6, lvl));
    const item = document.createElement('div'); item.className='item';
    item.innerHTML = `
      <div class="meta">
        <div class="name">${u.name} <span style="font-weight:600;color:var(--muted);">Lv.${lvl}</span></div>
        <div class="desc">${u.desc}</div>
      </div>
      <div style="text-align:right;">
        <div class="name">${fmt(cost)} 🐟</div>
        <div style="margin-top:6px"><button class="btn" data-id="${u.id}" ${lvl>=u.max?'disabled':''}>Koupit</button></div>
      </div>`;
    upgradeList.appendChild(item);
    item.querySelector('button').addEventListener('click', ()=> buyUpgrade(u.id));
  });
}

function renderCompanions(){
  autoList.innerHTML = '';
  COMPANIONS.forEach(c => {
    const count = state.companions[c.id] || 0;
    const cost = Math.ceil(c.baseCost * Math.pow(1.45, count));
    const item = document.createElement('div'); item.className='item';
    item.innerHTML = `
      <div class="meta">
        <div class="name">${c.name} <span style="font-weight:600;color:var(--muted)">x${count}</span></div>
        <div class="desc">${c.desc}</div>
      </div>
      <div style="text-align:right;">
        <div class="name">${fmt(cost)} 🐟</div>
        <div style="margin-top:6px"><button class="btn" data-id="${c.id}">Koupit</button></div>
      </div>`;
    autoList.appendChild(item);
    item.querySelector('button').addEventListener('click', ()=> buyCompanion(c.id));
  });
}

function renderMaps(){
  mapList.innerHTML = '';
  MAPS.forEach(m => {
    const unlocked = (state.stats.totalCaught >= m.unlock);
    const active = (state.map === m.id);
    const item = document.createElement('div'); item.className='item';
    item.innerHTML = `
      <div class="meta">
        <div class="name">${m.name} ${active?'<span style="color:var(--accent);font-weight:800">•</span>':''}</div>
        <div class="desc">${m.desc} ${m.mult>1?`(x${m.mult})`:''}</div>
      </div>
      <div style="text-align:right;">
        <div class="desc">${unlocked?'<span style="color:var(--muted)">Odemyk.</span>':'<small>Nutno chytit více ryb</small>'}</div>
        <div style="margin-top:6px"><button class="btn" data-id="${m.id}" ${unlocked && !active? '': 'disabled'}>${active? 'Aktivní' : (unlocked? 'Vybrat' : 'Zamčeno')}</button></div>
      </div>`;
    mapList.appendChild(item);
    const btn = item.querySelector('button');
    if(btn) btn.addEventListener('click', ()=> {
      if(unlocked) { state.map = m.id; renderAll(); save(); }
    });
  });
  function isMapUnlocked(map){
    if(map.unlockFish){
    return state.fish >= map.unlockFish
    }
    if(map.unlockSpecial === "sailboat20"){
    return (state.companions["sailboat"] || 0) >= 20
    }
    return true
    }
}

// ---------- Economy recalculation ----------
function recalcPerSec(){
  let ps = 0;
  COMPANIONS.forEach(c => {
    const cnt = state.companions[c.id] || 0;
    ps += cnt * c.perSec;
  });
  state.perSec = ps;
  uiPerSec.textContent = (state.perSec||0).toFixed(1) + ' /s';
}

// ---------- Fishing flow (timing meter) ----------
let meterRunning = false;
let meterDir = 1; // 1 right, -1 left
let meterX = 0; // 0..1
let meterSpeed = 0.01; // per frame (will scale)
let activeCast = null; // object for current cast
let bigFishActive = false;
let bigFishData = null;

// compute timing zone width (percent of meter width)
function timingZonePercent(){
  const lvl = state.upgrades['hook'] || 0;
  // base 12% + upgrades
  return Math.min(60, 12 + lvl*3);
}

// compute rarity weight multiplier
function rarityMultiplier(){
  const lvl = state.upgrades['bait'] || 0;
  return 1 + lvl*0.06;
}

// compute value multiplier
function valueMultiplier(){
  const lvl = state.upgrades['line'] || 0;
  return 1 + lvl*0.12;
}

// start casting (first tap)
function startCast(){
  if(meterRunning) return;
  meterRunning = true;
  meterX = Math.random()*0.3; // random start offset
  meterDir = Math.random()>0.5?1:-1;
  meterSpeed = 0.012 + Math.min(0.06, 0.002 * (1 + (state.stats.totalCaught/20)));
  // set target zone random position across meter (but not too close to edges)
  const zoneWidth = timingZonePercent()/100;
  const zoneLeft = 0.12 + Math.random()*(1 - zoneWidth - 0.24);
  activeCast = { start: now(), zoneLeft, zoneWidth, tries:0 };
  // UI
  meterTarget.style.left = (zoneLeft*100)+'%';
  meterTarget.style.width = (zoneWidth*100)+'%';
  meterIndicator.style.left = (meterX*100)+'%';
  uiSuccess.textContent = 'Trefit zónu!';
  // small animation to indicate start
  spawnPop('Hodíš!');
}

// attempt catch (second tap)
function resolveCast(){
  if(!meterRunning) return;
  meterRunning = false;
  activeCast.tries++;
  // compute indicator pos final
  const ix = meterX;
  const inZone = (ix >= activeCast.zoneLeft) && (ix <= activeCast.zoneLeft + activeCast.zoneWidth);
  if(inZone){
    // success: determine fish type by weights + map modifiers
    const map = MAPS.find(m=>m.id===state.map) || MAPS[0];
    // build weighted table with rarity multiplier
    const table = FISH_TABLE.map(f => {
      const copy = Object.assign({}, f);
      // if fish is rare (weight small) we scale weight by rarityMultiplier
      copy.weight = f.weight * ((f.weight<15)? rarityMultiplier() : 1);
      // map affects relative chance for higher-value fish: multiply weight by map.mult for high base
      if(f.base >= 15) copy.weight *= map.mult;
      return copy;
    });
    const fish = randWeighted(table);
    // compute value
    let value = Math.round(fish.base * map.mult * valueMultiplier());
    // success streak bonus small random
    value = Math.max(1, value + Math.floor(Math.random()*Math.max(1, Math.floor(value*0.15))));
    state.fish += value;
    state.stats.totalCaught += 1;
    spawnFishEmoji(fish.emoji, value);
    spawnPop(`+${fmt(value)} — ${fish.name}`);
    addLog("🐟 Chytil jsi " + fish.name + " (+" + value + ")");
    uiSuccess.textContent = `Chytil jsi ${fish.name}!`;
    // small chance to trigger Big Fish event if rare fish caught
    if(Math.random() < 0.02 + (fish.base>=15? 0.08 : 0)){
      triggerBigFish();
    }
  } else {
    addLog("💨 Ryba utekla");
    uiSuccess.textContent = 'Utekla';
  }
  // after resolve update UI & recalc
  recalcPerSec();
  renderAll();
  save();
  activeCast = null;
}

// update meter per frame
function meterTick(){
  if(!meterRunning) return;
  // update pos
  meterX += meterDir * meterSpeed;
  if(meterX <= 0){ meterX = 0; meterDir = 1; }
  if(meterX >= 1){ meterX = 1; meterDir = -1; }
  meterIndicator.style.left = (meterX*100) + '%';
}

// ---------- Fish visual & pop ----------
function spawnFishEmoji(emoji, value){
  const el = document.createElement('div');
  el.className = 'fish-emoji';
  el.textContent = emoji;
  // random start pos near boat area
  const x = 30 + Math.random()*40; // %
  const y = 50 + Math.random()*18; // %
  el.style.left = x + '%';
  el.style.top = y + '%';
  fishLayer.appendChild(el);
  // animate upward and fade
  setTimeout(()=> {
    el.style.transform = `translateY(-70px) scale(1.1)`;
    el.style.opacity = '0';
  }, 30);
  setTimeout(()=> el.remove(), 1100);
  // also spawn a numeric pop
  spawnPop('+'+fmt(value));
}

function spawnPop(text){
  const p = document.createElement('div');
  p.className = 'pop';
  p.textContent = text;
  // random horizontal jitter
  p.style.left = (48 + (Math.random()-0.5)*8) + '%';
  document.body.appendChild(p);
  setTimeout(()=> p.remove(), 900);
}

// ---------- Upgrades & Companions ----------
function buyUpgrade(id){
  const u = UPGRADES.find(x=>x.id===id);
  if(!u) return;
  const lvl = state.upgrades[id] || 0;
  if(lvl >= u.max) return;
  const cost = Math.ceil(u.baseCost * Math.pow(1.6, lvl));
  if(state.fish < cost){ spawnPop('Nemáš dost ryb'); return; }
  state.fish -= cost;
  state.upgrades[id] = lvl + 1;
  spawnPop(`Koupil jsi ${u.name} Lv.${lvl+1}`);
  recalcPerSec();
  renderAll();
  save();
}

function buyCompanion(id){
  const c = COMPANIONS.find(x=>x.id===id);
  if(!c) return;
  const cnt = state.companions[id] || 0;
  if(cnt >= c.max) return;
  const cost = Math.ceil(c.baseCost * Math.pow(1.45, cnt));
  if(state.fish < cost){ spawnPop('Nemáš dost ryb'); return; }
  state.fish -= cost;
  state.companions[id] = cnt + 1;
  spawnPop(`Koupil jsi ${c.name}`);
  recalcPerSec();
  renderAll();
  save();
}

// ---------- Companions autos: they perform auto-casts at interval ----------
function companionTick(){
  // each companion attempts casts proportional to perSec: we implement as periodic small casts
  // simpler: give companion income each second via state.perSec already computed
  state.fish += state.perSec;
  // random small auto SPAWN visuals
  if(state.perSec > 0 && Math.random() < 0.35){
    spawnPop('+'+fmt(Math.max(1, Math.round(state.perSec))));
  }
  renderAll();
  save();
}

// ---------- Big Fish event ----------
let bigFishTimer = null;
function triggerBigFish(){
  if(bigFishActive) return;
  bigFishActive = true;
  // choose big fish difficulty
  bigFishData = { hp: 6 + Math.floor(Math.random()*10), reward: 60 + Math.floor(Math.random()*200) };
  spawnPop('BIG FISH! Spamuj rychle!');
  // show a temporary UI pop
  uiSuccess.textContent = 'BIG FISH!';
  // overlay rapid-tap handler for 6 seconds or until hp=0
  let hits = 0;
  const hitHandler = ()=> {
    hits++;
    bigFishData.hp--;
    spawnPop('Hit! -1');
    if(bigFishData.hp <= 0){
      // success
      const rew = Math.round(bigFishData.reward * valueMultiplier());
      state.fish += rew;
      spawnPop(`Vyhrál jsi ${fmt(rew)}!`);
      bigFishActive = false;
      document.removeEventListener('touchstart', hitHandler);
      document.removeEventListener('mousedown', hitHandler);
      uiSuccess.textContent = 'Velký úlovek!';
      save();
      renderAll();
    }
  };
  // attach events
  document.addEventListener('touchstart', hitHandler, {passive:true});
  document.addEventListener('mousedown', hitHandler);
  // auto timeout
  setTimeout(()=> {
    if(bigFishActive){
      spawnPop('Big fish utekl…');
      bigFishActive = false;
      document.removeEventListener('touchstart', hitHandler);
      document.removeEventListener('mousedown', hitHandler);
      uiSuccess.textContent = 'Big fish utekl';
    }
  }, 6000);
}

// ---------- Input wiring ----------
castBtn.addEventListener('click', ()=> {
  if(bigFishActive) return; // during big fish, casting disabled
  if(!meterRunning) {
    startCast();
  } else {
    resolveCast();
  }
});
// allow touchstart for snappier response
castBtn.addEventListener('touchstart', e => {
  e.preventDefault();
  if(bigFishActive) return;
  if(!meterRunning) startCast();
  else resolveCast();
}, {passive:false});

// keyboard quick test
window.addEventListener('keydown', e => {
  if(e.code === 'Space') {
    if(!meterRunning) startCast(); else resolveCast();
  }
});

// ---------- animation loop ----------
function frame(){
  meterTick();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// ---------- periodic ticks ----------
setInterval(()=> {
  companionTick();
}, 1000);

// autosave
setInterval(()=> {
  save();
}, AUTOSAVE_MS);

// ---------- export / import / reset ----------
$('#btn-export').addEventListener('click', ()=> {
  const txt = JSON.stringify(state);
  const blob = new Blob([txt], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'meowmarina-save.json'; document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
});
$('#btn-export2').addEventListener('click', ()=> $('#btn-export').click());

$('#btn-import').addEventListener('click', ()=> dlgImport.showModal());
$('#btn-import2').addEventListener('click', ()=> $('#btn-import').click());
$('#close-import').addEventListener('click', ()=> dlgImport.close());
$('#do-import').addEventListener('click', ()=> {
  try{
    const parsed = JSON.parse(txtSave.value.trim());
    if(parsed){ localStorage.setItem(SAVE_KEY, JSON.stringify(parsed)); load(); dlgImport.close(); spawnPop('Import OK'); }
  }catch(e){ alert('Chybný JSON'); }
});

$('#btn-reset').addEventListener('click', ()=> {
  if(confirm('Opravdu resetovat pokrok?')) {
    localStorage.removeItem(SAVE_KEY);
    initDefaults();
    renderAll();
    save();
  }
});

function addLog(text){

const log = document.getElementById("game-log")

const div = document.createElement("div")
div.className = "log-entry"

div.textContent = text

log.prepend(div)

if(log.children.length > 50){
log.removeChild(log.lastChild)
}

}
// ---------- Render lists initial wiring ----------
function wireLists(){
  // fill upgrade & companion lists
  renderAll();
}
wireLists();

// ---------- load on start ----------
load();

// ---------- helper: renderAll already updates lists, but update UI fish display frequently ----------
setInterval(()=> { uiFish.textContent = fmt(state.fish); }, 300);

// ---------- Meter initial positioning ----------
meterIndicator.style.left = '0%';
meterTarget.style.left = '30%';
meterTarget.style.width = timingZonePercent() + '%';

// ---------- update meter target width reactively when upgrades change ----------
function updateMeterTarget(){
  meterTarget.style.width = timingZonePercent() + '%';
}
// watch state.upgrades by periodically updating UI (simple approach)
setInterval(()=> { updateMeterTarget(); renderUpgrades(); renderCompanions(); renderMaps(); }, 1200);