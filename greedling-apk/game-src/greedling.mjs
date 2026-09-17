import * as THREE from './three.module.js';
import { ITEMS, MODS, UPGRADES } from './catalog.mjs';

const $ = (id) => document.getElementById(id);
const ui = {
  hud:$('hud'), gold:$('gold'), value:$('value'), stack:$('stack'), best:$('best'),
  dawnBar:$('dawnBar'), leanBar:$('leanBar'), time:$('time'), lean:$('lean'), toast:$('toast'),
  start:$('start'), levelup:$('levelup'), end:$('end'), den:$('den'), modChoices:$('modChoices'),
  reroll:$('rerollBtn'), banked:$('banked'), stash:$('stash'), upgrades:$('upgradeGrid'),
  endTitle:$('endTitle'), endCopy:$('endCopy'), endEyebrow:$('endEyebrow')
};

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const RAID_SECONDS = 360;
const DAWN_GRACE = 20;
const keys = new Set();
const mods = new Set();
const comboFlags = new Set();
let touchVec = new THREE.Vector2();
let moveTarget = null;
let audioCtx = null;
let running = false;
let paused = false;
let raidElapsed = 0;
let raidGold = 0;
let lean = 0;
let maxSlots = 6;
let packReadyAt = 0;
let ghostUntil = 0;
let slowUntil = 0;
let guardHitAt = 0;
let catStealAt = 0;
let nextLevel = 0;
let rerolled = false;
let uid = 1;
let toastTimer = 0;
let sessionBest = 0;
let bank = Number(localStorage.getItem('greedling.bank') || 0);
let bestRaid = Number(localStorage.getItem('greedling.best') || 0);
let meta = safeJSON(localStorage.getItem('greedling.meta'), {owned:{},codex:[]});
meta.owned ||= {};
meta.codex ||= [];
const codex = new Set(meta.codex);

function safeJSON(value, fallback){ try { return value ? JSON.parse(value) : fallback; } catch { return fallback; } }
function saveMeta(){ meta.codex=[...codex]; localStorage.setItem('greedling.meta', JSON.stringify(meta)); }
function saveBank(){ localStorage.setItem('greedling.bank', String(bank)); }
function saveBest(){ localStorage.setItem('greedling.best', String(bestRaid)); }
function clamp(v,a,b){ return Math.max(a,Math.min(b,v)); }
function rand(a,b){ return a + Math.random()*(b-a); }
function pick(arr){ return arr[(Math.random()*arr.length)|0]; }
function hasTag(def, tag){ return def.tags.includes(tag); }
function vib(ms){ if (navigator.vibrate) navigator.vibrate(ms); }

function unlockAudio(){
  if (audioCtx) return;
  try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); audioCtx.resume(); } catch {}
}
function beep(freq=440,dur=.06,gain=.025){
  if (!audioCtx) return;
  const o=audioCtx.createOscillator(), g=audioCtx.createGain();
  o.frequency.value=freq; o.type='triangle'; g.gain.value=gain;
  o.connect(g); g.connect(audioCtx.destination); o.start(); g.gain.exponentialRampToValueAtTime(.0001,audioCtx.currentTime+dur); o.stop(audioCtx.currentTime+dur);
}
addEventListener('pointerdown', unlockAudio, {once:true});

function toast(text, danger=false){
  ui.toast.textContent=text; ui.toast.style.color=danger?'#ff9d79':'#f4d892';
  ui.toast.classList.remove('show'); requestAnimationFrame(()=>ui.toast.classList.add('show'));
  clearTimeout(toastTimer); toastTimer=setTimeout(()=>ui.toast.classList.remove('show'),900);
}

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x071014);
scene.fog = new THREE.Fog(0x071014, 18, 54);
const camera = new THREE.PerspectiveCamera(46, innerWidth/innerHeight, .1, 100);
const renderer = new THREE.WebGLRenderer({antialias:true, powerPreference:'high-performance'});
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
$('game').appendChild(renderer.domElement);

scene.add(new THREE.HemisphereLight(0x8299a8,0x1b120b,1.35));
const moon = new THREE.DirectionalLight(0xffdfae,2.2); moon.position.set(8,16,5); moon.castShadow=true; moon.shadow.mapSize.set(1024,1024); scene.add(moon);

const ground = new THREE.Mesh(new THREE.CylinderGeometry(23,23,.5,64), new THREE.MeshStandardMaterial({color:0x151b1e,roughness:.88,metalness:.1}));
ground.position.y=-.28; ground.receiveShadow=true; scene.add(ground);
const rim = new THREE.Mesh(new THREE.TorusGeometry(22.7,.12,6,80),new THREE.MeshBasicMaterial({color:0x5b4a33})); rim.rotation.x=Math.PI/2; rim.position.y=.01; scene.add(rim);

const staticRoot = new THREE.Group(); scene.add(staticRoot);
const lootRoot = new THREE.Group(); scene.add(lootRoot);
const guardRoot = new THREE.Group(); scene.add(guardRoot);
const player = new THREE.Group(); scene.add(player);
const stackRoot = new THREE.Group(); player.add(stackRoot); stackRoot.position.set(0,1.55,.5);
const stack = [];
const worldItems = [];
const stalls = [];
const guards = [];
let gate = null;

function mat(color, emissive=0){ return new THREE.MeshStandardMaterial({color,roughness:.62,metalness:.18,emissive,emissiveIntensity:emissive?1.2:0}); }
function meshBox(w,h,d,color){ const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat(color)); m.castShadow=m.receiveShadow=true; return m; }
function createGoblin(){
  const body=meshBox(.72,.78,.5,0x426a3d); body.position.y=.74; player.add(body);
  const head=new THREE.Mesh(new THREE.SphereGeometry(.42,12,8),mat(0x5f8a4c)); head.position.y=1.36; head.castShadow=true; player.add(head);
  for(const side of [-1,1]){ const ear=new THREE.Mesh(new THREE.ConeGeometry(.18,.62,3),mat(0x5f8a4c)); ear.position.set(side*.49,1.42,0); ear.rotation.z=side*-Math.PI/2; player.add(ear); }
  const eyeMat=new THREE.MeshBasicMaterial({color:0xffd85e});
  for(const side of [-1,1]){ const eye=new THREE.Mesh(new THREE.SphereGeometry(.055,8,6),eyeMat); eye.position.set(side*.15,1.43,-.36); player.add(eye); }
  const sack=meshBox(.62,.62,.34,0x6d4a30); sack.position.set(0,.95,.38); player.add(sack);
}
createGoblin();

function createStalls(){
  for(let i=0;i<8;i++){
    const a=i/8*Math.PI*2+.2, r=16.2;
    const g=new THREE.Group(); g.position.set(Math.cos(a)*r,0,Math.sin(a)*r); g.rotation.y=-a+Math.PI/2;
    const counter=meshBox(2.5,.8,1.25,i===5?0x60461f:0x382f29); counter.position.y=.4; g.add(counter);
    const roof=meshBox(2.9,.16,1.5,0x6f3e27); roof.position.y=2.15; g.add(roof);
    for(const x of [-1.15,1.15]){ const post=meshBox(.12,1.8,.12,0x7a5837); post.position.set(x,1.15,.45); g.add(post); }
    const lamp=new THREE.PointLight(0xffb45e,6,6,2); lamp.position.set(0,1.8,-.35); g.add(lamp);
    const ring=new THREE.Mesh(new THREE.RingGeometry(1.4,1.8,32),new THREE.MeshBasicMaterial({color:0xc4a46a,transparent:true,opacity:.2,side:THREE.DoubleSide})); ring.rotation.x=-Math.PI/2; ring.position.set(0,.02,-1.7); g.add(ring);
    staticRoot.add(g); stalls.push({group:g, sellPos:new THREE.Vector3(Math.cos(a)*(r-1.7),0,Math.sin(a)*(r-1.7))});
  }
  const g=new THREE.Group(); g.position.set(0,0,20.5);
  const left=meshBox(.65,4,.65,0x655238), right=left.clone(); left.position.set(-2,2,0); right.position.set(2,2,0); g.add(left,right);
  const top=meshBox(4.7,.55,.65,0xc4a46a); top.position.y=4; g.add(top);
  const ring=new THREE.Mesh(new THREE.RingGeometry(2.1,2.65,40),new THREE.MeshBasicMaterial({color:0xffcc66,transparent:true,opacity:.35,side:THREE.DoubleSide})); ring.rotation.x=-Math.PI/2; ring.position.z=-1; ring.position.y=.03; g.add(ring);
  const lamp=new THREE.PointLight(0xffc15b,9,9,2); lamp.position.set(0,3,0); g.add(lamp); staticRoot.add(g);
  gate={group:g, sellPos:new THREE.Vector3(0,0,19.5)};
}
createStalls();

function createGuard(radius,phase,speed){
  const g=new THREE.Group();
  const body=meshBox(.55,1.25,.5,0x2b3440); body.position.y=.8; g.add(body);
  const head=new THREE.Mesh(new THREE.SphereGeometry(.28,10,7),mat(0xcab08b)); head.position.y=1.62; head.castShadow=true; g.add(head);
  const light=new THREE.PointLight(0xffc66a,5,5,2); light.position.set(0,1.55,-.45); g.add(light);
  guardRoot.add(g); guards.push({group:g,radius,phase,speed});
}
createGuard(10,0,.26); createGuard(13.2,2.1,-.21); createGuard(17,4.4,.17);

function createItemMesh(def){
  let geo;
  if(hasTag(def,'food')) geo=new THREE.SphereGeometry(.33,10,7);
  else if(hasTag(def,'critter')) geo=new THREE.SphereGeometry(.36,10,7);
  else if(def.id==='bell') geo=new THREE.ConeGeometry(.34,.55,12);
  else if(def.id==='crown') geo=new THREE.CylinderGeometry(.4,.3,.42,8);
  else if(def.id==='lantern') geo=new THREE.CylinderGeometry(.27,.3,.58,8);
  else geo=new THREE.BoxGeometry(.62,.42,.58);
  const m=new THREE.Mesh(geo,mat(def.color,def.id==='gem'?0x124b4d:0)); m.castShadow=true; m.receiveShadow=true; m.userData.def=def; return m;
}
function spawnWorld(def,x,z,recoverUntil=0){
  const mesh=createItemMesh(def); mesh.position.set(x,.35,z); mesh.rotation.y=rand(0,Math.PI*2); lootRoot.add(mesh);
  worldItems.push({def,mesh,recoverUntil}); return mesh;
}
function clearLoot(){ while(worldItems.length){ lootRoot.remove(worldItems.pop().mesh); } while(stack.length){ stackRoot.remove(stack.pop().mesh); } }
function spawnRaidLoot(){
  clearLoot();
  const scripted=[ITEMS[0],ITEMS[1],ITEMS[2]];
  scripted.forEach((def,i)=>spawnWorld(def,-2+i*2,-4+i*.4));
  for(let i=0;i<38;i++){ const a=rand(0,Math.PI*2), r=rand(4.5,20); spawnWorld(pick(ITEMS),Math.cos(a)*r,Math.sin(a)*r); }
}

function stackValue(){
  let total=0;
  stack.forEach((e,i)=>{
    let v=e.def.value*(e.mult||1);
    if(mods.has('food2x')&&hasTag(e.def,'food')) v*=2;
    if(mods.has('top2x')&&i===stack.length-1) v*=2;
    total+=v;
  });
  if(stack.length>=3 && stack.filter(e=>hasTag(e.def,'food')).length>=3) total*=1.18;
  return Math.round(total);
}
function stackWeight(){ return stack.reduce((s,e)=>s+e.def.weight,0); }
function refreshStack(){
  stack.forEach((e,i)=>{ e.mesh.position.set(Math.sin(i*1.73)*.08,i*.56,0); e.mesh.rotation.set(rand(-.03,.03),i*.2,rand(-.04,.04)); });
  ui.stack.textContent=`${stack.length}/${maxSlots}`;
}
function addCarried(def){
  if(stack.length>=maxSlots){ toast('BACK FULL',true); beep(130,.08,.02); return false; }
  const mesh=createItemMesh(def); stackRoot.add(mesh);
  const e={uid:uid++,def,mesh,mult:1,cooked:false,blessed:false,label:def.name}; stack.push(e); refreshStack();
  codex.add(def.id); saveMeta();
  lean=clamp(lean+def.weight*.72,0,35); beep(320+stack.length*28,.05,.03); vib(12); toast(`+ ${def.name}`);
  if(mods.has('autoCook')&&hasTag(def,'food')){ e.mult*=2; e.cooked=true; e.label='HOT '+def.name; e.mesh.material.emissive.setHex(0x3a1c05); toast('AUTO-COOK ×2'); }
  checkCombos(); maybeLevel(); return true;
}
function removeEntryAt(i){ const [e]=stack.splice(i,1); if(e) stackRoot.remove(e.mesh); refreshStack(); return e; }
function comboOnce(key,label){ if(comboFlags.has(key)) return false; comboFlags.add(key); toast(label); beep(523,.06,.035); setTimeout(()=>beep(659,.08,.025),55); vib(24); return true; }
function checkCombos(){
  for(let i=0;i<stack.length-1;i++){
    const a=stack[i], b=stack[i+1];
    if(hasTag(a.def,'fire')&&hasTag(b.def,'food')&&!b.cooked){ b.cooked=true;b.mult*=3;b.label='COOKED '+b.def.name;b.mesh.material.emissive.setHex(0x4a2108);comboOnce(`cook${b.uid}`,'COOKED ×3'); }
    if((a.def.id==='fish'&&b.def.id==='lantern')||(a.def.id==='lantern'&&b.def.id==='fish')){ const f=a.def.id==='fish'?a:b; if(comboOnce(`king${a.uid}-${b.uid}`,'GRILLED KING ×3')){f.mult*=3;f.label='GRILLED KING';f.mesh.scale.setScalar(1.18);} }
    if((a.def.id==='mirror'&&hasTag(b.def,'cursed'))||(b.def.id==='mirror'&&hasTag(a.def,'cursed'))){ const c=a.def.id==='mirror'?b:a; if(!c.blessed){c.blessed=true;c.mult*=1.5;c.mesh.material.emissive.setHex(0x0c3440);lean=Math.max(0,lean-5);comboOnce(`bless${c.uid}`,'CURSE INVERTED');} }
  }
  const cheese=stack.findIndex(e=>e.def.id==='cheese'), crit=stack.findIndex(e=>hasTag(e.def,'critter'));
  if(cheese>=0&&crit>=0&&cheese!==crit){ const ids=[stack[cheese].uid,stack[crit].uid].sort().join('-'); if(comboOnce(`snack${ids}`,'SNACK TAX +12')){ for(const i of [cheese,crit].sort((a,b)=>b-a)) removeEntryAt(i); raidGold+=12; } }
  if(stack[0]?.def.id==='bomb'&&stack.some(e=>hasTag(e.def,'wood'))){ if(comboOnce(`charcoal${stack[0].uid}`,'CHARCOAL — STABLE')){stack[0].mult*=1.6;lean=Math.max(0,lean-8);} }
  const crown=stack.find(e=>e.def.id==='crown'); const metals=stack.filter(e=>hasTag(e.def,'metal')).length;
  if(crown&&metals>=4&&comboOnce(`royal${crown.uid}`,'ROYAL TAX ×2')) crown.mult*=2;
  const apple=stack.find(e=>e.def.id==='apple'), mirror=stack.find(e=>e.def.id==='mirror');
  if(apple&&mirror&&comboOnce(`oracle${apple.uid}-${mirror.uid}`,'GOLDEN ORACLE ×2')) apple.mult*=2;
  const gem=stack.find(e=>e.def.id==='gem'), idol=stack.find(e=>e.def.id==='idol');
  if(gem&&idol&&comboOnce(`night${gem.uid}-${idol.uid}`,'NIGHT TITHE ×2')){gem.mult*=2;lean=Math.max(0,lean-4);}
  if(stack[0]?.def.id==='boots') comboOnce(`boots${stack[0].uid}`,'SPRING-LOCKED');
  if(stack[0]?.def.id==='lead') comboOnce(`lead${stack[0].uid}`,'LEAD ANCHOR');
  if(stack.at(-1)?.def.id==='bell') comboOnce(`bell${stack.at(-1).uid}`,'LOUD TOP');
}

const levelThresholds=[70,150,260,400,560,760];
function maybeLevel(){ if(nextLevel<levelThresholds.length&&stackValue()>=levelThresholds[nextLevel]&&!paused){ nextLevel++; setTimeout(openLevel, reducedMotion?0:120); } }
function threeMods(){ const pool=[...MODS]; const out=[]; while(out.length<3&&pool.length){ out.push(pool.splice((Math.random()*pool.length)|0,1)[0]); } return out; }
function renderModChoices(){
  ui.modChoices.innerHTML='';
  for(const m of threeMods()){
    const b=document.createElement('button'); b.className='choice'; b.innerHTML=`<b>${m.title}</b><span>${m.desc}</span>`;
    b.onclick=()=>chooseMod(m); ui.modChoices.appendChild(b);
  }
}
function openLevel(){ if(!running)return; paused=true; renderModChoices(); ui.levelup.classList.add('active'); ui.reroll.classList.toggle('hidden',!meta.owned.shrine||rerolled); }
function chooseMod(m){ mods.add(m.id); if(m.id==='slot') maxSlots++; if(m.id==='ghost') ghostUntil=performance.now()+20000; ui.levelup.classList.remove('active'); paused=false; refreshStack(); toast(m.title); }
ui.reroll.onclick=()=>{rerolled=true;renderModChoices();ui.reroll.classList.add('hidden');};

function nearestSellDistance(){
  let d=Infinity; for(const s of stalls)d=Math.min(d,player.position.distanceTo(s.sellPos)); if(gate)d=Math.min(d,player.position.distanceTo(gate.sellPos)); return d;
}
function sellAll(fromGate=false){
  if(!running||!stack.length)return false;
  const bellTop=stack.at(-1)?.def.id==='bell'; const dist=nearestSellDistance();
  if(dist>(bellTop?6.2:3.0)){ toast('FIND A SELL RING',true); return false; }
  const value=stackValue(); raidGold+=value; let n=0;
  while(stack.length){ stackRoot.remove(stack.pop().mesh); n++; beep(360+n*26,.035,.02); }
  lean=Math.max(0,lean-12); refreshStack(); toast(`SLAM +${value}`); vib(35);
  if(fromGate) endRaid('escaped'); return true;
}
function dropTop(fromGuard=false){
  if(!running||!stack.length)return;
  const e=stack.pop(); stackRoot.remove(e.mesh); refreshStack();
  spawnWorld(e.def,player.position.x+rand(-1,1),player.position.z+rand(-1,1),performance.now()+(fromGuard?1300:2500));
  lean=Math.max(0,lean-5); if(mods.has('dropGold')&&!fromGuard) raidGold+=6; toast(fromGuard?'GUARD TAX':'DE-GREED'); beep(170,.06,.025);
}
function pack(){
  const now=performance.now(), cd=mods.has('pack')?4000:8000; if(now<packReadyAt){toast(`${Math.ceil((packReadyAt-now)/1000)}s`,true);return;}
  packReadyAt=now+cd; lean=Math.max(0,lean-10); toast('PACKED'); beep(250,.07,.03); vib(18);
}
function avalanche(){
  slowUntil=performance.now()+300; toast('AVALANCHE!',true); vib([25,30,60]); beep(95,.18,.04);
  const now=performance.now(); while(stack.length){ const e=stack.pop(); stackRoot.remove(e.mesh); spawnWorld(e.def,player.position.x+rand(-2.5,2.5),player.position.z+rand(-2.5,2.5),now+2500); }
  lean=8; refreshStack();
}

function raidMaxSlots(){ return 6+(meta.owned.hook?1:0); }
function startRaid(){
  ui.start.classList.remove('active');ui.end.classList.remove('active');ui.den.classList.remove('active');ui.levelup.classList.remove('active');ui.hud.classList.remove('hidden');
  running=true;paused=false;raidElapsed=0;raidGold=0;lean=0;maxSlots=raidMaxSlots();packReadyAt=0;ghostUntil=0;guardHitAt=0;catStealAt=0;nextLevel=0;rerolled=false;mods.clear();comboFlags.clear();moveTarget=null;
  player.position.set(0,0,-1);player.rotation.y=0;spawnRaidLoot();
  if(meta.owned.ledger)addCarried(pick(ITEMS.slice(0,5)));
  toast('WALK INTO LOOT'); updateHud();
}
function endRaid(reason){
  if(!running)return; running=false;paused=false; ui.hud.classList.add('hidden');
  const unsold=stackValue(); const cut=reason==='escaped'?0:Math.floor(unsold*.2); const kept=raidGold+cut; bank+=kept; saveBank();
  sessionBest=Math.max(sessionBest,kept); bestRaid=Math.max(bestRaid,kept); saveBest();
  ui.banked.textContent=kept; ui.endEyebrow.textContent=reason==='escaped'?'PAYOUT GATE':'THE TOWER REMEMBERS';
  ui.endTitle.textContent=reason==='escaped'?'GATE SLAM.':`${Math.max(1,Math.round(35-lean))}° FROM GLORY`;
  ui.endCopy.textContent=reason==='escaped'?`You got out with ${kept} gold.`:`Dawn ate the rest. You kept ${kept}.`;
  ui.end.classList.add('active');
}

function showDen(){ ui.end.classList.remove('active');ui.den.classList.add('active');renderDen(); }
function renderDen(){
  ui.stash.textContent=bank; ui.upgrades.innerHTML='';
  for(const up of UPGRADES){
    const owned=!!meta.owned[up.id]; const b=document.createElement('button'); b.className='upgrade'+(owned?' owned':''); b.disabled=owned;
    b.innerHTML=`<b>${up.name} — ${owned?'OWNED':up.cost}</b><small>${up.desc}</small>`;
    b.onclick=()=>{ if(bank<up.cost){toast('NOT ENOUGH GOLD',true);return;} bank-=up.cost;meta.owned[up.id]=true;saveBank();saveMeta();renderDen();beep(480,.09,.03); };
    ui.upgrades.appendChild(b);
  }
}

function updateGuards(dt,now){
  for(const g of guards){
    g.phase+=g.speed*dt*(meta.owned.disguise?.75:1); const x=Math.cos(g.phase)*g.radius,z=Math.sin(g.phase)*g.radius; g.group.position.set(x,0,z); g.group.rotation.y=-g.phase;
    if(running&&now>ghostUntil&&now>guardHitAt&&player.position.distanceTo(g.group.position)<1.25){ guardHitAt=now+2600; if(stack.length){dropTop(true);if(stack.length)dropTop(true);toast('GUARD TAX: TOP 2',true);} }
  }
}
function autoCat(now){
  if(stack.at(-1)?.def.id!=='cat'||now<catStealAt)return; catStealAt=now+4500;
  let best=null,bestD=6.5; for(const w of worldItems){const d=player.position.distanceTo(w.mesh.position);if(d<bestD){best=w;bestD=d;}}
  if(best&&stack.length<maxSlots){ const i=worldItems.indexOf(best); if(i>=0)worldItems.splice(i,1);lootRoot.remove(best.mesh);addCarried(best.def);toast('CAT STOLE IT'); }
}
function cleanupRecovery(now){ for(let i=worldItems.length-1;i>=0;i--){const w=worldItems[i];if(w.recoverUntil&&now>w.recoverUntil){lootRoot.remove(w.mesh);worldItems.splice(i,1);}} }
function pickupContacts(){
  for(let i=worldItems.length-1;i>=0;i--){const w=worldItems[i]; if(stack.length>=maxSlots)break; if(player.position.distanceTo(w.mesh.position)<1.05){worldItems.splice(i,1);lootRoot.remove(w.mesh);addCarried(w.def);} }
}

let lastYaw=0;
function updatePlayer(dt,now){
  const v=new THREE.Vector2((keys.has('d')||keys.has('arrowright')?1:0)-(keys.has('a')||keys.has('arrowleft')?1:0),(keys.has('s')||keys.has('arrowdown')?1:0)-(keys.has('w')||keys.has('arrowup')?1:0));
  v.add(touchVec);
  if(moveTarget&&v.lengthSq()<.02){ const dx=moveTarget.x-player.position.x,dz=moveTarget.z-player.position.z; const d=Math.hypot(dx,dz); if(d>.35)v.set(dx/d,dz/d); else moveTarget=null; }
  if(v.length()>1)v.normalize();
  const moving=v.lengthSq()>.01; const leadBottom=stack[0]?.def.id==='lead'; const bootsBottom=stack[0]?.def.id==='boots';
  let speed=5.2*(leadBottom?.7:1); player.position.x+=v.x*speed*dt;player.position.z+=v.y*speed*dt;
  const r=Math.hypot(player.position.x,player.position.z);if(r>21.2){player.position.x*=21.2/r;player.position.z*=21.2/r;}
  if(moving){
    const yaw=Math.atan2(v.x,v.y); const turn=Math.abs(Math.atan2(Math.sin(yaw-lastYaw),Math.cos(yaw-lastYaw))); player.rotation.y=yaw; lastYaw=yaw;
    let gain=(.68+stackWeight()*.07+turn*.4)*(mods.has('stable')?.75:1)*(leadBottom?.2:1); if(bootsBottom)gain*=.22; lean+=gain*dt;
  }else lean-=dt*(meta.owned.moss?3.4:2.05);
  const cursed=stack.filter(e=>hasTag(e.def,'cursed')&&!e.blessed).length; lean+=cursed*.045*dt;
  lean=clamp(lean,0,35); if(lean>=35)avalanche();
  const sway=lean/35; stackRoot.rotation.z=Math.sin(now*.006)*sway*.33; stackRoot.rotation.x=Math.cos(now*.0045)*sway*.19;
  if(moving)pickupContacts(); autoCat(now);
}

const dawnColor=new THREE.Color(0x193149), nightColor=new THREE.Color(0x071014), tempColor=new THREE.Color();
function updateWorldTime(){
  const p=clamp((raidElapsed-240)/140,0,1); tempColor.copy(nightColor).lerp(dawnColor,p); scene.background.copy(tempColor); scene.fog.color.copy(tempColor);
  if(raidElapsed>=RAID_SECONDS&&raidElapsed<RAID_SECONDS+.1) toast('DAWN. RUN.',true);
}
function updateCamera(){
  const h=stack.length*.55, zoom=1+stack.length*.045; const desired=new THREE.Vector3(player.position.x+10*zoom,10.5+h*.5,player.position.z+11*zoom);
  camera.position.lerp(desired,.08); camera.lookAt(player.position.x,1.3+h*.28,player.position.z);
}
function updateHud(){
  ui.gold.textContent=raidGold;ui.value.textContent=stackValue();ui.stack.textContent=`${stack.length}/${maxSlots}`;ui.best.textContent=Math.max(bestRaid,sessionBest);
  const remain=Math.max(0,RAID_SECONDS+DAWN_GRACE-raidElapsed), min=Math.floor(remain/60),sec=Math.floor(remain%60);ui.time.textContent=`${min}:${String(sec).padStart(2,'0')}`;
  ui.dawnBar.style.width=`${clamp(raidElapsed/RAID_SECONDS*100,0,100)}%`;ui.leanBar.style.width=`${lean/35*100}%`;ui.lean.textContent=`${lean.toFixed(0)}°`;
}

let last=performance.now();
function loop(now){
  requestAnimationFrame(loop); let dt=Math.min(.035,(now-last)/1000);last=now;if(now<slowUntil&&!reducedMotion)dt*=.25;
  updateGuards(dt,now); cleanupRecovery(now);
  if(running&&!paused){raidElapsed+=dt;updatePlayer(dt,now);updateWorldTime();if(raidElapsed>=RAID_SECONDS&&player.position.distanceTo(gate.sellPos)<2.9){sellAll(true);}else if(raidElapsed>=RAID_SECONDS+DAWN_GRACE)endRaid('dawn');}
  updateCamera();updateHud();renderer.render(scene,camera);
}
requestAnimationFrame(loop);

addEventListener('keydown',e=>{const k=e.key.toLowerCase();keys.add(k);if(k==='q')dropTop();if(k===' ') {e.preventDefault();pack();}if(k==='e')sellAll(false);});
addEventListener('keyup',e=>keys.delete(e.key.toLowerCase()));
addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);});

const raycaster=new THREE.Raycaster(), pointer=new THREE.Vector2(), plane=new THREE.Plane(new THREE.Vector3(0,1,0),0), hit=new THREE.Vector3();
renderer.domElement.addEventListener('pointerdown',e=>{if(e.pointerType!=='mouse'||!running)return;pointer.set(e.clientX/innerWidth*2-1,-e.clientY/innerHeight*2+1);raycaster.setFromCamera(pointer,camera);if(raycaster.ray.intersectPlane(plane,hit))moveTarget=hit.clone();});

const stick=$('stick'),knob=$('knob');let stickPointer=null;
function setStick(e){const r=stick.getBoundingClientRect(),cx=r.left+r.width/2,cy=r.top+r.height/2,dx=e.clientX-cx,dy=e.clientY-cy,max=r.width*.32,len=Math.hypot(dx,dy)||1,s=Math.min(1,max/len);dx*=s;dy*=s;knob.style.transform=`translate(${dx}px,${dy}px)`;touchVec.set(dx/max,dy/max);}
stick.addEventListener('pointerdown',e=>{stickPointer=e.pointerId;stick.setPointerCapture(e.pointerId);setStick(e);});
stick.addEventListener('pointermove',e=>{if(e.pointerId===stickPointer)setStick(e);});
function clearStick(e){if(e.pointerId!==stickPointer)return;stickPointer=null;touchVec.set(0,0);knob.style.transform='translate(0,0)';}
stick.addEventListener('pointerup',clearStick);stick.addEventListener('pointercancel',clearStick);

$('dropBtn').onclick=()=>dropTop();$('packBtn').onclick=()=>pack();$('sellBtn').onclick=()=>sellAll(false);
$('startBtn').onclick=startRaid;$('againBtn').onclick=startRaid;$('denBtn').onclick=showDen;$('denRaidBtn').onclick=startRaid;

renderDen(); updateHud();
