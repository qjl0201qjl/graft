(function(){
'use strict';

// ═════════════════════════════════════════════ 基础
const CELL = 8, GW = 80, GH = 45, VW = GW*CELL, VH = GH*CELL;   // VW/VH = 世界像素尺寸
let CW = 640, CH = 360;                                       // 画布尺寸:横屏 640×360,竖屏 360×480
const cv = document.getElementById('cv');
const ctx = cv.getContext('2d', {alpha:false});
ctx.imageSmoothingEnabled = false;
const $ = id => document.getElementById(id);

const clamp = (v,a,b)=> v<a?a:v>b?b:v;
const lerp  = (a,b,t)=> a+(b-a)*t;
function hash(x,y){
  let h = (x*374761393 + y*668265263) | 0;
  h = (h ^ (h>>13)) * 1274126177 | 0;
  return ((h ^ (h>>16)) >>> 0) / 4294967295;
}
function mulberry(a){ return function(){ a|=0; a=a+0x6D2B79F5|0; let t=Math.imul(a^a>>>15,1|a); t=t+Math.imul(t^t>>>7,61|t)^t; return ((t^t>>>14)>>>0)/4294967296; }; }

// 本地存档(隐私模式 / 被禁用时静默失败)
const store = {
  get(k, d){ try { const v = localStorage.getItem('graft.'+k); return v === null ? d : JSON.parse(v); } catch(e){ return d; } },
  set(k, v){ try { localStorage.setItem('graft.'+k, JSON.stringify(v)); } catch(e){} },
};

const IS_TOUCH = (window.matchMedia && matchMedia('(pointer:coarse)').matches) || (navigator.maxTouchPoints > 0 && 'ontouchstart' in window);
function setTouchMode(on){
  document.body.classList.toggle('touch', !!on);
  touchMode = !!on;
  if (typeof applyViewMode === 'function' && vignette) applyViewMode();
  if (state === 'play') document.getElementById('hint').innerHTML = levelHint();
}
let touchMode = false;

// ═════════════════════════════════════════════ 材质:每种都有一个"世界动词"
const MAT = {
  //        硬度  重量   动词
  meat:  {id:1,key:'meat', label:'肉', c:'#ff8fa3', c2:'#d75f78', edge:'#4a1526', w:1.0, hard:1, verb:'基准'},
  grass: {id:2,key:'grass',label:'草', c:'#8be05c', c2:'#4f9e37', edge:'#1b3b11', w:0.4, hard:1, verb:'生长'},
  stone: {id:3,key:'stone',label:'石', c:'#a9aebe', c2:'#6d7283', edge:'#22252e', w:3.0, hard:3, verb:'压重'},
  water: {id:4,key:'water',label:'水', c:'#63d2ff', c2:'#2a8fbf', edge:'#0a2a3c', w:0.3, hard:0, verb:'凝石'},
  fire:  {id:5,key:'fire', label:'火', c:'#ffb02e', c2:'#e0551b', edge:'#401104', w:0.8, hard:3, verb:'焚烧'},
};
const ORDER = ['meat','grass','stone','water','fire'];
const BY_ID = {};
for (const k of ORDER) BY_ID[MAT[k].id] = MAT[k];
function matKey(id){ const m = BY_ID[id]; return m ? m.key : 'meat'; }

const TILE = {EMPTY:0, STONE:1, CRUMBLE:2, LAVA:3, VINE:4, DOOR:5, PLATE:6};
const doorId = new Int8Array(GW*GH).fill(-1);  // 每格属于哪扇门
let doorOpen = {};                              // 门 id -> 是否打开
let plateList = [];                             // 压板
let blockList = [];                             // 掉在地上的物块

// ═════════════════════════════════════════════ 声音
// 总线:音效 → sfx ┐
//       配乐 → mus ┼→ 压缩器 → master → 扬声器
let AC = null, muted = !!store.get('muted', false);
let master = null, sfxBus = null, musBus = null, noiseBuf = null;
function ac(){
  if (!AC) {
    try {
      AC = new (window.AudioContext||window.webkitAudioContext)();
      const comp = AC.createDynamicsCompressor();
      comp.threshold.value = -18; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.2;
      master = AC.createGain(); master.gain.value = muted ? 0 : 0.9;
      sfxBus = AC.createGain(); sfxBus.gain.value = 1;
      musBus = AC.createGain(); musBus.gain.value = 0.55;
      sfxBus.connect(comp); musBus.connect(comp); comp.connect(master); master.connect(AC.destination);
      const len = AC.sampleRate * 0.5;
      noiseBuf = AC.createBuffer(1, len, AC.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i=0;i<len;i++) d[i] = Math.random()*2-1;
    } catch(e){ AC = null; }
  }
  if (AC && AC.state === 'suspended') { AC.resume().catch(()=>{}); }
  return AC;
}
function setMuted(m){
  muted = !!m; store.set('muted', muted);
  if (master) master.gain.setTargetAtTime(muted ? 0 : 0.9, AC.currentTime, 0.03);
  $('btnSound').classList.toggle('muted', muted);
}
function tone(f0,f1,dur,type,vol,delay){
  if (muted) return;
  const a = ac(); if (!a) return;
  const t = a.currentTime + (delay||0);
  const o = a.createOscillator(), g = a.createGain();
  o.type = type||'square';
  o.frequency.setValueAtTime(Math.max(20,f0), t);
  o.frequency.exponentialRampToValueAtTime(Math.max(20,f1), t+dur);
  g.gain.setValueAtTime(vol||0.05, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t+dur);
  o.connect(g); g.connect(sfxBus);
  o.start(t); o.stop(t+dur+0.02);
}
function noise(dur, vol, hp, lp, delay){
  if (muted) return;
  const a = ac(); if (!a || !noiseBuf) return;
  const t = a.currentTime + (delay||0);
  const s = a.createBufferSource(); s.buffer = noiseBuf;
  const f1 = a.createBiquadFilter(); f1.type = 'highpass'; f1.frequency.value = hp||800;
  const f2 = a.createBiquadFilter(); f2.type = 'lowpass';  f2.frequency.value = lp||8000;
  const g = a.createGain();
  g.gain.setValueAtTime(vol||0.05, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t+dur);
  s.connect(f1); f1.connect(f2); f2.connect(g); g.connect(sfxBus);
  s.start(t, Math.random()*0.3); s.stop(t+dur+0.02);
}
function arp(list, gap){
  list.forEach((f,i)=> tone(f, f*1.01, 0.12, 'triangle', 0.05, i*gap/1000));
}
// 每种材质贴上去的声音都不一样
const MAT_SFX = {
  meat:  ()=>{ tone(420,620,0.07,'square',0.045); },
  grass: ()=>{ tone(700,1100,0.05,'triangle',0.05); noise(0.05,0.02,3000,9000); },
  stone: ()=>{ tone(180,120,0.08,'square',0.06); noise(0.06,0.05,400,2400); },
  water: ()=>{ tone(900,1500,0.07,'sine',0.05); tone(1300,900,0.05,'sine',0.03,0.03); },
  fire:  ()=>{ noise(0.16,0.06,1200,6000); tone(300,600,0.08,'sawtooth',0.03); },
};
function vibrate(ms){ try { if (touchMode && navigator.vibrate) navigator.vibrate(ms); } catch(e){} }

// ─────────────────────────────── 程序化配乐
// 16 分音符步进,提前 0.12s 调度,避免主线程卡顿时漏拍
const midi = m => 440*Math.pow(2,(m-69)/12);
const SONGS = {
  violet:{bpm:92,  key:[[45,'m'],[41,'M'],[48,'M'],[43,'M']]},          // Am F C G
  earth: {bpm:84,  key:[[41,'m'],[37,'M'],[39,'M'],[36,'M']]},          // Fm Db Eb C
  ember: {bpm:104, key:[[38,'m'],[46,'M'],[43,'m'],[45,'M']]},          // Dm Bb Gm A
  frost: {bpm:96,  key:[[40,'m'],[48,'M'],[43,'M'],[38,'M']]},          // Em C G D
  fungal:{bpm:88,  key:[[47,'m'],[43,'M'],[38,'M'],[45,'M']]},          // Bm G D A
  dusk:  {bpm:100, key:[[42,'m'],[38,'M'],[45,'M'],[40,'M']]},          // F#m D A E
};
const music = {
  on:false, song:null, step:0, next:0, timer:0, intensity:0, bar:0, seed:1,
  start(name){
    const a = ac(); if (!a) return;
    if (this.song === SONGS[name] && this.on) return;
    this.song = SONGS[name] || SONGS.violet;
    this.on = true; this.step = 0; this.bar = 0; this.next = a.currentTime + 0.1;
    this.seed = (Math.random()*1e9)|0;
    if (!this.timer) this.timer = setInterval(()=> this.tick(), 25);
  },
  stop(){ this.on = false; if (this.timer){ clearInterval(this.timer); this.timer = 0; } },
  tick(){
    if (!this.on || !AC || muted || document.hidden) { if (AC) this.next = AC.currentTime + 0.05; return; }
    const spb = 60/this.song.bpm/4;
    while (this.next < AC.currentTime + 0.12){
      this.play(this.step, this.next, spb);
      this.next += spb; this.step++;
      if (this.step % 16 === 0) this.bar++;
    }
  },
  voice(type, freq, t, dur, vol, cutoff, attack){
    const o = AC.createOscillator(), g = AC.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    let out = o;
    if (cutoff){ const f = AC.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = cutoff; o.connect(f); out = f; }
    const at = attack || 0.005;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t+at);
    g.gain.exponentialRampToValueAtTime(0.0001, t+dur);
    out.connect(g); g.connect(musBus);
    o.start(t); o.stop(t+dur+0.05);
  },
  play(step, t, spb){
    const s = step % 16, barIdx = Math.floor(step/16);
    const [root, q] = this.song.key[barIdx % 4];
    const third = q === 'm' ? 3 : 4;
    const chord = [0, third, 7];
    const lvlB = (barIdx % 16) >= 8;                // B 段:更密的琶音
    const r = hash(barIdx*31 + s, this.seed & 1023);
    // 低音:根音 + 五度
    if (s === 0 || s === 8) this.voice('triangle', midi(root), t, spb*6, 0.11);
    if (s === 6 || s === 14) this.voice('triangle', midi(root + (s===6?7:12)), t, spb*1.6, 0.07);
    // 铺底和弦:每小节一次,慢起
    if (s === 0){
      for (const iv of chord){
        this.voice('sawtooth', midi(root+24+iv), t, spb*15, 0.012, 900, spb*4);
        this.voice('sawtooth', midi(root+24+iv)*1.004, t, spb*15, 0.010, 900, spb*4);
      }
    }
    // 琶音
    const pat = lvlB ? [0,1,2,1,2,3,2,1] : [0,1,2,1];
    const every = lvlB ? 1 : 2;
    if (s % every === 0 && !(s === 12 && r < 0.4)){
      const idx = pat[(s/every) % pat.length];
      const n = root + 36 + (idx === 3 ? 12 : chord[idx]);
      this.voice('square', midi(n), t, spb*0.9, 0.022, 2200);
    }
    // 偶尔的旋律点缀
    if ((s === 3 || s === 11) && r > 0.72){
      this.voice('triangle', midi(root + 48 + chord[(r*3)|0]), t, spb*3, 0.03);
    }
    // 打击乐:有敌人或濒死时加强
    if (this.intensity > 0.3){
      if (s % 4 === 0) this.kick(t, 0.16);
      if (s % 2 === 1) this.hat(t, s % 4 === 3 ? 0.03 : 0.015);
    } else if (s === 0 || s === 10){
      this.hat(t, 0.012);
    }
  },
  kick(t, vol){
    const o = AC.createOscillator(), g = AC.createGain();
    o.frequency.setValueAtTime(130, t); o.frequency.exponentialRampToValueAtTime(42, t+0.12);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t+0.16);
    o.connect(g); g.connect(musBus); o.start(t); o.stop(t+0.2);
  },
  hat(t, vol){
    if (!noiseBuf) return;
    const sN = AC.createBufferSource(); sN.buffer = noiseBuf;
    const f = AC.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 7000;
    const g = AC.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t+0.04);
    sN.connect(f); f.connect(g); g.connect(musBus); sN.start(t, Math.random()*0.4); sN.stop(t+0.06);
  },
};

// ═════════════════════════════════════════════ 输入
const keys = Object.create(null);
let kJump = false, jumpBuf = 0, touchDir = 0;
const mouse = {x:-999, y:-999, inside:false};

function pressJump(){ jumpBuf = 0.13; kJump = true; keys['Space'] = true; }
function releaseJump(){ kJump = false; keys['Space'] = false; }
function jumpHeld(){ return !!keys['Space']; }

addEventListener('keydown', e=>{
  if (e.repeat) { if(['Space','ArrowLeft','ArrowRight'].includes(e.code)) e.preventDefault(); return; }
  keys[e.code] = true;
  if (['Space','ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Tab'].includes(e.code)) e.preventDefault();
  if (state === 'title') { if (e.code === 'Space' || e.code === 'Enter') startGame(false); return; }
  if (state === 'win') return;
  if (menuOpen){ if (e.code === 'Escape' || e.code === 'KeyP') closeMenu(); return; }
  if (e.code === 'KeyZ' || e.code === 'Backspace') { undo(); return; }
  if (editing){
    if (e.code === 'Escape' || e.code === 'KeyE' || e.code === 'Tab' || e.code === 'Enter') closeEditor();
    const n = ['Digit1','Digit2','Digit3','Digit4','Digit5'].indexOf(e.code);
    if (n >= 0) selectMat(ORDER[n]);
    return;
  }
  if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') { pressJump(); }
  if (e.code === 'KeyR') { if (state==='play'||state==='dead') loadLevel(level, true); }
  if (e.code === 'KeyS' || e.code === 'KeyQ') { blockAction(); }
  if (e.code === 'KeyF') { pickBlock(); }
  if (e.code === 'KeyE' || e.code === 'Tab') { if (state === 'play') openEditor(); }
  if (e.code === 'Escape' || e.code === 'KeyP') { if (state === 'play') openMenu(); }
  if (e.code === 'KeyM') { setMuted(!muted); toast(muted?'静音':'有声'); }
  /* @debug-start */
  if (e.code === 'KeyN' && state==='play') { nextLevel(); }
  /* @debug-end */
  const n = ['Digit1','Digit2','Digit3','Digit4','Digit5'].indexOf(e.code);
  if (n >= 0) selectMat(ORDER[n]);
});
addEventListener('keyup', e=>{
  keys[e.code] = false;
  if (e.code==='Space' || e.code==='ArrowUp' || e.code==='KeyW') { if (!jumpTouch) releaseJump(); }
});
addEventListener('blur', ()=>{ for (const k in keys) keys[k] = false; touchDir = 0; kJump = false; });

function toGame(e){
  const r = cv.getBoundingClientRect();
  return { x:(e.clientX-r.left)*(CW/r.width), y:(e.clientY-r.top)*(CH/r.height) };
}
function screenToWorld(e){
  const p = toGame(e);
  return { x:p.x/ZOOM + cam.x, y:p.y/ZOOM + cam.y };
}
cv.addEventListener('pointermove', e=>{
  if (e.pointerType !== 'mouse') return;
  const p = screenToWorld(e);
  mouse.x = p.x; mouse.y = p.y; mouse.inside = true;
});
cv.addEventListener('pointerleave', e=>{ if (e.pointerType === 'mouse'){ mouse.inside = false; mouse.x = mouse.y = -999; } });
cv.addEventListener('contextmenu', e=> e.preventDefault());
cv.addEventListener('pointerdown', e=>{
  if (state !== 'play' || editing) return;
  const p = screenToWorld(e);
  if (e.pointerType === 'mouse'){
    if (touchMode) setTouchMode(false);
    mouse.x = p.x; mouse.y = p.y;
    const i = Math.floor((p.x - P.px)/CELL), j = Math.floor((p.y - P.py)/CELL);
    if (e.button === 0) placeAt(i,j);
    else if (e.button === 2) removeAt(i,j);
    return;
  }
  // 手指:点身体 = 削,点身旁空位 = 贴;容差一格,点歪了吸附到最近的合法格
  if (!touchMode) setTouchMode(true);
  const pick = nearestEditable(p.x, p.y);
  if (!pick) return;
  e.preventDefault();
  if (pick.filled) removeAt(pick.i, pick.j); else placeAt(pick.i, pick.j);
});
cv.addEventListener('wheel', e=>{
  e.preventDefault();
  const i = ORDER.indexOf(P.sel);
  selectMat(ORDER[(i + (e.deltaY>0?1:ORDER.length-1)) % ORDER.length]);
}, {passive:false});

// ─── 触屏手柄
const moveEl = $('move'), knob = moveEl.querySelector('.knob');
const arL = moveEl.querySelector('.ar.l'), arR = moveEl.querySelector('.ar.r');
let movePid = null, jumpTouch = false;
function updMove(e){
  const r = moveEl.getBoundingClientRect();
  const dx = e.clientX - (r.left + r.width/2);
  const dead = r.width*0.08;
  touchDir = dx > dead ? 1 : dx < -dead ? -1 : 0;
  const kx = clamp(dx, -r.width/2+22, r.width/2-22);
  knob.style.transform = 'translateX('+kx.toFixed(1)+'px)';
  arL.classList.toggle('lit', touchDir < 0);
  arR.classList.toggle('lit', touchDir > 0);
}
function endMove(){
  movePid = null; touchDir = 0; knob.style.transform = '';
  arL.classList.remove('lit'); arR.classList.remove('lit');
}
moveEl.addEventListener('pointerdown', e=>{
  e.preventDefault(); ac();
  movePid = e.pointerId; try { moveEl.setPointerCapture(e.pointerId); } catch(_){}
  updMove(e);
});
moveEl.addEventListener('pointermove', e=>{ if (e.pointerId === movePid) updMove(e); });
moveEl.addEventListener('pointerup', e=>{ if (e.pointerId === movePid) endMove(); });
moveEl.addEventListener('pointercancel', e=>{ if (e.pointerId === movePid) endMove(); });
moveEl.addEventListener('lostpointercapture', e=>{ if (e.pointerId === movePid) endMove(); });

const jBtn = $('btnJump');
jBtn.addEventListener('pointerdown', e=>{
  e.preventDefault(); ac();
  try { jBtn.setPointerCapture(e.pointerId); } catch(_){}
  jumpTouch = true; jBtn.classList.add('down');
  if (state === 'play' && !editing) pressJump();
});
const jEnd = ()=>{ if (!jumpTouch) return; jumpTouch = false; jBtn.classList.remove('down'); releaseJump(); };
jBtn.addEventListener('pointerup', jEnd);
jBtn.addEventListener('pointercancel', jEnd);
jBtn.addEventListener('lostpointercapture', jEnd);

const uBtn = $('btnUndo');
uBtn.addEventListener('pointerdown', e=>{ e.preventDefault(); ac(); if (!editing && !menuOpen) undo(); });
$('edUndo').addEventListener('click', ()=> undo());
const eBtn = $('btnEdit');
eBtn.addEventListener('pointerdown', e=>{
  e.preventDefault(); ac(); eBtn.classList.add('down');
  if (state !== 'play') return;
  if (editing) closeEditor(); else openEditor();
});
eBtn.addEventListener('pointerup', ()=> eBtn.classList.remove('down'));
eBtn.addEventListener('pointercancel', ()=> eBtn.classList.remove('down'));

// 放/拿:手边有石块就捡,没有就把选中材料放在脚下(压板关卡的手机入口)
const dBtn = $('btnDrop');
if (dBtn) {
  dBtn.addEventListener('pointerdown', e=>{
    e.preventDefault(); ac(); dBtn.classList.add('down');
    blockAction();
  });
  dBtn.addEventListener('pointerup', ()=> dBtn.classList.remove('down'));
  dBtn.addEventListener('pointercancel', ()=> dBtn.classList.remove('down'));
}

// 第一次真实触摸时切到触屏模式;用鼠标点画面时切回来
addEventListener('touchstart', ()=>{ if (!touchMode) setTouchMode(true); }, {passive:true});
// iOS:禁止双指缩放和双击放大
document.addEventListener('gesturestart', e=> e.preventDefault());
document.addEventListener('dblclick', e=> e.preventDefault());

$('btnSound').addEventListener('click', ()=>{ ac(); setMuted(!muted); });
const fullBtn = $('btnFull');
const canFull = !!(document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen);
if (!canFull) fullBtn.classList.add('hide');
fullBtn.addEventListener('click', ()=>{
  const d = document, el = d.documentElement;
  if (d.fullscreenElement || d.webkitFullscreenElement){
    (d.exitFullscreen || d.webkitExitFullscreen).call(d);
  } else {
    const p = (el.requestFullscreen || el.webkitRequestFullscreen).call(el);
    if (p && p.then) p.then(()=>{ try { screen.orientation.lock('landscape').catch(()=>{}); } catch(e){} }).catch(()=>{});
  }
});

// ═════════════════════════════════════════════ 地图
const grid = new Uint8Array(GW*GH);
let tilesDirty = true;
function gt(x,y){ if (x<0||y<0||x>=GW||y>=GH) return TILE.STONE; return grid[y*GW+x]; }
function setT(x,y,v){ if (x<0||y<0||x>=GW||y>=GH) return; grid[y*GW+x] = v; tilesDirty = true; }
function solidAt(x,y){
  const t = gt(x,y);
  if (t===TILE.STONE || t===TILE.CRUMBLE || t===TILE.VINE || t===TILE.PLATE) return true;
  if (t===TILE.DOOR) return !doorOpen[doorId[y*GW+x]];
  return false;
}
// 门 / 压板 / 脆地板共用的"脚下那一格"
function feetTile(rect){
  const y = Math.floor((rect.y + rect.h) / CELL);
  return { x0: Math.floor(rect.x/CELL), x1: Math.floor((rect.x+rect.w-0.001)/CELL), y };
}
function boxSolid(px,py,w,h){
  if (w<=0||h<=0) return false;
  const x0 = Math.floor(px/CELL), x1 = Math.floor((px+w-0.001)/CELL);
  const y0 = Math.floor(py/CELL), y1 = Math.floor((py+h-0.001)/CELL);
  for (let y=y0;y<=y1;y++) for (let x=x0;x<=x1;x++) if (solidAt(x,y)) return true;
  return false;
}
function tileAtPoint(px,py){ return gt(Math.floor(px/CELL), Math.floor(py/CELL)); }

// ═════════════════════════════════════════════ 主题(每关一套配色 + 配乐)
const THEMES = {
  violet:{ bg:['#0e0c17','#0b0a12','#07060b'], glow:'92,68,160', far:'24,19,37', mid:'17,13,28',
           rock:['#2e2b39','#2a2734','#33303f'], top:['#4a4659','#5b566d'], under:'#191720', sideL:'#3a3748', sideR:'#1d1a26',
           moss:['#3f8f73','#62c79a'], crystal:'#b58cff', mush:'#8be0ff', spore:'#b9a6ff', amb:0.50 },
  earth: { bg:['#130f0c','#0e0b09','#080605'], glow:'150,96,52', far:'36,26,18', mid:'26,19,13',
           rock:['#35302b','#302b27','#3b352f'], top:['#56493d','#6a5a49'], under:'#1b1714', sideL:'#433a32', sideR:'#211c18',
           moss:['#6e7f3a','#9cb04c'], crystal:'#ffb35c', mush:'#ffd27a', spore:'#e8c08a', amb:0.52 },
  ember: { bg:['#170b0b','#110809','#090405'], glow:'200,60,30', far:'40,16,14', mid:'28,11,10',
           rock:['#33262a','#2d2125','#3a2b2f'], top:['#58404a','#6c4e57'], under:'#1b1215', sideL:'#45323a', sideR:'#21171a',
           moss:['#8a3b2a','#c9643a'], crystal:'#ff7a4a', mush:'#ffb25e', spore:'#ff9b6b', amb:0.44 },
  frost: { bg:['#0b1018','#080c13','#05070b'], glow:'60,110,170', far:'16,24,38', mid:'11,17,28',
           rock:['#2a3140','#262c3a','#303849'], top:['#46546b','#5a6c86'], under:'#161b25', sideL:'#36404f', sideR:'#1a1f29',
           moss:['#3b7f95','#5ec8e0'], crystal:'#8fe3ff', mush:'#c6f4ff', spore:'#a6d8ff', amb:0.50 },
  fungal:{ bg:['#0b120e','#08100c','#050906'], glow:'60,150,90', far:'16,32,22', mid:'11,23,16',
           rock:['#29322d','#252d29','#2f3a34'], top:['#435a4c','#56725f'], under:'#151c18', sideL:'#34433a', sideR:'#19201c',
           moss:['#4c9a3c','#86d65a'], crystal:'#a6ff7a', mush:'#ff8ad8', spore:'#c8ff9a', amb:0.52 },
  dusk:  { bg:['#120c18','#0d0912','#07050a'], glow:'190,120,200', far:'34,20,40', mid:'24,14,29',
           rock:['#30293a','#2b2534','#372f42'], top:['#54475f','#6a5a77'], under:'#1a1520', sideL:'#40364b', sideR:'#1e1924',
           moss:['#8a5fb0','#d7a8ff'], crystal:'#ffd36b', mush:'#ff9ecf', spore:'#ffd9a6', amb:0.48 },
};
let TH = THEMES.violet, themeName = 'violet';

// ═════════════════════════════════════════════ 关卡
﻿const LEVELS = [
  // ══════════ 教学:一关只教一件事 ══════════
  {
    name:'教学 1 · 削薄', sub:'削掉一层', theme:'violet',
    hint:'<b>右键</b>削掉身上的格子 —— 墙缝只有一格高,你得先把自己削掉一层',
    hintTouch:'点自己身体削掉格子 —— 墙缝只有一格高,先把自己削薄',
    start:[6,37],
    rects:[
      {x:0,y:40,w:80,h:4,t:'stone'},
      {x:0,y:22,w:80,h:2,t:'stone'},
      {x:24,y:25,w:2,h:13,t:'stone'},
      {x:40,y:25,w:2,h:14,t:'stone'},
      {x:52,y:25,w:19,h:14,t:'stone'},
    ],
    items:[ {c:[12,38],m:'meat'}, {c:[18,38],m:'grass'}, {c:[32,38],m:'meat'}, {c:[46,38],m:'meat'} ],
    enemies:[],
    exit:[74,37,3,3],
  },
  {
    name:'教学 2 · 搭桥', sub:'草会自己长', theme:'fungal',
    hint:'<b>草</b>会自己长。削扁钻过矮洞,再让草把你摊长 —— 身体够长,就能架在沟上',
    hintTouch:'草会自己长。削扁钻过矮洞,再让草把你摊长,架在沟上走过去',
    start:[6,37],
    rects:[
      {x:0,y:40,w:29,h:4,t:'stone'},
      {x:34,y:40,w:46,h:4,t:'stone'},
      {x:0,y:22,w:80,h:2,t:'stone'},
      {x:26,y:38,w:12,h:1,t:'stone'},
      {x:29,y:41,w:5,h:3,t:'lava'},
    ],
    items:[ {c:[12,38],m:'grass'},{c:[15,38],m:'grass'},{c:[18,38],m:'grass'},{c:[21,38],m:'grass'},{c:[24,38],m:'grass'} ],
    enemies:[],
    exit:[70,37,3,3],
  },
  {
    name:'教学 3 · 压板', sub:'石头替你踩着', theme:'earth',
    hint:'压板压得住才开门,你一走开它就关上。试试按 <b>S</b> 把<b>石头</b>放在板上',
    hintTouch:'站上去门会开,走开就关。按 <b>放</b> 把石头留在板上',
    start:[6,37],
    rects:[
      {x:0,y:40,w:80,h:4,t:'stone'},
      {x:0,y:22,w:80,h:2,t:'stone'},
      {x:30,y:25,w:2,h:11,t:'stone'},
    ],
    doors:[ {x:30,y:36,w:2,h:4,id:0} ],
    plates:[ {x:16,y:40,w:3,id:0,need:2.5} ],
    items:[ {c:[6,38],m:'stone'},{c:[9,38],m:'stone'},{c:[12,38],m:'meat'} ],
    enemies:[],
    exit:[70,37,3,3],
  },
  {
    name:'教学 4 · 压碎', sub:'重量分级', theme:'earth',
    hint:'够重,脆地板会整片塌下去。塌完空间变窄 —— 记得再把自己削薄',
    hintTouch:'够重,脆地板整片塌。塌完空间变窄,记得再削薄',
    start:[6,37],
    rects:[
      {x:0,y:40,w:44,h:1,t:'stone'},
      {x:44,y:40,w:8,h:1,t:'crumble'},
      {x:52,y:40,w:28,h:1,t:'stone'},
      {x:0,y:22,w:80,h:2,t:'stone'},
      {x:50,y:41,w:20,h:2,t:'stone'},
    ],
    items:[ {c:[20,39],m:'stone'},{c:[24,39],m:'stone'},{c:[36,38],m:'meat'} ],
    enemies:[],
    exit:[70,41,3,3],
  },
  {
    name:'教学 5 · 凝石', sub:'一格水换一格桥', theme:'ember',
    hint:'水碰到岩浆,会把它凝成石头,自己就没了。<b>一格水换一格桥</b> —— 数好再走',
    hintTouch:'水碰到岩浆会把它凝成石头,自己消失。一格水换一格桥',
    start:[6,37],
    rects:[
      {x:0,y:40,w:28,h:4,t:'stone'},
      {x:28,y:40,w:6,h:1,t:'lava'},
      {x:28,y:41,w:6,h:3,t:'stone'},
      {x:34,y:40,w:46,h:4,t:'stone'},
      {x:0,y:22,w:80,h:2,t:'stone'},
    ],
    items:[ {c:[12,38],m:'water'},{c:[14,38],m:'water'},{c:[16,38],m:'water'},
            {c:[18,38],m:'water'},{c:[20,38],m:'water'},{c:[22,38],m:'water'} ],
    enemies:[],
    exit:[70,37,3,3],
  },
  {
    name:'教学 6 · 焚烧', sub:'整面墙烧穿', theme:'ember',
    hint:'藤蔓怕火。贴一格<b>火</b>上去,整面墙会顺着烧穿 —— 但火也会啃你自己',
    hintTouch:'藤蔓怕火。贴一格火上去,整面墙顺着烧穿',
    start:[6,37],
    rects:[
      {x:0,y:40,w:80,h:4,t:'stone'},
      {x:0,y:22,w:80,h:2,t:'stone'},
    ],
    vines:[ {x:34,y:24,w:3,h:16} ],
    items:[ {c:[12,38],m:'fire'},{c:[15,38],m:'fire'},{c:[18,38],m:'meat'},{c:[44,38],m:'meat'} ],
    enemies:[],
    exit:[70,37,3,3],
  },
  // ══════════ 组合 ══════════
  {
    name:'组合 1 · 一石二鸟', sub:'压板 + 搭桥', theme:'dusk',
    hint:'先让石头替你踩住压板,再把自己摊平摊长 —— 门和沟,一样一样来',
    hintTouch:'先让石头压住板,再把自己摊长架过沟',
    start:[6,37],
    rects:[
      {x:0,y:40,w:32,h:4,t:'stone'},
      {x:38,y:40,w:42,h:4,t:'stone'},
      {x:0,y:22,w:80,h:2,t:'stone'},
      {x:20,y:25,w:2,h:11,t:'stone'},
      {x:30,y:38,w:12,h:1,t:'stone'},
      {x:32,y:41,w:6,h:3,t:'lava'},
    ],
    doors:[ {x:20,y:36,w:2,h:4,id:0} ],
    plates:[ {x:10,y:40,w:3,id:0,need:2.5} ],
    items:[ {c:[4,38],m:'stone'},{c:[6,38],m:'stone'},
            {c:[24,38],m:'grass'},{c:[26,38],m:'grass'},{c:[28,38],m:'grass'} ],
    enemies:[],
    exit:[70,37,3,3],
  },
  {
    name:'终关 · 四件事', sub:'薄 · 长 · 重 · 水 · 火', theme:'dusk',
    hint:'薄、长、重、水、火 —— 你现在有的全部。慢慢来',
    hintTouch:'薄、长、重、水、火 —— 全部用上',
    start:[6,37],
    rects:[
      {x:0,y:40,w:80,h:4,t:'stone'},
      {x:0,y:22,w:80,h:2,t:'stone'},
      {x:14,y:25,w:10,h:14,t:'stone'},
      {x:28,y:40,w:5,h:1,t:'lava'},
      {x:28,y:41,w:5,h:3,t:'stone'},
      {x:56,y:25,w:2,h:11,t:'stone'},
    ],
    doors:[ {x:56,y:36,w:2,h:4,id:0} ],
    plates:[ {x:50,y:40,w:3,id:0,need:2.5} ],
    vines:[ {x:38,y:24,w:3,h:16} ],
    items:[ {c:[24,38],m:'water'},{c:[25,38],m:'water'},{c:[26,38],m:'water'},
            {c:[27,38],m:'water'},{c:[28,38],m:'water'},
            {c:[33,38],m:'fire'},{c:[34,38],m:'fire'},
            {c:[46,38],m:'stone'},{c:[47,38],m:'stone'} ],
    enemies:[],
    exit:[72,37,3,3],
  },
];
function levelHint(){
  const L = LEVELS[level]; if (!L) return '';
  return (touchMode && L.hintTouch) ? L.hintTouch : (L.hint || '');
}

// ═════════════════════════════════════════════ 玩家
const MW = 8, MH = 8;
const P = {
  px:0, py:0,
  mask: new Uint8Array(MW*MH),
  pop: new Float32Array(MW*MH),       // 每格贴上时的弹跳动画
  vx:0, vy:0, onGround:false, coyote:0, face:1,
  bag:{meat:0,grass:0,stone:0,water:0,fire:0},
  sel:'stone',
  invuln:0, denyT:0, flash:0, shake:0,
  eyeT:0, blink:0,
  regenT:0, burnT:0, evapT:0, lavaT:0, crumbleT:0,
  bornT:0,
  sx:1, sy:1, svx:0, svy:0,           // 挤压拉伸(弹簧)
  dustT:0, airT:0, lastVy:0, beatT:0, hurtFace:0,
  kbT:0, kbV:0,                       // 击退:短时间内覆盖输入
};

const GRAV = 1180;

function bounds(){
  let i0=MW,i1=-1,j0=MH,j1=-1,n=0;
  for (let j=0;j<MH;j++) for (let i=0;i<MW;i++){
    if (P.mask[j*MW+i]) { n++; if(i<i0)i0=i; if(i>i1)i1=i; if(j<j0)j0=j; if(j>j1)j1=j; }
  }
  if (n===0) return {i0:0,i1:0,j0:0,j1:0,w:0,h:0,x:P.px,y:P.py,n:0,empty:true};
  return {i0,i1,j0,j1, x:P.px+i0*CELL, y:P.py+j0*CELL,
          w:(i1-i0+1)*CELL, h:(j1-j0+1)*CELL, n, empty:false};
}
function weight(){
  let s=0;
  for (let k=0;k<MW*MH;k++) if (P.mask[k]) s += BY_ID[P.mask[k]].w;
  return s;
}
function moveSpeed(){ return Math.max(62, 118 - Math.max(0, weight()-6)*1.9); }
function jumpPower(){
  const h = clamp(64 - Math.max(0, weight()-6)*2.3, 16, 66);
  return Math.sqrt(2*GRAV*h);
}

function spawnPlayer(sx,sy){
  P.mask.fill(0); P.pop.fill(0);
  for (let j=0;j<3;j++) for (let i=0;i<3;i++) P.mask[(2+j)*MW+(2+i)] = MAT.meat.id;
  P.px = sx*CELL - 2*CELL;
  P.py = sy*CELL - 2*CELL;
  P.vx = P.vy = 0; P.onGround = false; P.coyote = 0; P.face = 1;
  P.invuln = 0; P.denyT = 0; P.flash = 0; P.crumbleT = 0; P.bornT = 0.5;
  P.regenT = 0; P.burnT = 0; P.evapT = 0; P.lavaT = 0; P.shake = 0;
  P.sx = P.sy = 1; P.svx = P.svy = 0; P.airT = 0; P.hurtFace = 0; P.kbT = 0; P.kbV = 0;
}
function squash(sx, sy){ P.sx = sx; P.sy = sy; }

function tryMoveX(dist){
  const b = bounds(); if (b.empty) return false;
  let x = b.x, y = b.y, w = b.w, h = b.h;
  const steps = Math.max(1, Math.ceil(Math.abs(dist)));
  const st = dist/steps;
  let blocked = false;
  for (let s=0;s<steps;s++){
    if (boxSolid(x+st, y, w, h)) { blocked = true; break; }
    x += st;
  }
  if (blocked){
    // 撞墙时把身体那一侧吸附到格子边界,消除亚像素误差
    const edge = st > 0 ? (x + w) : x;
    const snap = (st > 0 ? Math.ceil(edge/CELL) : Math.floor(edge/CELL)) * CELL;
    const d = snap - edge;
    if (Math.abs(d) > 1e-4 && Math.abs(d) < CELL && !boxSolid(x+d, y, w, h)) x += d;
  }
  P.px += (x - b.x);
  return !blocked;
}
function tryMoveY(dist){
  const b = bounds(); if (b.empty) return false;
  let x = b.x, y = b.y, w = b.w, h = b.h;
  const steps = Math.max(1, Math.ceil(Math.abs(dist)));
  const st = dist/steps;
  let blocked = false;
  for (let s=0;s<steps;s++){
    if (boxSolid(x, y+st, w, h)) { blocked = true; break; }
    y += st;
  }
  if (blocked){
    const edge = st > 0 ? (y + h) : y;
    const snap = (st > 0 ? Math.ceil(edge/CELL) : Math.floor(edge/CELL)) * CELL;
    const d = snap - edge;
    if (Math.abs(d) > 1e-4 && Math.abs(d) < CELL && !boxSolid(x, y+d, w, h)) y += d;
  }
  P.py += (y - b.y);
  return !blocked;
}

function cellWorld(i,j){ return {x:P.px+i*CELL, y:P.py+j*CELL}; }

function canPlace(i,j){
  if (i<0||j<0||i>=MW||j>=MH) return false;
  if (P.mask[j*MW+i]) return false;
  const nb = [[1,0],[-1,0],[0,1],[0,-1]];
  let adj = false;
  for (const [dx,dy] of nb){
    const ni=i+dx, nj=j+dy;
    if (ni>=0&&nj>=0&&ni<MW&&nj<MH&&P.mask[nj*MW+ni]) { adj = true; break; }
  }
  if (!adj) return false;
  P.mask[j*MW+i] = 1;
  const b = bounds();
  const ok = !boxSolid(b.x, b.y, b.w, b.h);
  P.mask[j*MW+i] = 0;
  return ok;
}
// 只看邻接,不看墙(给改造面板画"被墙挡住")
function adjacentToBody(i,j){
  if (i<0||j<0||i>=MW||j>=MH || P.mask[j*MW+i]) return false;
  return (i>0&&P.mask[j*MW+i-1]) || (i<MW-1&&P.mask[j*MW+i+1]) || (j>0&&P.mask[(j-1)*MW+i]) || (j<MH-1&&P.mask[(j+1)*MW+i]);
}

function connectedWithout(i,j){
  const key = j*MW+i;
  let start = -1, n = 0;
  for (let k=0;k<MW*MH;k++){
    if (k===key || !P.mask[k]) continue;
    n++; if (start<0) start = k;
  }
  if (n===0) return false;
  const seen = new Uint8Array(MW*MH);
  const q = [start]; seen[start] = 1; let c = 0;
  while (q.length){
    const k = q.pop(); c++;
    const ki = k%MW, kj = (k/MW)|0;
    const nb = [[1,0],[-1,0],[0,1],[0,-1]];
    for (const [dx,dy] of nb){
      const ni=ki+dx, nj=kj+dy;
      if (ni<0||nj<0||ni>=MW||nj>=MH) continue;
      const nk = nj*MW+ni;
      if (nk===key || seen[nk] || !P.mask[nk]) continue;
      seen[nk] = 1; q.push(nk);
    }
  }
  return c === n;
}

// ═════════════════════════════════════════════ 粒子 / 碎块 / 掉落
let particles = [], items = [], enemies = [], floaters = [], drips = [];
let MAX_PARTICLES = 420;
function burst(x,y,color,n,spd,size){
  for (let i=0;i<n;i++){
    if (particles.length > MAX_PARTICLES) particles.shift();
    const a = Math.random()*Math.PI*2, s = spd*(0.35+Math.random());
    particles.push({x,y,vx:Math.cos(a)*s, vy:Math.sin(a)*s - 30,
      life:0.3+Math.random()*0.45, max:0.75, c:color, s:size||2, g:340});
  }
}
// 一整格飞出去的碎块:带描边、会弹
function chunk(x,y,m,vx,vy){
  if (particles.length > MAX_PARTICLES) particles.shift();
  particles.push({x:x-3,y:y-3,vx:vx+(Math.random()-0.5)*60,vy:vy-60-Math.random()*80,
    life:0.7+Math.random()*0.4,max:1.1,c:m.c,c2:m.edge,s:6,g:620,chunk:true});
}
function dust(x,y,dir,n){
  for (let i=0;i<n;i++){
    if (particles.length > MAX_PARTICLES) particles.shift();
    particles.push({x:x+(Math.random()-0.5)*4,y:y-1,vx:dir*(20+Math.random()*50)+(Math.random()-0.5)*20,vy:-10-Math.random()*25,
      life:0.25+Math.random()*0.25,max:0.5,c:'rgba(160,150,180,0.55)',s:Math.random()<0.3?2:1,g:-20,soft:true});
  }
}
function ember(x,y,c){
  if (particles.length > MAX_PARTICLES) return;
  particles.push({x,y,vx:(Math.random()-0.5)*14,vy:-20-Math.random()*30,life:0.6+Math.random()*0.6,max:1.2,c:c||'#ffb02e',s:1,g:-40,soft:true,glow:true});
}
function addItem(x,y,mat){
  items.push({x,y,mat,t:Math.random()*6, vy:-40, vx:(Math.random()-0.5)*40});
}
function floater(x,y,text,color){
  floaters.push({x,y,text,c:color||'#fff',t:0});
}
function toast(t){
  const el = $('toast');
  el.textContent = t; el.style.opacity = 1;
  clearTimeout(toast._t); toast._t = setTimeout(()=> el.style.opacity = 0, 900);
}
function showCard(name, sub){
  const el = $('card');
  el.querySelector('.cn').textContent = name;
  el.querySelector('.cs').textContent = sub || '';
  el.classList.add('show');
  clearTimeout(showCard._t); showCard._t = setTimeout(()=> el.classList.remove('show'), 1700);
}

// ═════════════════════════════════════════════ 关卡装载
let level = 0, state = 'title', timer = 0, exitLocked = false, cleared = false, editing = false;
let shake = 0, shakeX = 0, shakeY = 0, freeze = 0, time = 0, levelT = 0;
const stats = { deaths: 0, start: 0 };

function loadLevel(idx, retry){
  level = clamp(idx, 0, LEVELS.length-1);
  const L = LEVELS[level];
  themeName = L.theme || 'violet'; TH = THEMES[themeName];
  grid.fill(0);
  doorId.fill(-1);
  doorOpen = {};
  plateList = [];
  blockList = [];
  for (let x=1;x<GW-1;x++){ setT(x,0,TILE.STONE); setT(x,GH-1,TILE.STONE); }
  for (let y=1;y<GH-1;y++){ setT(0,y,TILE.STONE); setT(GW-1,y,TILE.STONE); }
  for (const r of (L.rects||[])){
    const t = r.t==='crumble'?TILE.CRUMBLE : r.t==='lava'?TILE.LAVA : TILE.STONE;
    for (let y=r.y;y<r.y+r.h;y++) for (let x=r.x;x<r.x+r.w;x++) setT(x,y,t);
  }
  // 藤蔓
  for (const v of (L.vines||[])){
    for (let y=v.y;y<v.y+v.h;y++) for (let x=v.x;x<v.x+v.w;x++) setT(x,y,TILE.VINE);
  }
  // 压板(铺在地板那一格上,玩家站上去就压)
  for (const pl of (L.plates||[])){
    for (let x=pl.x;x<pl.x+pl.w;x++) setT(x,pl.y,TILE.PLATE);
    plateList.push({ x0:pl.x, x1:pl.x+pl.w-1, y:pl.y, id:pl.id, need:pl.need||2.5, load:0, pressed:false });
    doorOpen[pl.id] = false;
  }
  // 门
  for (const d of (L.doors||[])){
    for (let y=d.y;y<d.y+d.h;y++) for (let x=d.x;x<d.x+d.w;x++){
      setT(x,y,TILE.DOOR);
      doorId[y*GW+x] = d.id;
    }
    if (!(d.id in doorOpen)) doorOpen[d.id] = false;
  }
  spawnPlayer(L.start[0], L.start[1]);
  P.bag = {meat:0,grass:0,stone:0,water:0,fire:0};
  P.sel = 'stone';
  items = []; enemies = []; particles = []; floaters = []; drips = []; hist = []; tut = 0; tutCuts = 0;
  for (const it of (L.items||[])) addItem(it.c[0]*CELL+4, it.c[1]*CELL+4, it.m);
  for (const b of (L.blocks||[])){
    blockList.push({ x:b.c[0]*CELL+2, y:b.c[1]*CELL+2, w:6, h:6, mat:b.m, vy:0 });
  }
  for (const e of (L.enemies||[])){
    const w = e.w*CELL, h = e.h*CELL;
    const hp = e.hp || (e.big?18:6);
    enemies.push({
      x:e.c[0]*CELL, y:e.c[1]*CELL, w, h, hp, maxhp:hp,
      mat:e.m, hard:MAT[e.m].hard, speed:e.speed||40,
      vx:0, vy:0, onGround:false, cd:0, flash:0, big:!!e.big,
      born:0.35, wind:0, sq:1, eyeOff:Math.random()*6, inv:0,
    });
  }
  exitLocked = !!L.lock;
  cleared = false;
  closeEditor(true);
  buildLevelArt(level*3.7+1.3);
  camSnap();
  state = 'play';
  timer = 0; shake = 0; freeze = 0; levelT = 0;
  $('lv').textContent = String(level+1).padStart(2,'0') + ' / ' + String(LEVELS.length).padStart(2,'0');
  $('hint').innerHTML = levelHint();
  syncBag(); syncUndo();
  if (!retry){
    if (level > store.get('unlocked', 0)) store.set('unlocked', level);
    showCard(L.name, L.sub);
    if (level > store.get('best', 0)) store.set('best', level);
  }
  if (AC) music.start(themeName);
}

function nextLevel(){
  if (level+1 >= LEVELS.length){
    state = 'win';
    document.body.classList.add('menu');
    store.set('best', 0);
    const secs = Math.round((performance.now() - stats.start)/1000);
    const ov = $('overlay');
    ov.classList.remove('hide');
    ov.querySelector('.logo').textContent = '通　关';
    ov.querySelector('.logo').classList.add('small');
    ov.querySelector('.sub').textContent = '你把自己捏成了想要的样子';
    $('btnStart').textContent = '再玩一次';
    $('btnCont').classList.add('hide');
    const k = ov.querySelectorAll('.keys');
    k.forEach(el => el.textContent = '');
    k[0].textContent = '用时 ' + Math.floor(secs/60) + ' 分 ' + (secs%60) + ' 秒　·　散架 ' + stats.deaths + ' 次';
    k[1].textContent = k[0].textContent;
    arp([523,659,784,1046,1318], 110);
    return;
  }
  state = 'clear'; timer = 0;
  closeEditor(true);
  arp([523,659,784,1046], 70);
  const b = bounds();
  for (let i=0;i<14;i++) burst(b.x+b.w/2, b.y+b.h/2, '#cbb6ff', 1, 120, 2);
}

// ═════════════════════════════════════════════ HUD
const chips = {}, edChips = {};
function makeChips(container, store_){
  for (const k of ORDER){
    const el = document.createElement('div');
    el.className = 'chip';
    const sw = document.createElement('i'); sw.style.background = MAT[k].c; sw.style.color = MAT[k].c;
    const lb = document.createElement('small'); lb.textContent = MAT[k].label;
    const ct = document.createElement('b'); ct.textContent = '0';
    el.append(sw, lb, ct);
    el.addEventListener('pointerdown', ev=>{ ev.preventDefault(); ev.stopPropagation(); selectMat(k); });
    container.appendChild(el);
    store_[k] = el;
  }
}
makeChips($('bag'), chips);
makeChips($('edBag'), edChips);
function selectMat(k){ if (!MAT[k]) return; P.sel = k; syncBag(); tone(700,760,0.04,'square',0.03); }
function ensureSel(prefer){
  if (P.bag[P.sel] > 0) return;
  if (prefer && P.bag[prefer] > 0) { P.sel = prefer; return; }
  for (const k of ORDER) if (P.bag[k] > 0) { P.sel = k; return; }
}
let lastBag = {};
function syncBag(){
  for (const k of ORDER){
    for (const set of [chips, edChips]){
      const el = set[k];
      el.querySelector('b').textContent = P.bag[k];
      el.classList.toggle('on', P.sel === k);
      el.classList.toggle('zero', P.bag[k] <= 0);
    }
    if (lastBag[k] !== undefined && P.bag[k] > lastBag[k]){
      const el = chips[k]; el.classList.add('bump');
      setTimeout(()=> el.classList.remove('bump'), 110);
    }
    lastBag[k] = P.bag[k];
  }
}

// ═════════════════════════════════════════════ 编辑身体
let hist = [];
function pushHist(op){ hist.push(op); if (hist.length > 40) hist.shift(); syncUndo(); }
function syncUndo(){
  const has = hist.length > 0 && state === 'play';
  const b1 = $('btnUndo'), b2 = $('edUndo');
  if (b1) b1.classList.toggle('off', !has);
  if (b2) b2.disabled = !has;
}
function undo(){
  if (state !== 'play') return;
  while (hist.length){
    const op = hist.pop(), k = op.j*MW + op.i, m = MAT[op.m];
    let ok = false;
    if (op.t === 'p'){            // 撤销"贴":把那一格削回背包
      if (P.mask[k] === m.id && connectedWithout(op.i, op.j)){ P.mask[k] = 0; P.bag[op.m]++; ok = true; }
    } else {                      // 撤销"削":把那一格贴回去
      if (P.bag[op.m] > 0 && canPlace(op.i, op.j)){ P.mask[k] = m.id; P.pop[k] = 1; P.bag[op.m]--; ok = true; }
    }
    if (ok){
      const w = cellWorld(op.i, op.j);
      burst(w.x+4, w.y+4, m.c, 4, 50, 1);
      tone(600, 420, 0.06, 'triangle', 0.04);
      syncBag(); syncUndo(); return true;
    }
  }
  toast('没有可以撤销的了'); deny(); syncUndo(); return false;
}
function deny(){ P.denyT = 0.3; tone(140,110,0.06,'square',0.04); }
function placeAt(i,j){
  if (i<0||j<0||i>=MW||j>=MH || P.mask[j*MW+i]) return false;
  if (P.bag[P.sel] <= 0) { deny(); toast('没有'+MAT[P.sel].label+'了'); return false; }
  if (!canPlace(i,j)) { deny(); return false; }
  pushHist({t:'p', i, j, m:P.sel});
  P.mask[j*MW+i] = MAT[P.sel].id;
  P.pop[j*MW+i] = 1;
  P.bag[P.sel]--;
  const w = cellWorld(i,j);
  burst(w.x+4, w.y+4, MAT[P.sel].c, 5, 60, 2);
  (MAT_SFX[P.sel] || MAT_SFX.meat)();
  squash(1.08, 0.94);
  syncBag();
  return true;
}
function removeAt(i,j){
  if (i<0||j<0||i>=MW||j>=MH) return false;
  const id = P.mask[j*MW+i];
  if (!id) return false;
  if (!connectedWithout(i,j)) { deny(); toast('会断成两截'); return false; }
  pushHist({t:'r', i, j, m:matKey(id)});
  tutCuts++;
  P.mask[j*MW+i] = 0;
  P.bag[matKey(id)]++;
  ensureSel(matKey(id));
  const w = cellWorld(i,j);
  burst(w.x+4, w.y+4, BY_ID[id].c, 6, 80, 2);
  tone(320, 170, 0.07, 'square', 0.05);
  squash(0.94, 1.06);
  syncBag();
  return true;
}
// 手指点击:在 1.2 格半径内找最近的"能削的身体格"或"能贴的空格"
function nearestEditable(wx, wy){
  let best = null, bestD = (CELL*1.25)**2;
  for (let j=0;j<MH;j++) for (let i=0;i<MW;i++){
    const filled = !!P.mask[j*MW+i];
    if (filled ? !connectedWithout(i,j) : !adjacentToBody(i,j)) continue;
    const c = cellWorld(i,j);
    const d = (c.x+4-wx)**2 + (c.y+4-wy)**2;
    // 身体内部的格子优先(手指落在身体上时更可能是想削)
    const dd = filled ? d*0.8 : d;
    if (dd < bestD){ bestD = dd; best = {i,j,filled}; }
  }
  return best;
}

// ─── 改造面板:暂停游戏,把 8×8 身体放大编辑
const edEl = $('editor'), edCv = $('edCv'), edx = edCv.getContext('2d');
edx.imageSmoothingEnabled = false;
const ED = 32; // 每格 32px
function openEditor(){
  if (state !== 'play' || editing) return;
  editing = true; edEl.classList.remove('hide');
  releaseJump(); touchDir = 0; endMove();
  tone(500,700,0.06,'triangle',0.04);
}
function closeEditor(silent){
  if (!editing) { edEl.classList.add('hide'); return; }
  editing = false; edEl.classList.add('hide');
  if (!silent) tone(700,500,0.06,'triangle',0.04);
}
$('edDone').addEventListener('click', ()=> closeEditor());
edEl.addEventListener('pointerdown', e=>{ if (e.target === edEl) { e.preventDefault(); closeEditor(); } });
edCv.addEventListener('contextmenu', e=> e.preventDefault());
edCv.addEventListener('pointerdown', e=>{
  e.preventDefault();
  const r = edCv.getBoundingClientRect();
  const i = Math.floor((e.clientX - r.left) / r.width * MW);
  const j = Math.floor((e.clientY - r.top) / r.height * MH);
  if (i<0||j<0||i>=MW||j>=MH) return;
  if (e.pointerType === 'mouse' && e.button === 2) { removeAt(i,j); return; }
  if (P.mask[j*MW+i]) removeAt(i,j); else placeAt(i,j);
});
function drawEditor(){
  const S = ED;
  edx.fillStyle = '#0b0a10'; edx.fillRect(0,0,256,256);
  // 背后真实的世界:墙会挡住哪些格子
  for (let j=0;j<MH;j++) for (let i=0;i<MW;i++){
    const w = cellWorld(i,j);
    const tx = Math.floor((w.x+4)/CELL), ty = Math.floor((w.y+4)/CELL);
    const t = gt(tx,ty);
    const x = i*S, y = j*S;
    edx.fillStyle = ((i+j)&1) ? '#121019' : '#0f0d15';
    edx.fillRect(x,y,S,S);
    if (t === TILE.STONE || t === TILE.CRUMBLE){
      edx.fillStyle = t === TILE.CRUMBLE ? '#3a2a1f' : TH.rock[0];
      edx.fillRect(x,y,S,S);
      edx.fillStyle = 'rgba(255,255,255,0.05)';
      for (let k=-S;k<S;k+=6){ edx.fillRect(x+Math.max(0,k), y+Math.max(0,-k), 2, 2); }
    } else if (t === TILE.LAVA){
      edx.fillStyle = '#5a170a'; edx.fillRect(x,y,S,S);
    }
  }
  // 身体
  for (let j=0;j<MH;j++) for (let i=0;i<MW;i++){
    const id = P.mask[j*MW+i]; if (!id) continue;
    const m = BY_ID[id], x = i*S, y = j*S;
    edx.fillStyle = m.edge; edx.fillRect(x,y,S,S);
    edx.fillStyle = m.c; edx.fillRect(x+2,y+2,S-4,S-4);
    edx.fillStyle = m.c2; edx.fillRect(x+2,y+S-8,S-4,6);
    edx.fillStyle = 'rgba(255,255,255,0.25)'; edx.fillRect(x+4,y+4,S-12,3);
    edx.fillStyle = 'rgba(0,0,0,0.35)'; edx.font = '14px monospace'; edx.textAlign = 'center';
    edx.fillText(m.label, x+S/2, y+S/2+5);
  }
  // 提示框
  const pulse = 0.55 + 0.35*Math.sin(time*6);
  for (let j=0;j<MH;j++) for (let i=0;i<MW;i++){
    const x = i*S, y = j*S;
    if (P.mask[j*MW+i]){
      if (connectedWithout(i,j)){ edx.strokeStyle = 'rgba(255,122,122,'+pulse+')'; edx.lineWidth = 2; edx.strokeRect(x+2,y+2,S-4,S-4); }
    } else if (adjacentToBody(i,j)){
      if (canPlace(i,j)){
        const has = P.bag[P.sel] > 0;
        if (has){ edx.fillStyle = MAT[P.sel].c; edx.globalAlpha = 0.85; edx.fillRect(x+S/2-3,y+S/2-3,6,6); edx.globalAlpha = 1; }
        edx.setLineDash([4,3]);
        edx.strokeStyle = has ? 'rgba(240,234,255,'+pulse+')' : 'rgba(240,234,255,0.2)';
        edx.lineWidth = 2; edx.strokeRect(x+4,y+4,S-8,S-8);
        edx.setLineDash([]);
      } else {
        edx.strokeStyle = 'rgba(120,108,150,0.6)'; edx.lineWidth = 2; edx.strokeRect(x+3,y+3,S-6,S-6);
        edx.beginPath(); edx.moveTo(x+8,y+8); edx.lineTo(x+S-8,y+S-8); edx.moveTo(x+S-8,y+8); edx.lineTo(x+8,y+S-8); edx.stroke();
      }
    }
  }
  const w = weight();
  $('edW').textContent = '重量 ' + w.toFixed(1) + (level === 1 || level === 4 ? (w >= 12.5 ? ' · 够压塌地板' : ' · 压塌地板要 12.5') : '');
}

// ─── 暂停菜单:继续 / 重来本关 / 选关 / 声音 / 回标题(手机上没有键盘,这是唯一的重开入口)
const menuEl = $('pause');
let menuOpen = false;
function openMenu(){
  if (state !== 'play' || menuOpen) return;
  closeEditor(true);
  menuOpen = true; menuEl.classList.remove('hide');
  releaseJump(); touchDir = 0; endMove();
  $('pmLevel').textContent = LEVELS[level].name;
  $('pmSound').textContent = muted ? '声音:关' : '声音:开';
  const grid = $('pmLevels'); grid.textContent = '';
  const un = Math.max(store.get('unlocked', 0), level);
  LEVELS.forEach((L, i)=>{
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'lvb' + (i === level ? ' cur' : '');
    b.textContent = L.name.split(' · ')[0];
    b.title = L.name;
    b.disabled = i > un;
    b.addEventListener('click', ()=>{ closeMenu(true); loadLevel(i); });
    grid.appendChild(b);
  });
  tone(500,380,0.06,'triangle',0.04);
}
function closeMenu(silent){
  if (!menuOpen) return;
  menuOpen = false; menuEl.classList.add('hide');
  if (!silent) tone(380,500,0.06,'triangle',0.04);
}
$('btnPause').addEventListener('click', ()=>{ ac(); menuOpen ? closeMenu() : openMenu(); });
$('pmResume').addEventListener('click', ()=> closeMenu());
$('pmRetry').addEventListener('click', ()=>{ closeMenu(true); loadLevel(level, true); });
$('pmSound').addEventListener('click', ()=>{ setMuted(!muted); $('pmSound').textContent = muted ? '声音:关' : '声音:开'; });
$('pmTitle').addEventListener('click', ()=>{ closeMenu(true); showTitle(); });
menuEl.addEventListener('pointerdown', e=>{ if (e.target === menuEl){ e.preventDefault(); closeMenu(); } });

// ─── 第一关的新手引导:手指动画教"削自己"
let tut = 0, tutCuts = 0, tutDone = !!store.get('tutDone', false);
function pickCut(){
  let best = null, bs = 1e9;
  const b = bounds(), mid = (b.i0 + b.i1)/2;
  for (let j=0;j<MH;j++) for (let i=0;i<MW;i++){
    if (!P.mask[j*MW+i] || !connectedWithout(i,j)) continue;
    const sc = j*10 + Math.abs(i - mid);
    if (sc < bs){ bs = sc; best = {i, j}; }
  }
  return best;
}
function tutStep(){
  if (level !== 0 || tutDone || state !== 'play' || editing || menuOpen) return null;
  const b = bounds(); if (b.empty) return null;
  const cx = (b.x + b.w/2)/CELL;
  if (cx < 17 && tutCuts === 0) return {text: touchMode ? '按住左下的圆盘往右滑' : '按 D 往右走', arrow:true};
  if (cx < 31){
    if (b.h > 16) return {text: tutCuts ? '继续削,矮到两格就钻得过去' : (touchMode ? '点一下自己的身体,削掉一格' : '右键点自己的身体,削掉一格'), target: pickCut()};
    return {text:'钻过去!', arrow:true};
  }
  if (cx > 38 && cx < 47.5 && b.h > 8) return {text:'这道缝只有一格高 —— 削成一片', target: pickCut()};
  return null;
}
function drawTutorial(){
  const t = tutStep(); if (!t) return;
  const b = bounds();
  ctx.font = '7px "PingFang SC","Microsoft YaHei",sans-serif';
  const tw = Math.ceil(ctx.measureText(t.text).width) + 10;
  const bx = Math.round(clamp(b.x + b.w/2 - tw/2, cam.x + 4, cam.x + VIEW_W - tw - 4));
  const by = Math.round(Math.max(cam.y + 4, b.y - 26));
  const pulse = 0.6 + 0.4*Math.sin(time*5);
  ctx.fillStyle = 'rgba(16,13,26,0.92)'; ctx.fillRect(bx, by, tw, 13);
  ctx.fillStyle = 'rgba(203,182,255,'+pulse.toFixed(2)+')';
  ctx.fillRect(bx, by, tw, 1); ctx.fillRect(bx, by+12, tw, 1); ctx.fillRect(bx, by, 1, 13); ctx.fillRect(bx+tw-1, by, 1, 13);
  ctx.fillStyle = '#ffffff'; ctx.fillText(t.text, bx + 5, by + 9);
  if (t.arrow){
    const ax = Math.round(b.x + b.w + 6 + (time*20 % 8));
    const ay = Math.round(b.y + b.h/2);
    ctx.fillStyle = 'rgba(203,182,255,0.85)';
    for (let k=0;k<3;k++){ ctx.fillRect(ax+k*5, ay-2, 1, 1); ctx.fillRect(ax+k*5+1, ay-1, 1, 3); ctx.fillRect(ax+k*5+2, ay, 1, 1); }
  }
  if (t.target){
    const w = cellWorld(t.target.i, t.target.j);
    ctx.strokeStyle = 'rgba(255,240,140,'+pulse.toFixed(2)+')'; ctx.lineWidth = 1;
    ctx.strokeRect(w.x - 0.5, w.y - 0.5, CELL + 1, CELL + 1);
    // 像素手指,从右上方点下来
    const tap = Math.max(0, Math.sin(time*5)) * 3;
    const fx0 = Math.round(w.x + 5 + tap*0.3), fy0 = Math.round(w.y + 4 + tap);
    ctx.fillStyle = '#150c16';
    ctx.fillRect(fx0-1, fy0-1, 4, 8); ctx.fillRect(fx0-1, fy0+5, 9, 7);
    ctx.fillStyle = '#fff3e6';
    ctx.fillRect(fx0, fy0, 2, 7); ctx.fillRect(fx0, fy0+6, 7, 5);
    ctx.fillStyle = '#e8c9b4'; ctx.fillRect(fx0+3, fy0+7, 1, 3); ctx.fillRect(fx0+5, fy0+7, 1, 3);
    if (tap > 2.6){ ctx.fillStyle = 'rgba(255,240,140,0.8)'; ctx.fillRect(fx0-3, fy0-3, 1, 1); ctx.fillRect(fx0+3, fy0-3, 1, 1); ctx.fillRect(fx0, fy0-4, 1, 1); }
  }
}

// ═════════════════════════════════════════════ 伤害
function kick(amount, dx, dy){
  shake = Math.max(shake, amount);
  shakeX += (dx||0)*amount*0.6; shakeY += (dy||0)*amount*0.6;
}
function damagePlayerNear(x,y,count){
  if (P.invuln > 0) return;
  let removed = 0;
  const b0 = bounds();
  const away = Math.sign((b0.x + b0.w/2) - x) || 1;
  for (let n=0;n<(count||1);n++){
    let best = -1, bestD = 1e9;
    for (let j=0;j<MH;j++) for (let i=0;i<MW;i++){
      const id = P.mask[j*MW+i];
      if (!id) continue;
      if (!connectedWithout(i,j)) continue;
      const w = cellWorld(i,j);
      const d = (w.x+4-x)**2 + (w.y+4-y)**2;
      if (d < bestD){ bestD = d; best = j*MW+i; }
    }
    if (best < 0) break;
    const id = P.mask[best];
    P.mask[best] = 0;
    const w = cellWorld(best%MW, (best/MW)|0);
    burst(w.x+4, w.y+4, BY_ID[id].c, 8, 130, 2);
    chunk(w.x+4, w.y+4, BY_ID[id], -away*90, 0);
    P.bag[matKey(id)]++;
    removed++;
  }
  if (removed){
    P.invuln = 0.32;
    P.flash = 1;
    P.shake = 7;
    P.hurtFace = 0.5;
    kick(7, away, -0.4);
    freeze = Math.max(freeze, 0.045);
    tone(190, 60, 0.18, 'sawtooth', 0.075);
    noise(0.12, 0.05, 300, 3000);
    squash(1.25, 0.8);
    vibrate(30);
    floater(b0.x + b0.w/2, b0.y - 4, '-'+removed, '#ff7a8a');
    syncBag();
    if (bounds().n === 0) die();
  }
}

function die(){
  state = 'dead'; timer = 0; stats.deaths++;
  closeEditor(true);
  for (let j=0;j<MH;j++) for (let i=0;i<MW;i++){
    const id = P.mask[j*MW+i]; if (!id) continue;
    const w = cellWorld(i,j);
    burst(w.x+4, w.y+4, BY_ID[id].c, 6, 160, 2);
    chunk(w.x+4, w.y+4, BY_ID[id], (i-3.5)*40, (j-3.5)*20);
  }
  P.mask.fill(0);
  shake = 14;
  tone(260, 40, 0.5, 'sawtooth', 0.09);
  noise(0.4, 0.07, 200, 2000);
  vibrate([40,40,80]);
}

// ═════════════════════════════════════════════ 玩家更新
function updatePlayer(dt){
  P.bornT = Math.max(0, P.bornT - dt);
  P.invuln = Math.max(0, P.invuln - dt);
  P.denyT = Math.max(0, P.denyT - dt);
  P.flash = Math.max(0, P.flash - dt*3);
  P.blink = Math.max(0, P.blink - dt);
  P.hurtFace = Math.max(0, P.hurtFace - dt);
  for (let k=0;k<MW*MH;k++) if (P.pop[k] > 0) P.pop[k] = Math.max(0, P.pop[k] - dt*5);
  if (P.eyeT > 0) P.eyeT -= dt; else { P.eyeT = 2.2 + Math.random()*2.6; P.blink = 0.1; }
  // 挤压拉伸:临界阻尼弹簧回到 1
  const k = 260, damp = 18;
  P.svx += ((1 - P.sx)*k - P.svx*damp)*dt; P.sx += P.svx*dt;
  P.svy += ((1 - P.sy)*k - P.svy*damp)*dt; P.sy += P.svy*dt;

  const b0 = bounds();
  if (b0.empty) return;

  // 岩浆减速
  let inLava = false;
  {
    const x0 = Math.floor(b0.x/CELL), x1 = Math.floor((b0.x+b0.w-1)/CELL);
    const y0 = Math.floor(b0.y/CELL), y1 = Math.floor((b0.y+b0.h-1)/CELL);
    for (let y=y0;y<=y1 && !inLava;y++) for (let x=x0;x<=x1;x++) if (gt(x,y)===TILE.LAVA) { inLava = true; break; }
  }

  // 水平
  const kd = (keys['KeyD']||keys['ArrowRight']?1:0) - (keys['KeyA']||keys['ArrowLeft']?1:0);
  const dir = P.kbT > 0 ? 0 : (kd || touchDir);
  const spd = moveSpeed() * (inLava?0.58:1);
  if (P.kbT > 0){ P.kbT -= dt; P.vx = P.kbV; P.kbV *= Math.pow(0.02, dt); }
  else P.vx = dir*spd;
  if (dir) P.face = dir;
  const wasBlockedX = !tryMoveX(P.vx*dt);

  // 垂直
  P.lastVy = P.vy;
  P.vy = clamp(P.vy + GRAV*dt, -900, 760);
  const hitY = !tryMoveY(P.vy*dt);
  if (hitY){
    if (P.vy > 0){
      if (!P.onGround){
        const impact = clamp(P.lastVy/500, 0, 1);
        if (P.lastVy > 140){
          dust(b0.x+2, b0.y+b0.h, -1, 3 + (impact*4|0));
          dust(b0.x+b0.w-2, b0.y+b0.h, 1, 3 + (impact*4|0));
          squash(1 + 0.32*impact, 1 - 0.28*impact);
          tone(110 + weight()*-2 + 80, 50, 0.06 + impact*0.05, 'square', 0.03 + impact*0.03);
          if (weight() > 12 && P.lastVy > 300) kick(3, 0, 1);
        }
      }
      P.onGround = true; P.coyote = 0.1;
    }
    P.vy = 0;
  } else {
    P.onGround = false;
  }
  if (P.coyote > 0) P.coyote -= dt;

  // 跑动扬尘 + 脚步声
  if (P.onGround && dir && !wasBlockedX){
    P.dustT -= dt;
    if (P.dustT <= 0){
      P.dustT = 0.13;
      dust(dir > 0 ? b0.x+1 : b0.x+b0.w-1, b0.y+b0.h, -dir, 1);
      if (!inLava) noise(0.03, 0.012 + weight()*0.0008, 600, 3000);
    }
  }

  jumpBuf = Math.max(0, jumpBuf - dt);
  if (jumpBuf > 0 && (P.onGround || P.coyote > 0)){
    P.vy = -jumpPower();
    P.onGround = false; P.coyote = 0; jumpBuf = 0;
    burst(b0.x+b0.w/2, b0.y+b0.h, '#9a92ad', 3, 50, 1);
    dust(b0.x+b0.w/2, b0.y+b0.h, -1, 2); dust(b0.x+b0.w/2, b0.y+b0.h, 1, 2);
    squash(0.78, 1.22);
    tone(250, 480, 0.09, 'square', 0.045);
  }
  if (P.vy < 0 && !jumpHeld()) P.vy += GRAV*dt*0.55;

  // 脆地板
  if (P.onGround){
    let onCrumble = false;
    const x0 = Math.floor(b0.x/CELL), x1 = Math.floor((b0.x+b0.w-1)/CELL);
    const y = Math.floor((b0.y+b0.h)/CELL);
    for (let x=x0;x<=x1;x++) if (gt(x,y)===TILE.CRUMBLE){ onCrumble = true; break; }
    if (onCrumble){
      if (weight() >= 12.5){
        P.crumbleT += dt;
        if (Math.random() < 0.5) burst(b0.x + Math.random()*b0.w, b0.y+b0.h+2, '#7a5f45', 1, 30, 1);
        if (P.crumbleT > 0.3){
          P.crumbleT = 0;
          // 整片塌陷:从脚下的脆地板向外连成一片一起碎,避免剩一格撑着人
          const stack = [];
          for (let x=x0;x<=x1;x++) if (gt(x,y)===TILE.CRUMBLE) stack.push([x,y]);
          const seen = {};
          while (stack.length){
            const c = stack.pop();
            const kk = c[0]+','+c[1];
            if (seen[kk]) continue;
            if (gt(c[0],c[1])!==TILE.CRUMBLE) continue;
            seen[kk] = 1;
            setT(c[0],c[1],TILE.EMPTY);
            burst(c[0]*CELL+4, c[1]*CELL+4, '#7a5f45', 5, 100, 2);
            chunk(c[0]*CELL+4, c[1]*CELL+4, {c:'#5b4433',edge:'#2a1d14'}, (Math.random()-0.5)*80, 40);
            stack.push([c[0]+1,c[1]],[c[0]-1,c[1]],[c[0],c[1]+1],[c[0],c[1]-1]);
          }
          kick(9, 0, 1);
          tone(120, 40, 0.28, 'sawtooth', 0.08);
          noise(0.35, 0.08, 150, 1800);
          vibrate(50);
        }
      } else {
        P.crumbleT = 0;
        if (Math.random() < 0.01) floater(b0.x+b0.w/2, b0.y-4, '还不够重', '#c9b48f');
      }
    } else P.crumbleT = 0;
  }

  // 岩浆:水把脚下这一格凝成石头;没水就烧你
  {
    const ft = feetTile(b0);
    let onLava = false;
    for (let x=ft.x0;x<=ft.x1;x++) if (gt(x,ft.y)===TILE.LAVA){ onLava = true; break; }
    if (P.onGround && onLava){
      P.lavaT += dt;
      const hasWater = countMat('water') > 0;
      if (hasWater){
        let picked = -1;
        for (let k2=0;k2<MW*MH;k2++) if (P.mask[k2]===MAT.water.id && connectedWithout(k2%MW,(k2/MW)|0)) { picked = k2; break; }
        const cx = Math.floor((b0.x + b0.w/2)/CELL);
        if (picked >= 0 && gt(cx,ft.y)===TILE.LAVA){
          P.mask[picked] = 0;
          setT(cx, ft.y, TILE.STONE);
          const w = cellWorld(picked%MW,(picked/MW)|0);
          burst(w.x+4,w.y+4,'#cfeaff',10,90,2);
          burst(cx*CELL+4, ft.y*CELL+2, '#9fe4ff', 9, 90, 2);
          for (let s=0;s<4;s++) particles.push({x:cx*CELL+4,y:ft.y*CELL+2,vx:(Math.random()-0.5)*30,vy:-30-Math.random()*40,life:0.9,max:0.9,c:'rgba(210,240,255,0.55)',s:2,g:-30,soft:true});
          tone(820, 320, 0.14, 'sine', 0.05);
          noise(0.25, 0.05, 900, 5000);
          shake = Math.max(shake, 3);
          syncBag();
          if (countMat('water') <= 1) toast('水快用完了');
        }
      } else {
        if (Math.random() < 0.3) burst(b0.x + Math.random()*b0.w, b0.y+b0.h-2, '#ff9b4a', 1, 30, 1);
        if (P.lavaT > 0.15){
          P.lavaT = 0;
          damagePlayerNear(b0.x+b0.w/2, b0.y+b0.h);
        }
      }
    } else P.lavaT = 0;
  }

  // 草再生
  if (countMat('grass') > 0 && bounds().n < 30){
    P.regenT += dt;
    if (P.regenT > 2.0){
      P.regenT = 0;
      const cands = [];
      for (let j=0;j<MH;j++) for (let i=0;i<MW;i++){
        if (P.mask[j*MW+i]) continue;
        const nb = [[1,0],[-1,0],[0,1],[0,-1]];
        for (const [dx,dy] of nb){
          const ni=i+dx,nj=j+dy;
          if (ni<0||nj<0||ni>=MW||nj>=MH) continue;
          if (P.mask[nj*MW+ni] === MAT.grass.id){ cands.push([i,j]); break; }
        }
      }
      if (cands.length){
        const c = cands[(Math.random()*cands.length)|0];
        if (canPlace(c[0],c[1])){
          P.mask[c[1]*MW+c[0]] = MAT.grass.id;
          P.pop[c[1]*MW+c[0]] = 1;
          const w = cellWorld(c[0],c[1]);
          burst(w.x+4,w.y+4,'#8be05c',4,50,1);
          tone(900,1300,0.05,'triangle',0.025);
        }
      }
    }
  }

  // 火烧自己
  if (countMat('fire') > 0){
    P.burnT += dt;
    if (Math.random() < 0.25){
      for (let k2=0;k2<MW*MH;k2++) if (P.mask[k2]===MAT.fire.id && Math.random()<0.3){
        const w = cellWorld(k2%MW,(k2/MW)|0); ember(w.x+Math.random()*8, w.y, '#ffb02e'); break;
      }
    }
    if (P.burnT > 4.5){
      P.burnT = 0;
      let picked = -1;
      for (let k2=MW*MH-1;k2>=0;k2--) if (P.mask[k2]===MAT.fire.id && connectedWithout(k2%MW,(k2/MW)|0)) { picked = k2; break; }
      if (picked >= 0){
        const w = cellWorld(picked%MW,(picked/MW)|0);
        burst(w.x+4,w.y+4,'#ffb02e',7,90,2);
        P.mask[picked] = 0;
        P.bag.fire++;
        noise(0.12, 0.03, 1500, 6000);
        syncBag();
      }
    }
  } else P.burnT = 0;



  // 濒死:心跳
  if (bounds().n <= 2){
    P.beatT -= dt;
    if (P.beatT <= 0){ P.beatT = 0.85; tone(70,50,0.12,'sine',0.12); tone(70,50,0.1,'sine',0.08,0.16); }
  } else P.beatT = 0;
}

function countMat(key){
  const id = MAT[key].id; let n = 0;
  for (let k=0;k<MW*MH;k++) if (P.mask[k]===id) n++;
  return n;
}

// ═════════════════════════════════════════════ 敌人
function moveEnemy(e, dt){
  const steps = 2;
  for (let s=0;s<steps;s++){
    const d = e.vx*dt/steps;
    if (boxSolid(e.x+d, e.y, e.w, e.h)) { e.vx = 0; break; }
    e.x += d;
  }
  const vy0 = e.vy;
  e.vy = clamp(e.vy + GRAV*dt, -900, 720);
  let grounded = false;
  const steps2 = Math.max(1, Math.ceil(Math.abs(e.vy*dt)));
  for (let s=0;s<steps2;s++){
    const d = e.vy*dt/steps2;
    if (boxSolid(e.x, e.y+d, e.w, e.h)) { e.vy = 0; grounded = true; break; }
    e.y += d;
  }
  if (grounded && !e.onGround && vy0 > 150){
    e.sq = e.big ? 0.72 : 0.78;
    dust(e.x+2, e.y+e.h, -1, e.big?4:2); dust(e.x+e.w-2, e.y+e.h, 1, e.big?4:2);
    if (e.big){ kick(3, 0, 1); noise(0.12, 0.04, 100, 900); }
  }
  e.onGround = grounded;
}

function updateEnemies(dt){
  const b = bounds();
  if (b.empty) return;
  const pcx = b.x + b.w/2, pcy = b.y + b.h/2;
  for (let n=enemies.length-1;n>=0;n--){
    const e = enemies[n];
    e.born = Math.max(0, e.born - dt);
    e.flash = Math.max(0, e.flash - dt*4);
    e.inv = Math.max(0, e.inv - dt);
    e.sq += (1 - e.sq) * Math.min(1, dt*12);
    e.cd -= dt;
    const ecx = e.x + e.w/2, ecy = e.y + e.h/2;
    const dx = pcx - ecx, dist = Math.hypot(dx, pcy - ecy);

    if (e.born <= 0){
      // 起跳前蹲一下(给玩家看得见的预警)
      if (e.wind > 0){
        e.wind -= dt;
        e.sq = e.big ? 0.8 : 0.84;
        if (e.wind <= 0){
          e.vy = e.big ? -260 : -230;
          e.vx = Math.sign(dx || 1) * e.speed * (e.big?1.7:1);
          e.cd = e.big ? 1.15 : 0.85 + Math.random()*0.35;
          e.sq = 1.22;
          if (Math.random() < 0.6) tone(e.big?90:130, e.big?60:95, 0.07, 'square', 0.025);
        }
      } else if (dist < 260 && e.onGround && e.cd <= 0){
        e.wind = e.big ? 0.22 : 0.14;
      }
      if (e.onGround && e.wind <= 0) e.vx *= 0.82;
    }
    moveEnemy(e, dt);

    // 接触判定
    if (b.n > 0 && rectOverlap(b, e) && e.born <= 0){
      const pBot = b.y + b.h;
      const stomp = P.vy > 50 && pBot < e.y + e.h*0.6;
      // 接触面材质
      const cell = contactMat(ecx, ecy);
      const ph = cell ? cell.hard : 0;
      const pmat = cell || MAT.meat;
      const side = Math.sign(dx||1);
      if (stomp){
        P.vy = -300;
        damageEnemy(e, 3, ecx, ecy);
        e.sq = 0.6;
        P.shake = 6; kick(6, 0, 1);
        freeze = Math.max(freeze, 0.04);
        tone(420, 150, 0.09, 'square', 0.06);
        noise(0.08, 0.05, 400, 3000);
        squash(1.2, 0.85);
        burst(ecx, e.y, pmat.c, 6, 100, 2);
      } else if (ph > e.hard){
        damageEnemy(e, 3, ecx, ecy);
        e.vx = -side * Math.abs(e.vx) * 0.45 - side*20;
        P.kbT = 0.12; P.kbV = -side*90;
        P.vy = Math.min(P.vy, -90);
        freeze = Math.max(freeze, 0.035);
        kick(5, -side, 0);
        tone(300, 120, 0.1, 'square', 0.07);
        noise(0.1, 0.05, 300, 2500);
        burst(ecx - side*8, ecy, BY_ID[cell.id].c, 8, 120, 2);
      } else if (ph === e.hard){
        damageEnemy(e, 1, ecx, ecy);
        damagePlayerNear(ecx, ecy, 1);
        P.kbT = 0.2; P.kbV = -side*150;
        P.vy = -180;
        e.vx = side*90;
      } else {
        damagePlayerNear(ecx, ecy, 1);
        P.kbT = 0.22; P.kbV = -side*170;
        P.vy = -200;
        e.flash = 0.25;
        if (ph < e.hard && Math.random() < 0.5) floater(ecx, e.y-6, cell && cell.hard===0 ? '太软了' : '不够硬', '#ffb3c0');
      }
    }

    if (e.hp <= 0){
      burst(e.x+e.w/2, e.y+e.h/2, MAT[e.mat].c, 16, 150, 2);
      const m = MAT[e.mat];
      for (let c=0;c<(e.big?10:5);c++) chunk(e.x+Math.random()*e.w, e.y+Math.random()*e.h, m, (Math.random()-0.5)*200, 0);
      for (let d=0; d<(e.big?4:2); d++) addItem(e.x+e.w/2 + (Math.random()-0.5)*e.w, e.y+e.h/2, e.mat);
      kick(e.big?12:8, 0, 0);
      freeze = Math.max(freeze, e.big?0.12:0.06);
      tone(300, 60, 0.3, 'sawtooth', 0.08);
      noise(0.3, 0.07, 150, 2500);
      vibrate(e.big?80:40);
      enemies.splice(n,1);
      if (exitLocked && enemies.length === 0){
        exitLocked = false;
        toast('出口开了');
        arp([392,523,659], 80);
      }
    }
  }
}

function rectOverlap(b, e){
  return b.x < e.x+e.w && b.x+b.w > e.x && b.y < e.y+e.h && b.y+b.h > e.y;
}
function contactMat(x,y){
  let best = null, bestD = 1e9;
  for (let j=0;j<MH;j++) for (let i=0;i<MW;i++){
    const id = P.mask[j*MW+i]; if (!id) continue;
    const w = cellWorld(i,j);
    const d = (w.x+4-x)**2 + (w.y+4-y)**2;
    if (d < bestD){ bestD = d; best = BY_ID[id]; }
  }
  return best;
}
function damageEnemy(e, n, x, y){
  if (e.inv > 0) return;                 // 受击无敌帧,防止贴脸每帧掉血
  e.hp -= n; e.flash = 0.3; e.inv = 0.22;
  burst(x, y, MAT[e.mat].c, 4, 80, 2);
  floater(e.x+e.w/2, e.y-4, '-'+n, n>=3 ? '#fff2a8' : '#ffffff');
}

// ═════════════════════════════════════════════ 道具 / 粒子
let pickCombo = 0, pickComboT = 0;
function updateItems(dt){
  const b = bounds(); if (b.empty) return;
  pickComboT = Math.max(0, pickComboT - dt); if (pickComboT <= 0) pickCombo = 0;
  const pcx = b.x + b.w/2, pcy = b.y + b.h/2;
  for (let n=items.length-1;n>=0;n--){
    const it = items[n];
    it.t += dt;
    // 靠近时被吸过来
    const dx = pcx - it.x, dy = pcy - it.y, d = Math.hypot(dx, dy);
    if (d < 34 && it.t > 0.4){
      it.vx += dx/d * 500*dt; it.vy += dy/d * 500*dt;
    }
    it.vy = clamp(it.vy + 900*dt, -400, 500);
    it.x += it.vx*dt; it.y += it.vy*dt;
    const gy = Math.floor((it.y+4)/CELL);
    if (solidAt(Math.floor(it.x/CELL), gy)) { it.y = gy*CELL - 4; it.vy *= -0.35; it.vx *= 0.6; }
    if (b.x-10 < it.x && it.x < b.x+b.w+10 && b.y-10 < it.y && it.y < b.y+b.h+10){
      const key = MAT[it.mat] ? it.mat : 'meat';
      P.bag[key]++;
      ensureSel(key);
      burst(it.x, it.y, MAT[key].c, 5, 70, 1);
      pickCombo++; pickComboT = 0.8;
      const up = Math.pow(1.06, Math.min(pickCombo, 10));
      tone(880*up, 1240*up, 0.05, 'triangle', 0.04);
      floater(it.x, it.y - 6, '+'+MAT[key].label, MAT[key].c);
      items.splice(n,1);
      syncBag();
    }
  }
}

function updateParticles(dt){
  for (let n=particles.length-1;n>=0;n--){
    const p = particles[n];
    p.life -= dt;
    if (p.life <= 0) { particles.splice(n,1); continue; }
    p.vy += p.g*dt;
    p.x += p.vx*dt; p.y += p.vy*dt;
    if (!p.soft && solidAt(Math.floor((p.x + (p.chunk?3:0))/CELL), Math.floor((p.y + (p.chunk?6:0))/CELL))) {
      p.vy *= p.chunk ? -0.45 : -0.3; p.vx *= p.chunk ? 0.7 : 0.5; p.y -= p.chunk ? 2 : 1;
    }
  }
  for (let n=floaters.length-1;n>=0;n--){
    const f = floaters[n]; f.t += dt; f.y -= 16*dt;
    if (f.t > 0.9) floaters.splice(n,1);
  }
  if (floaters.length > 12) floaters.splice(0, floaters.length-12);
  // 洞顶滴水
  for (let n=drips.length-1;n>=0;n--){
    const d = drips[n];
    d.vy += 600*dt; d.y += d.vy*dt;
    const t = tileAtPoint(d.x, d.y);
    if (t === TILE.STONE || t === TILE.CRUMBLE || t === TILE.LAVA){
      burst(d.x, d.y-1, t === TILE.LAVA ? '#ffd0a0' : 'rgba(150,200,255,0.7)', 3, 30, 1);
      drips.splice(n,1);
    } else if (d.y > VH) drips.splice(n,1);
  }
  for (const s of dripSources){
    s.t -= dt;
    if (s.t <= 0){ s.t = 2.5 + Math.random()*5; drips.push({x:s.x, y:s.y, vy:0}); }
  }
  // 岩浆火星
  for (const s of lavaTop){ if (Math.random() < dt*0.6) ember(s*CELL+Math.random()*CELL, lavaY[s]*CELL, Math.random()<0.5?'#ffcf6a':'#ff7a20'); }
}

// ═════════════════════════════════════════════ 压板 / 门 / 物块 / 藤蔓
function overlapX(a0,a1,b0,b1){ return a0 <= b1 && a1 >= b0; }

function updateWires(){
  for (const p of plateList) p.load = 0;
  const b = bounds();
  if (!b.empty){
    const ft = feetTile(b);
    for (const p of plateList){
      if (p.y === ft.y && overlapX(ft.x0, ft.x1, p.x0, p.x1)) p.load += weight();
    }
  }
  for (const bl of blockList){
    const ft = feetTile(bl);
    for (const p of plateList){
      if (p.y === ft.y && overlapX(ft.x0, ft.x1, p.x0, p.x1)) p.load += MAT[bl.mat].w;
    }
  }
  const next = {};
  for (const p of plateList){
    const was = p.pressed;
    p.pressed = p.load >= p.need - 0.001;
    if (p.pressed && !was){
      burst((p.x0+p.x1+1)*CELL/2, p.y*CELL+2, '#9fe4ff', 7, 70, 1);
      tone(680, 940, 0.07, 'square', 0.045);
    } else if (!p.pressed && was){
      tone(300, 200, 0.07, 'square', 0.035);
    }
    if (p.pressed) next[p.id] = true;
  }
  for (const id in doorOpen){
    let open = !!next[id];
    if (!open && !b.empty){
      // 人还在门框里时别关门夹住他
      const x0 = Math.floor(b.x/CELL), x1 = Math.floor((b.x+b.w-1)/CELL);
      const y0 = Math.floor(b.y/CELL), y1 = Math.floor((b.y+b.h-1)/CELL);
      for (let y=y0;y<=y1 && !open;y++) for (let x=x0;x<=x1;x++){
        if (gt(x,y)===TILE.DOOR && doorId[y*GW+x] === +id){ open = true; break; }
      }
    }
    if (doorOpen[id] !== open){ doorOpen[id] = open; tilesDirty = true; }
  }
}

function updateBlocks(dt){
  for (const bl of blockList){
    bl.born = Math.max(0, (bl.born||0) - dt);
    bl.vy = Math.min(bl.vy + GRAV*dt, 620);
    let steps = Math.max(1, Math.ceil(bl.vy*dt));
    const d = bl.vy*dt/steps;
    for (let s=0;s<steps;s++){
      if (boxSolid(bl.x, bl.y+d, bl.w, bl.h)) {
        bl.vy = 0;
        // 落地时把底边吸附到格子边界,否则压板认不出来
        const bottom = bl.y + bl.h;
        const snap = Math.ceil((bottom - 1e-4)/CELL)*CELL;
        if (snap - bottom < CELL && !boxSolid(bl.x, bl.y + (snap-bottom), bl.w, bl.h)) bl.y += snap - bottom;
        break;
      }
      bl.y += d;
    }
  }
}

function dropBlock(){
  if (state !== 'play' || editing) return;
  if (P.bag[P.sel] <= 0){ P.denyT = 0.3; tone(140,110,0.06,'square',0.04); return; }
  const b = bounds(); if (b.empty) return;
  // 放在自己脚下,这样站在压板上按一下就能压住
  let bx = b.x + (b.w - 6) / 2;
  let by = b.y + b.h - 7;
  if (boxSolid(bx, by, 6, 6)) { bx = b.x + (P.face>0 ? b.w + 1 : -7); }
  if (boxSolid(bx, by, 6, 6)) bx = b.x + (b.w-6)/2;
  P.bag[P.sel]--;
  blockList.push({ x:bx, y:by, w:6, h:6, mat:P.sel, vy:0, born:0.25 });
  burst(bx+3, by+3, MAT[P.sel].c, 7, 70, 2);
  tone(360, 230, 0.08, 'square', 0.05);
  syncBag();
}

function pickBlock(){
  const b = bounds(); if (b.empty) return false;
  for (let i=blockList.length-1;i>=0;i--){
    const bl = blockList[i];
    if (bl.x+bl.w > b.x-14 && bl.x < b.x+b.w+14 && bl.y+bl.h > b.y-14 && bl.y < b.y+b.h+14){
      P.bag[bl.mat]++;
      burst(bl.x+3, bl.y+3, MAT[bl.mat].c, 7, 70, 2);
      blockList.splice(i,1);
      ensureSel(bl.mat);
      syncBag();
      tone(880, 1240, 0.05, 'triangle', 0.04);
      return true;
    }
  }
  return false;
}

// 一个键干两件事:手边有石块就捡,没有就放下脚下的材料
function blockAction(){
  if (state !== 'play' || editing || menuOpen) return;
  if (!pickBlock()) dropBlock();
}

function burnVines(){
  let hit = null;
  for (let j=0;j<MH && !hit;j++) for (let i=0;i<MW;i++){
    if (P.mask[j*MW+i] !== MAT.fire.id) continue;
    const w = cellWorld(i,j);
    const cx = Math.floor((w.x+4)/CELL), cy = Math.floor((w.y+4)/CELL);
    for (const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){
      if (gt(cx+dx, cy+dy) === TILE.VINE){ hit = [cx+dx, cy+dy]; break; }
    }
    if (hit) break;
  }
  if (!hit) return;
  const stack = [hit], seen = {};
  let n = 0;
  while (stack.length && n < 600){
    const c = stack.pop(), k = c[0]+','+c[1];
    if (seen[k] || gt(c[0],c[1]) !== TILE.VINE) continue;
    seen[k] = 1; n++;
    setT(c[0],c[1],TILE.EMPTY);
    burst(c[0]*CELL+4, c[1]*CELL+4, '#ff9a3c', 4, 80, 2);
    ember(c[0]*CELL+4, c[1]*CELL+4, '#ffb04a');
    stack.push([c[0]+1,c[1]],[c[0]-1,c[1]],[c[0],c[1]+1],[c[0],c[1]-1]);
  }
  if (n){
    shake = Math.max(shake, 9);
    tone(200, 55, 0.45, 'sawtooth', 0.07);
    noise(0.5, 0.06, 300, 3000);
    toast('烧穿了');
  }
}

// ═════════════════════════════════════════════ 主更新
function update(dt){
  time += dt;
  if (freeze > 0){ freeze -= dt; dt *= 0.15; }
  shake *= Math.pow(0.0025, dt);
  if (shake < 0.2) shake = 0;
  shakeX *= Math.pow(0.0005, dt); shakeY *= Math.pow(0.0005, dt);

  // 配乐强度:有敌人或快散架时加鼓
  music.intensity = (state === 'play' && (enemies.length > 0 || bounds().n <= 3)) ? 1 : 0;

  if (state === 'title' || state === 'win') { updateParticles(dt); return; }
  if (editing || menuOpen) return;
  if (state === 'dead'){
    timer += dt;
    updateParticles(dt);
    if (timer > 1.1) loadLevel(level, true);
    return;
  }
  if (state === 'clear'){
    timer += dt; updateParticles(dt);
    if (timer > 0.85) loadLevel(level+1);
    return;
  }
  if (state !== 'play') return;
  levelT += dt;

  updatePlayer(dt);
  if (level === 0 && !tutDone && bounds().x/CELL > 52){ tutDone = true; store.set('tutDone', true); }
  updateEnemies(dt);
  updateItems(dt);
  updateBlocks(dt);
  updateWires();
  burnVines();
  updateParticles(dt);
  camFollow(dt);

  // 出口
  const L = LEVELS[level];
  if (L.exit && !exitLocked){
    const b = bounds();
    const ex = {x:L.exit[0]*CELL, y:L.exit[1]*CELL, w:L.exit[2]*CELL, h:L.exit[3]*CELL};
    if (!b.empty && rectOverlap(b, ex)) nextLevel();
    else if (!b.empty && Math.random() < dt*20) particles.push({x:ex.x+Math.random()*ex.w, y:ex.y+ex.h, vx:0, vy:-20-Math.random()*25, life:0.9, max:0.9, c:'#cbb6ff', s:1, g:0, soft:true, glow:true});
  }
}

// ═════════════════════════════════════════════ 镜头
const ZOOM = 2;
let VIEW_W = CW/ZOOM, VIEW_H = CH/ZOOM;
const cam = {x:0, y:0, look:0};

function camTarget(){
  const b = bounds();
  const tx = clamp(b.x + b.w/2 + cam.look - VIEW_W/2, 0, GW*CELL - VIEW_W);
  const ty = clamp(b.y + b.h/2 - VIEW_H*0.60, 0, GH*CELL - VIEW_H);
  return {tx, ty};
}
function camSnap(){ cam.look = 0; const t = camTarget(); cam.x = t.tx; cam.y = t.ty; }
function camFollow(dt){
  // 朝移动方向多看一点
  cam.look += ((P.vx ? Math.sign(P.vx)*26 : cam.look*0.6) - cam.look) * Math.min(1, dt*2.2);
  const t = camTarget();
  const k = 1 - Math.pow(0.0009, dt);
  cam.x += (t.tx-cam.x)*k;
  cam.y += (t.ty-cam.y)*k;
}

// ═════════════════════════════════════════════ 关卡美术(每关生成一次)
function mkCanvas(w,h){ const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'); x.imageSmoothingEnabled = false; return [c,x]; }
const [farCv, fx] = mkCanvas(VW, VH);
const [midCv, mx] = mkCanvas(VW, VH);
const [nearCv, nx] = mkCanvas(VW, VH);
const [tileCv, tx] = mkCanvas(VW, VH);
let decor = [], dripSources = [], lavaTop = [], lavaY = {};

function buildLevelArt(seed){
  const rnd = mulberry(Math.floor(seed*1000)+7);
  buildFar(rnd); buildMid(rnd); buildNear(rnd);
  // 装饰:扫描地形表面
  decor = []; dripSources = []; lavaTop = []; lavaY = {};
  const L = LEVELS[level];
  const ex = L.exit;
  const nearExit = (x,y)=> ex && x >= ex[0]-1 && x <= ex[0]+ex[2] && y >= ex[1]-1 && y <= ex[1]+ex[3]+1;
  for (let y=1;y<GH-1;y++) for (let x=1;x<GW-1;x++){
    const t = gt(x,y);
    if (t === TILE.LAVA && gt(x,y-1) !== TILE.LAVA){ lavaTop.push(x); lavaY[x] = y; }
    if (t !== TILE.STONE) continue;
    const h = hash(x*3+level, y*7);
    if (gt(x,y-1) === TILE.EMPTY && gt(x,y-2) === TILE.EMPTY && !nearExit(x,y-1)){
      if (h < 0.10) decor.push({k:'mush', x:x*CELL+2+((h*97)%4|0), y:y*CELL, s:h*10, light:true});
      else if (h < 0.16) decor.push({k:'crystal', x:x*CELL+1+((h*53)%5|0), y:y*CELL, s:h*10, light:true});
      else if (h < 0.42) decor.push({k:'tuft', x:x*CELL+((h*71)%6|0), y:y*CELL, s:h*10});
    }
    if (gt(x,y+1) === TILE.EMPTY && gt(x,y+2) === TILE.EMPTY){
      if (h > 0.78) decor.push({k:'vine', x:x*CELL+((h*31)%7|0), y:(y+1)*CELL, len:6 + ((h*137)%22|0), s:h*10});
      else if (h > 0.70 && h < 0.73) dripSources.push({x:x*CELL+4, y:(y+1)*CELL+1, t:Math.random()*4});
    }
  }
  tilesDirty = true;
}

function buildFar(rnd){
  const g = fx.createLinearGradient(0,0,0,VH);
  g.addColorStop(0,TH.bg[0]); g.addColorStop(0.5,TH.bg[1]); g.addColorStop(1,TH.bg[2]);
  fx.fillStyle = g; fx.fillRect(0,0,VW,VH);
  const gl = fx.createRadialGradient(VW*0.5, VH*0.55, 10, VW*0.5, VH*0.55, VW*0.6);
  gl.addColorStop(0,'rgba('+TH.glow+',0.16)'); gl.addColorStop(1,'rgba('+TH.glow+',0)');
  fx.fillStyle = gl; fx.fillRect(0,0,VW,VH);
  // 远处的废墟石柱 + 拱
  for (let i=0;i<9;i++){
    const w = 8 + rnd()*20, x = rnd()*VW, top = 60 + rnd()*140;
    fx.fillStyle = 'rgba('+TH.far+',0.9)';
    fx.fillRect(x, top, w, VH-top); fx.fillRect(x-3, top-5, w+6, 6);
    fx.fillStyle = 'rgba(255,255,255,0.035)'; fx.fillRect(x, top, 1, VH-top);
    if (rnd() > 0.45){ fx.fillStyle = 'rgba('+TH.glow+',0.22)'; fx.fillRect(x + w*0.35, top + 20 + rnd()*80, 2, 6); }
    if (rnd() > 0.6 && i < 8){
      const span = 30 + rnd()*50;
      fx.strokeStyle = 'rgba('+TH.far+',0.8)'; fx.lineWidth = 5;
      fx.beginPath(); fx.arc(x + w + span/2, top + 10, span/2, Math.PI, 0); fx.stroke();
    }
  }
  fx.fillStyle = 'rgba(5,4,9,0.45)'; fx.fillRect(0,0,VW,VH);
  for (let i=0;i<140;i++){
    const a = 0.03 + rnd()*0.10;
    fx.fillStyle = 'rgba(255,255,255,'+a.toFixed(2)+')';
    fx.fillRect(Math.floor(rnd()*VW), Math.floor(rnd()*VH), 1, 1);
  }
}
function buildMid(rnd){
  mx.clearRect(0,0,VW,VH);
  // 洞顶锯齿(两层)
  const layers = [{a:0.95, base:30, amp:18, f:0.019},{a:1, base:16, amp:10, f:0.041}];
  for (const L of layers){
    mx.beginPath(); mx.moveTo(0,0);
    for (let x=0;x<=VW;x+=4){
      const y = L.base + Math.sin(x*L.f + rnd()*0.02)*L.amp + Math.sin(x*L.f*2.7 + 1.3)*L.amp*0.45 + Math.sin(x*L.f*6.1 + 2.7)*L.amp*0.2;
      mx.lineTo(x, y);
    }
    mx.lineTo(VW,0); mx.closePath();
    mx.fillStyle = 'rgba('+TH.mid+','+L.a+')'; mx.fill();
  }
  // 大钟乳石
  for (let i=0;i<14;i++){
    const x = rnd()*VW, w = 6 + rnd()*14, len = 30 + rnd()*rnd()*140;
    mx.fillStyle = 'rgba('+TH.mid+',0.92)';
    mx.beginPath(); mx.moveTo(x-w/2, 20); mx.lineTo(x+w/2, 20); mx.lineTo(x + (rnd()-0.5)*4, 20+len); mx.closePath(); mx.fill();
  }
  // 地面方向的远景石丘
  mx.beginPath(); mx.moveTo(0,VH);
  for (let x=0;x<=VW;x+=4){ mx.lineTo(x, VH - 40 - Math.sin(x*0.013+rnd()*0.01)*22 - Math.sin(x*0.037)*9); }
  mx.lineTo(VW,VH); mx.closePath();
  mx.fillStyle = 'rgba('+TH.mid+',0.85)'; mx.fill();
  // 垂藤
  for (let i=0;i<30;i++){
    const x = Math.floor(rnd()*VW), y0 = 26 + Math.sin(x*0.02)*14, len = 12 + rnd()*rnd()*150;
    mx.fillStyle = 'rgba('+TH.mid+','+(0.6+rnd()*0.4).toFixed(2)+')';
    const wob = 0.6 + rnd();
    for (let y=0;y<len;y+=2) mx.fillRect(Math.floor(x+Math.sin(y*0.08+i)*wob), Math.floor(y0+y), 1, 2);
    if (rnd()>0.6){ mx.fillStyle = 'rgba('+TH.glow+',0.45)'; mx.fillRect(x, Math.floor(y0+len), 2, 2); }
  }
}
function buildNear(rnd){
  nx.clearRect(0,0,VW,VH);
  const FY = 324; // 大致是地面高度,竖直方向与世界同步滚动
  // 近景:深色岩块与蕨叶剪影,只出现在画面边缘
  nx.fillStyle = 'rgba(4,3,7,0.85)';
  for (let i=0;i<10;i++){
    const x = rnd()*VW, w = 20 + rnd()*50, h = 12 + rnd()*30;
    nx.beginPath(); nx.moveTo(x, FY);
    nx.quadraticCurveTo(x + w*0.2, FY - h, x + w*0.5, FY - h*0.9);
    nx.quadraticCurveTo(x + w*0.85, FY - h*0.7, x + w, FY); nx.fill();
  }
  for (let i=0;i<16;i++){
    const x = rnd()*VW, base = FY - 2, n = 3 + (rnd()*4|0);
    for (let k=0;k<n;k++){
      const ang = -Math.PI/2 + (k - n/2)*0.35 + (rnd()-0.5)*0.2, len = 14 + rnd()*22;
      nx.strokeStyle = 'rgba(4,3,7,0.8)'; nx.lineWidth = 2;
      nx.beginPath(); nx.moveTo(x, base); nx.quadraticCurveTo(x + Math.cos(ang)*len*0.5, base + Math.sin(ang)*len*0.7, x + Math.cos(ang)*len, base + Math.sin(ang)*len*0.6); nx.stroke();
    }
  }
}

// ═════════════════════════════════════════════ 绘制 · 地形
function redrawTiles(){
  tx.clearRect(0,0,VW,VH);
  for (let y=0;y<GH;y++) for (let x=0;x<GW;x++){
    if (grid[y*GW+x] !== TILE.STONE) continue;
    const px = x*CELL, py = y*CELL, h = hash(x,y);
    const up = gt(x,y-1), dn = gt(x,y+1);
    tx.fillStyle = TH.rock[h > 0.66 ? 2 : h > 0.33 ? 1 : 0];
    tx.fillRect(px,py,CELL,CELL);
    // 内部:不规则的石缝与斑点
    if (h > 0.55 && h < 0.7){ tx.fillStyle = 'rgba(0,0,0,0.18)'; tx.fillRect(px+1, py+3+((h*13)|0)%3, 4, 1); tx.fillRect(px+4, py+4+((h*13)|0)%3, 1, 2); }
    if (h > 0.72){ tx.fillStyle = 'rgba(255,255,255,0.06)'; tx.fillRect(px+2+((h*97)%3|0), py+3+((h*61)%3|0), 1,1); }
    if (h > 0.985){ tx.fillStyle = TH.crystal; tx.globalAlpha = 0.5; tx.fillRect(px+3, py+4, 1, 1); tx.globalAlpha = 1; }
    if (up === TILE.EMPTY || up === TILE.LAVA){
      tx.fillStyle = TH.top[0]; tx.fillRect(px,py,CELL,2);
      tx.fillStyle = TH.top[1]; tx.fillRect(px,py,CELL,1);
      // 苔藓:从顶边垂下几像素
      if (up === TILE.EMPTY && h < 0.62){
        tx.fillStyle = TH.moss[0];
        for (let i=0;i<CELL;i++){
          const hh = hash(x*CELL+i, y*5);
          if (hh < 0.55) tx.fillRect(px+i, py, 1, 1 + (hh*4|0));
        }
        tx.fillStyle = TH.moss[1];
        for (let i=0;i<CELL;i+=2){ if (hash(x*CELL+i, y*9) < 0.5) tx.fillRect(px+i, py, 1, 1); }
      }
    }
    if (dn === TILE.EMPTY){
      tx.fillStyle = TH.under; tx.fillRect(px,py+6,CELL,2);
      // 参差的岩石下缘,让"悬空的墙"看起来是断口而不是浮块
      if (h > 0.30){ tx.fillRect(px + ((h*37)|0)%5, py+8, 2, 1); }
      if (h > 0.62){ tx.fillRect(px + ((h*53)|0)%4, py+8, 1, 2); }
      if (h > 0.85){ tx.fillRect(px + 1 + ((h*71)|0)%5, py+8, 1, 1); }
    }
    if (gt(x-1,y)===TILE.EMPTY){ tx.fillStyle = TH.sideL; tx.fillRect(px,py,1,CELL); }
    if (gt(x+1,y)===TILE.EMPTY){ tx.fillStyle = TH.sideR; tx.fillRect(px+7,py,1,CELL); }
  }
  // 静态装饰:钟乳石
  for (const d of decor){
    if (d.k === 'vine' && d.len < 12){
      tx.fillStyle = TH.under;
      tx.beginPath(); tx.moveTo(d.x-2, d.y); tx.lineTo(d.x+2, d.y); tx.lineTo(d.x, d.y + d.len*0.6); tx.closePath(); tx.fill();
    }
  }
  tilesDirty = false;
}

function drawTilesDynamic(x0, x1, y0, y1){
  for (let y=y0;y<=y1;y++) for (let x=x0;x<=x1;x++){
    const t = gt(x,y);
    const px = x*CELL, py = y*CELL;
    if (t === TILE.CRUMBLE){
      const h = hash(x,y);
      const tr = P.crumbleT > 0 ? (Math.random()-0.5)*P.crumbleT*6 : 0;
      ctx.fillStyle = '#463427'; ctx.fillRect(px+tr,py,CELL,CELL);
      ctx.fillStyle = '#5b4433'; ctx.fillRect(px+tr,py,CELL,2);
      ctx.fillStyle = '#6e5440'; ctx.fillRect(px+tr,py,CELL,1);
      ctx.fillStyle = '#33251b';
      ctx.fillRect(px+1+tr, py+4, 3,1);
      ctx.fillRect(px+4+tr, py+4, 1,1);
      ctx.fillRect(px+5+tr, py+5, 2,1);
      if (h > 0.4) ctx.fillRect(px+2+tr, py+6, 1,2);
      ctx.fillStyle = '#2a1d14';
      if (h > 0.6) ctx.fillRect(px+6+tr, py+2, 1,2);
      // 承重时裂纹变亮
      if (P.crumbleT > 0){ ctx.fillStyle = 'rgba(255,200,140,'+(P.crumbleT*1.6).toFixed(2)+')'; ctx.fillRect(px+1+tr,py+4,5,1); ctx.fillRect(px+5+tr,py+5,2,1); }
    } else if (t === TILE.LAVA){
      const tt = time*2.6 + x*0.7;
      ctx.fillStyle = '#a8240c'; ctx.fillRect(px,py,CELL,CELL);
      ctx.fillStyle = '#d33a12'; ctx.fillRect(px,py,CELL,CELL-1);
      ctx.fillStyle = 'rgba(255,120,40,'+(0.15+0.1*Math.sin(tt*0.7+y)).toFixed(2)+')'; ctx.fillRect(px+((x*3+y)%5),py+3,3,2);
      if (gt(x,y-1) !== TILE.LAVA){
        const wob = Math.sin(tt)*1.2;
        ctx.fillStyle = '#ff7a20'; ctx.fillRect(px, py+1+wob, CELL, 3);
        ctx.fillStyle = '#ffc44d'; ctx.fillRect(px, py+1+wob, CELL, 1);
      }
      const bub = Math.sin(tt*1.7 + y)*0.5+0.5;
      if (bub > 0.86){ ctx.fillStyle = '#ffd76a'; ctx.fillRect(px+3, py+4, 2,1); }
    } else if (t === TILE.VINE){
      const h = hash(x,y);
      ctx.fillStyle = '#1d3a1c'; ctx.fillRect(px,py,CELL,CELL);
      ctx.fillStyle = '#2b5526'; ctx.fillRect(px, py, CELL, CELL-1);
      ctx.fillStyle = '#3f7a33';
      ctx.fillRect(px+1, py+1, 2, 6);
      ctx.fillRect(px+5, py+2, 2, 5);
      ctx.fillStyle = '#2a4a22';
      ctx.fillRect(px+3, py+3, 1, 4);
      if (h > 0.55){ ctx.fillStyle = '#5b9c41'; ctx.fillRect(px+1, py+1, 1, 2); }
      if (h > 0.8){ ctx.fillStyle = '#7ec45a'; ctx.fillRect(px+5, py+3, 1, 1); }
    } else if (t === TILE.DOOR){
      const open = doorOpen[doorId[y*GW+x]];
      if (open){
        ctx.fillStyle = 'rgba(120,110,150,0.10)'; ctx.fillRect(px,py,CELL,CELL);
        ctx.fillStyle = 'rgba(150,180,230,0.22)'; ctx.fillRect(px,py,1,CELL);
        ctx.fillRect(px+7,py,1,CELL);
      } else {
        ctx.fillStyle = '#2b2a3a'; ctx.fillRect(px,py,CELL,CELL);
        ctx.fillStyle = '#5d5b7a'; ctx.fillRect(px+1, py, 2, CELL);
        ctx.fillRect(px+5, py, 2, CELL);
        ctx.fillStyle = '#7d7ba0'; ctx.fillRect(px+1, py+1, 1, 3);
        ctx.fillStyle = '#8f8db3'; ctx.fillRect(px+5, py+5, 1, 3);
      }
    } else if (t === TILE.PLATE){
      const p = plateList.find(q => q.y === y && q.x0 <= x && x <= q.x1);
      const down = p && p.pressed;
      ctx.fillStyle = '#15141c'; ctx.fillRect(px,py,CELL,CELL);
      ctx.fillStyle = down ? '#33505f' : '#3d4f5e';
      ctx.fillRect(px+1, py+1, CELL-2, CELL-2);
      ctx.fillStyle = down ? '#9fe4ff' : '#8fa8bb';
      ctx.fillRect(px+1, py+1, CELL-2, 1);
      ctx.fillStyle = '#0e0d14';
      ctx.fillRect(px+1, py+5, CELL-2, 1);
      if (down){
        ctx.fillStyle = 'rgba(159,228,255,'+(0.25+0.2*Math.sin(time*8))+')';
        ctx.fillRect(px+2, py+2, CELL-4, 3);
      } else {
        ctx.fillStyle = '#5d7382';
        ctx.fillRect(px+3, py+3, 2, 2);
      }
    }
  }
}

function drawBlocks(){
  for (const bl of blockList){
    const m = MAT[bl.mat] || MAT.meat;
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(bl.x-1, bl.y+bl.h+1, bl.w+2, 2);
    ctx.fillStyle = m.edge;
    ctx.fillRect(bl.x-1, bl.y-1, bl.w+2, bl.h+2);
    ctx.fillStyle = m.c;
    ctx.fillRect(bl.x, bl.y, bl.w, bl.h);
    ctx.fillStyle = m.c2;
    ctx.fillRect(bl.x, bl.y+bl.h-2, bl.w, 2);
    ctx.fillStyle = 'rgba(255,255,255,0.28)';
    ctx.fillRect(bl.x+1, bl.y, bl.w-2, 1);
  }
}

function drawDecor(vx0, vx1, vy0, vy1){
  for (const d of decor){
    if (d.x < vx0-20 || d.x > vx1+20 || d.y < vy0-30 || d.y > vy1+30) continue;
    if (d.k === 'tuft'){
      const sw = Math.sin(time*2 + d.s*3)*0.8;
      ctx.fillStyle = TH.moss[0];
      ctx.fillRect(d.x, d.y-2, 1, 2); ctx.fillRect(Math.round(d.x+2+sw*0.5), d.y-3, 1, 3); ctx.fillRect(d.x+4, d.y-2, 1, 2);
      ctx.fillStyle = TH.moss[1]; ctx.fillRect(Math.round(d.x+2+sw), d.y-4, 1, 1);
    } else if (d.k === 'mush'){
      const p = 0.7 + 0.3*Math.sin(time*2.2 + d.s*5);
      ctx.fillStyle = '#d9d0e6'; ctx.fillRect(d.x+1, d.y-3, 1, 3);
      ctx.globalAlpha = p; ctx.fillStyle = TH.mush;
      ctx.fillRect(d.x-1, d.y-5, 5, 2); ctx.fillRect(d.x, d.y-6, 3, 1);
      ctx.globalAlpha = 1; ctx.fillStyle = '#ffffff'; ctx.fillRect(d.x, d.y-5, 1, 1);
    } else if (d.k === 'crystal'){
      const g = Math.sin(time*3 + d.s*7) > 0.92;
      ctx.fillStyle = TH.crystal;
      ctx.fillRect(d.x+1, d.y-6, 2, 6); ctx.fillRect(d.x+3, d.y-4, 2, 4); ctx.fillRect(d.x, d.y-3, 1, 3);
      ctx.fillStyle = g ? '#ffffff' : 'rgba(255,255,255,0.45)'; ctx.fillRect(d.x+1, d.y-6, 1, 2);
    } else if (d.k === 'vine' && d.len >= 12){
      ctx.fillStyle = TH.moss[0];
      for (let y=0;y<d.len;y+=2){
        const sx = Math.sin(time*1.4 + d.s*4 + y*0.15) * (y/d.len) * 2;
        ctx.fillRect(Math.round(d.x+sx), d.y+y, 1, 2);
        if ((y + (d.s*10|0)) % 6 === 0){ ctx.fillStyle = TH.moss[1]; ctx.fillRect(Math.round(d.x+sx)+1, d.y+y, 1, 1); ctx.fillStyle = TH.moss[0]; }
      }
    }
  }
  // 滴水
  ctx.fillStyle = 'rgba(160,210,255,0.8)';
  for (const d of drips) ctx.fillRect(Math.round(d.x), Math.round(d.y), 1, 2);
}

function drawExit(){
  const L = LEVELS[level];
  if (!L.exit) return;
  const [ex,ey,ew,eh] = L.exit;
  const x = ex*CELL, y = ey*CELL, w = ew*CELL, h = eh*CELL;
  ctx.fillStyle = exitLocked ? '#211d2c' : '#191428';
  ctx.fillRect(x+3, y+4, w-6, h-4);
  // 拱门
  ctx.fillStyle = exitLocked ? '#3c3550' : '#8e74c8';
  ctx.fillRect(x+2, y+2, w-4, 2);
  ctx.fillRect(x+2, y+2, 2, h-2);
  ctx.fillRect(x+w-4, y+2, 2, h-2);
  ctx.fillStyle = exitLocked ? '#4c4463' : '#c3b0ff';
  ctx.fillRect(x+w/2-1, y, 2, 2);
  if (!exitLocked){
    const rows = h-6;
    for (let i=0;i<rows;i+=2){
      const a = 0.10 + 0.22*Math.abs(Math.sin(time*2 + i*0.4));
      ctx.fillStyle = 'rgba(180,150,255,'+a+')';
      ctx.fillRect(x+4, y+4+i, w-8, 1);
    }
    // 旋转的光点
    for (let i=0;i<4;i++){
      const a = time*2.4 + i*Math.PI/2;
      ctx.fillStyle = 'rgba(220,205,255,0.8)';
      ctx.fillRect(Math.round(x+w/2 + Math.cos(a)*(w/2-4)), Math.round(y+h/2+1 + Math.sin(a)*(h/2-5)), 1, 1);
    }
  } else {
    ctx.fillStyle = '#6a5f86';
    for (let i=0;i<3;i++) ctx.fillRect(x+4, y+6+i*6, w-8, 2);
    ctx.fillStyle = '#a99bd0'; ctx.fillRect(x+w/2-2, y+h/2-1, 4, 3); ctx.fillRect(x+w/2-1, y+h/2-3, 2, 2);
  }
}

// ═════════════════════════════════════════════ 绘制 · 角色
function drawItems(){
  for (const it of items){
    const m = MAT[it.mat] || MAT.meat;
    const bob = Math.sin(it.t*4) * 1.5;
    const iy = Math.round(it.y-4+bob), ix = Math.round(it.x);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(ix-3, Math.round(it.y)+6, 7, 2);
    ctx.fillStyle = m.edge; ctx.fillRect(ix-4, iy-1, 8, 8);
    ctx.fillStyle = m.c;    ctx.fillRect(ix-3, iy, 6, 6);
    ctx.fillStyle = m.c2;   ctx.fillRect(ix-3, iy+5, 6, 1);
    ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(ix-3, iy, 4, 1);
    if (it.mat === 'fire' && Math.random() < 0.3){ ctx.fillStyle = '#ffe08a'; ctx.fillRect(ix-2+((Math.random()*4)|0), iy-2, 1, 1); }
    if (it.mat === 'grass'){ ctx.fillStyle = m.c; ctx.fillRect(ix-2, iy-2, 1, 2); ctx.fillRect(ix+1, iy-3, 1, 3); }
    if (Math.sin(it.t*3 + it.x) > 0.97){ ctx.fillStyle = '#fff'; ctx.fillRect(ix+1, iy+1, 1,1); }
  }
}

function drawBlob(cells, w, h, x0, y0, edge, outline, alpha){
  ctx.globalAlpha = alpha === undefined ? 1 : alpha;
  for (let j=0;j<h;j++) for (let i=0;i<w;i++){
    const m = cells(i,j); if (!m) continue;
    const x = x0+i*CELL, y = y0+j*CELL;
    ctx.fillStyle = m.c; ctx.fillRect(x,y,CELL,CELL);
    ctx.fillStyle = m.c2; ctx.fillRect(x, y+CELL-2, CELL, 2);
    if (!cells(i,j-1)) { ctx.fillStyle = 'rgba(255,255,255,0.24)'; ctx.fillRect(x+1,y,CELL-2,1); }
    else { ctx.fillStyle = 'rgba(255,255,255,0.07)'; ctx.fillRect(x,y,CELL,1); }
  }
  for (let j=0;j<h;j++) for (let i=0;i<w;i++){
    if (!cells(i,j)) continue;
    const x = x0+i*CELL, y = y0+j*CELL;
    ctx.fillStyle = outline;
    if (!cells(i,j-1)) ctx.fillRect(x-1,y-1,CELL+2,2);
    if (!cells(i,j+1)) ctx.fillRect(x-1,y+CELL-1,CELL+2,2);
    if (!cells(i-1,j)) ctx.fillRect(x-1,y-1,2,CELL+2);
    if (!cells(i+1,j)) ctx.fillRect(x+CELL-1,y-1,2,CELL+2);
  }
  ctx.globalAlpha = 1;
}

// 每种材质一层细节纹理
function cellTexture(id, x, y, i, j, topOpen){
  const t = time;
  if (id === 2){ // 草:顶上冒草尖
    if (topOpen){
      ctx.fillStyle = MAT.grass.c;
      const sw = Math.round(Math.sin(t*3 + i)*0.6);
      ctx.fillRect(x+1, y-1, 1, 1); ctx.fillRect(x+4+sw, y-2, 1, 2); ctx.fillRect(x+6, y-1, 1, 1);
    }
    ctx.fillStyle = '#a8f07a'; ctx.fillRect(x+2+((i*3+j)%4), y+3, 1, 1);
  } else if (id === 3){ // 石:斑点
    ctx.fillStyle = '#7d8294'; ctx.fillRect(x+1+((i*5+j*3)%5), y+2+((i+j*7)%3), 2, 1); ctx.fillRect(x+5-((i+j)%3), y+5, 1, 1);
    ctx.fillStyle = '#c9cdd9'; ctx.fillRect(x+1, y+1, 1, 1);
  } else if (id === 4){ // 水:流动的高光
    const o = Math.floor((t*10 + i*3 + j*5) % 10);
    ctx.fillStyle = '#b8ecff'; if (o < 7) ctx.fillRect(x+o, y+2, 2, 1);
    ctx.fillStyle = 'rgba(255,255,255,0.5)'; if (o > 3) ctx.fillRect(x+o-3, y+4, 1, 1);
  } else if (id === 5){ // 火:闪烁
    const f = Math.sin(t*18 + i*2.3 + j*1.7);
    ctx.fillStyle = f > 0 ? '#ffd35a' : '#ff8a2a'; ctx.fillRect(x+1, y+1, CELL-2, 3);
    if (topOpen){ ctx.fillStyle = '#ffe9a0'; ctx.fillRect(x+2+((t*20+i)|0)%4, y-1-(f>0.5?1:0), 1, 1); }
  } else { // 肉
    ctx.fillStyle = '#ffc2cd'; ctx.fillRect(x+2, y+2, 2, 1);
  }
}

function drawPlayer(){
  const b = bounds(); if (b.empty) return;
  const cellOf = (i,j)=>{
    if (i<0||j<0||i>=MW||j>=MH) return 0;
    return P.mask[j*MW+i];
  };
  const hurt = P.flash > 0;
  const white = hurt && Math.floor(P.flash*20)%2 === 0;
  if (P.invuln > 0 && Math.floor(P.invuln*30)%2 === 0) ctx.globalAlpha = 0.55;
  // 落地阴影
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.fillRect(Math.round(b.x+2), Math.round(b.y+b.h), b.w-4, 1);

  const pvx = b.x + b.w/2, pvy = b.y + b.h;
  ctx.save();
  ctx.translate(pvx, pvy); ctx.scale(P.sx, P.sy); ctx.translate(-pvx, -pvy);

  // 出生:各格从四周飞回来
  const born = P.bornT > 0 ? Math.pow(P.bornT/0.5, 2) : 0;
  const off = (i,j)=> born ? [ (i-4)*born*22, (j-4)*born*22 - born*10 ] : [0,0];

  for (let j=0;j<MH;j++) for (let i=0;i<MW;i++){
    const id = cellOf(i,j); if (!id) continue;
    const m = BY_ID[id];
    const [ox, oy] = off(i,j);
    const pop = P.pop[j*MW+i];
    const g = pop > 0 ? Math.round(pop*2) : 0;
    const x = Math.round(P.px + i*CELL + ox) - g, y = Math.round(P.py + j*CELL + oy) - g, s = CELL + g*2;
    ctx.fillStyle = white ? '#ffffff' : m.c; ctx.fillRect(x,y,s,s);
    if (!white){
      ctx.fillStyle = m.c2; ctx.fillRect(x, y+s-2, s, 2);
      const topOpen = !cellOf(i,j-1);
      if (topOpen){ ctx.fillStyle = 'rgba(255,255,255,0.24)'; ctx.fillRect(x+1,y,s-2,1); }
      cellTexture(id, x, y, i, j, topOpen);
    }
  }
  // 轮廓
  ctx.fillStyle = '#150c16';
  for (let j=0;j<MH;j++) for (let i=0;i<MW;i++){
    if (!cellOf(i,j)) continue;
    const [ox, oy] = off(i,j);
    const x = Math.round(P.px + i*CELL + ox), y = Math.round(P.py + j*CELL + oy);
    if (!cellOf(i,j-1)) ctx.fillRect(x-1,y-1,CELL+2,2);
    if (!cellOf(i,j+1)) ctx.fillRect(x-1,y+CELL-1,CELL+2,2);
    if (!cellOf(i-1,j)) ctx.fillRect(x-1,y-1,2,CELL+2);
    if (!cellOf(i+1,j)) ctx.fillRect(x+CELL-1,y-1,2,CELL+2);
  }

  // 脸
  const jTop = b.j0;
  const eyeXs = [];
  for (let i=b.i0;i<=b.i1;i++) if (cellOf(i,jTop)) eyeXs.push(i);
  if (eyeXs.length && !born){
    const mid = eyeXs[Math.floor(eyeXs.length/2)];
    let lx = (eyeXs.length > 1 ? eyeXs[Math.floor((eyeXs.length-1)/2)] : mid);
    let rx = (eyeXs.length > 1 ? eyeXs[Math.ceil((eyeXs.length-1)/2)] : mid);
    const baseY = P.py + jTop*CELL + 3;
    const blink = P.blink > 0;
    const pupils = Math.sign(P.vx) || P.face;
    const ouch = P.hurtFace > 0;
    const drawEye = (ex, side)=>{
      if (ouch){ // > <
        ctx.fillStyle = '#3a1524';
        ctx.fillRect(ex + (side<0?0:1), baseY, 1, 1); ctx.fillRect(ex + (side<0?1:0), baseY+1, 1, 1); ctx.fillRect(ex + (side<0?0:1), baseY+2, 1, 1);
        return;
      }
      if (blink){ ctx.fillStyle = '#2a1420'; ctx.fillRect(ex, baseY+1, 2, 1); return; }
      ctx.fillStyle = '#fff8fa'; ctx.fillRect(ex, baseY, 2, 2);
      ctx.fillStyle = '#3a1524';
      ctx.fillRect(ex + (pupils>0?1:0), baseY + (P.vy > 200 ? 1 : P.vy < -100 ? 0 : 1), 1, 1);
    };
    let e1, e2;
    if (lx === rx){ e1 = P.px + lx*CELL + 1; e2 = P.px + lx*CELL + 5; }
    else { e1 = P.px + lx*CELL + 4; e2 = P.px + rx*CELL + 2; }
    drawEye(e1, -1); drawEye(e2, 1);
    // 嘴:起跳张嘴,受伤咧嘴
    const mx2 = Math.round((e1 + e2)/2 + 1);
    if (ouch){ ctx.fillStyle = '#3a1524'; ctx.fillRect(mx2-1, baseY+4, 3, 1); }
    else if (!P.onGround && P.vy < -80){ ctx.fillStyle = '#3a1524'; ctx.fillRect(mx2, baseY+3, 1, 2); }
    // 濒死:冒汗
    if (b.n <= 2 && Math.sin(time*6) > 0){ ctx.fillStyle = '#9fe4ff'; ctx.fillRect(Math.round(b.x+b.w+1), Math.round(b.y-1), 1, 2); }
  }
  ctx.restore();
  ctx.globalAlpha = 1;
}

function drawEnemies(){
  const b = bounds();
  for (const e of enemies){
    if (e.born > 0.2 && Math.floor(e.born*30)%2===0) continue;
    const w = e.w/CELL|0, h = e.h/CELL|0;
    const m = MAT[e.mat] || MAT.meat;
    const show = Math.max(0, Math.ceil(e.hp / e.maxhp * w*h));
    const fl = e.flash > 0 && Math.floor(e.flash*24)%2===0;
    const cells = (i,j)=>{
      if (i<0||j<0||i>=w||j>=h) return null;
      const idx = (h-1-j)*w + i;            // 从上往下掉格:血少了"头"先没
      if (idx >= show) return null;
      if (fl) return {c:'#ffffff',c2:'#ffd0d8'};
      return {c:m.c, c2:m.c2};
    };
    const pvx = e.x + e.w/2, pvy = e.y + e.h;
    ctx.save();
    ctx.translate(pvx, pvy); ctx.scale(2 - e.sq, e.sq); ctx.translate(-pvx, -pvy);
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(Math.round(e.x+2), Math.round(e.y+e.h), e.w-4, 1);
    drawBlob(cells, w, h, e.x, e.y, null, '#120a12', 1);
    // 找到最上面那一排作为"脸"
    let topJ = 0; for (let j=0;j<h;j++){ let any=false; for (let i=0;i<w;i++) if (cells(i,j)) any=true; if (any){ topJ=j; break; } }
    const eyY = Math.round(e.y + topJ*CELL + 3);
    const ecx = Math.round(e.x + e.w/2);
    const toP = (b.x + b.w/2) > ecx ? 1 : 0;
    if (e.mat === 'stone'){
      // 石头怪:裂纹 + 发光的眼
      ctx.fillStyle = '#5d6272';
      ctx.fillRect(Math.round(e.x+5), Math.round(e.y+e.h-10), 1, 4); ctx.fillRect(Math.round(e.x+6), Math.round(e.y+e.h-7), 3, 1);
      ctx.fillRect(Math.round(e.x+e.w-9), Math.round(e.y+topJ*CELL+9), 1, 5);
      ctx.fillStyle = e.wind > 0 ? '#ffe36a' : '#ff8a3a';
      ctx.fillRect(ecx-6, eyY, 3, 2); ctx.fillRect(ecx+3, eyY, 3, 2);
      ctx.fillStyle = '#2b0f18'; ctx.fillRect(ecx-7, eyY-2, 5, 1); ctx.fillRect(ecx+3, eyY-2, 5, 1);
    } else {
      ctx.fillStyle = '#fff8fa';
      ctx.fillRect(ecx-5, eyY, 2,2); ctx.fillRect(ecx+3, eyY, 2,2);
      ctx.fillStyle = '#2b0f18';
      ctx.fillRect(ecx-5+toP, eyY+1, 1,1); ctx.fillRect(ecx+3+toP, eyY+1, 1,1);
      // 怒眉 + 起跳前张嘴露牙
      ctx.fillRect(ecx-6, eyY-2, 3, 1); ctx.fillRect(ecx+4, eyY-2, 3, 1);
      if (e.wind > 0 || !e.onGround){
        ctx.fillStyle = '#2b0f18'; ctx.fillRect(ecx-3, eyY+4, 6, 3);
        ctx.fillStyle = '#fff8fa'; ctx.fillRect(ecx-3, eyY+4, 1, 1); ctx.fillRect(ecx-1, eyY+4, 1, 1); ctx.fillRect(ecx+1, eyY+4, 1, 1);
      } else { ctx.fillStyle = '#2b0f18'; ctx.fillRect(ecx-2, eyY+5, 4, 1); }
    }
    ctx.restore();
    // 血条(小而克制)
    if (e.hp < e.maxhp){
      ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(Math.round(e.x), Math.round(e.y-5), e.w, 2);
      ctx.fillStyle = m.c; ctx.fillRect(Math.round(e.x), Math.round(e.y-5), Math.round(e.w*e.hp/e.maxhp), 2);
    }
  }
}

// ═════════════════════════════════════════════ 绘制 · 特效
function drawParticles(){
  for (const p of particles){
    const a = clamp(p.life/p.max, 0, 1);
    ctx.globalAlpha = a;
    if (p.chunk){
      const x = Math.round(p.x), y = Math.round(p.y);
      ctx.fillStyle = p.c2; ctx.fillRect(x-1, y-1, p.s+2, p.s+2);
      ctx.fillStyle = p.c;  ctx.fillRect(x, y, p.s, p.s);
    } else {
      ctx.fillStyle = p.c;
      ctx.fillRect(Math.round(p.x), Math.round(p.y), p.s, p.s);
    }
  }
  ctx.globalAlpha = 1;
}
function drawFloaters(){
  ctx.font = '7px "PingFang SC","Microsoft YaHei",monospace';
  ctx.textAlign = 'center';
  for (const f of floaters){
    const a = clamp(1 - (f.t-0.5)/0.4, 0, 1);
    ctx.globalAlpha = a;
    ctx.fillStyle = '#0b0a10'; ctx.fillText(f.text, Math.round(f.x)+1, Math.round(f.y)+1);
    ctx.fillStyle = f.c; ctx.fillText(f.text, Math.round(f.x), Math.round(f.y));
  }
  ctx.globalAlpha = 1; ctx.textAlign = 'left';
}

function drawGhost(){
  if (state !== 'play' || !mouse.inside || touchMode || editing) return;
  const i = Math.floor((mouse.x - P.px)/CELL);
  const j = Math.floor((mouse.y - P.py)/CELL);
  if (i<0||j<0||i>=MW||j>=MH) return;
  if (P.mask[j*MW+i]){
    if (!connectedWithout(i,j)) return;
    const w = cellWorld(i,j);
    ctx.strokeStyle = 'rgba(255,120,120,'+(0.5+0.3*Math.sin(time*10))+')';
    ctx.lineWidth = 1;
    ctx.strokeRect(w.x+0.5, w.y+0.5, CELL-1, CELL-1);
    return;
  }
  if (!canPlace(i,j)) return;
  const w = cellWorld(i,j);
  if (P.bag[P.sel] <= 0){
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.strokeRect(w.x+0.5, w.y+0.5, CELL-1, CELL-1);
    return;
  }
  const m = MAT[P.sel];
  ctx.globalAlpha = 0.42;
  ctx.fillStyle = m.c; ctx.fillRect(w.x, w.y, CELL, CELL);
  ctx.globalAlpha = 1;
  ctx.strokeStyle = P.denyT > 0 ? '#ff5a5a' : 'rgba(255,255,255,0.85)';
  ctx.strokeRect(w.x+0.5, w.y+0.5, CELL-1, CELL-1);
}

// ─── 光照:暗场 + 光源挖洞 + 叠加彩色辉光
const LS = 2; // 光照图分辨率 = 视野 / 2
const [lightCv, lx] = mkCanvas(VIEW_W/LS, VIEW_H/LS);
let lxReady = true;
const glowSprites = {};
function glowSprite(color){
  if (glowSprites[color]) return glowSprites[color];
  const [c, x] = mkCanvas(64, 64);
  const g = x.createRadialGradient(32,32,0,32,32,32);
  g.addColorStop(0, color); g.addColorStop(0.35, color.replace(/[\d.]+\)$/, m => (parseFloat(m)*0.45).toFixed(3)+')'));
  g.addColorStop(1, color.replace(/[\d.]+\)$/, '0)'));
  x.fillStyle = g; x.fillRect(0,0,64,64);
  return (glowSprites[color] = c);
}
const holeSprite = glowSprite('rgba(255,255,255,1)');
function hexA(hex, a){
  const n = parseInt(hex.slice(1), 16);
  return 'rgba('+((n>>16)&255)+','+((n>>8)&255)+','+(n&255)+','+a+')';
}
let quality = 2, perfAcc = 0, perfN = 0;
function collectLights(){
  const L = [];
  const vx0 = cam.x - 40, vx1 = cam.x + VIEW_W + 40, vy0 = cam.y - 40, vy1 = cam.y + VIEW_H + 40;
  const vis = (x,y)=> x > vx0 && x < vx1 && y > vy0 && y < vy1;
  const b = bounds();
  if (!b.empty) L.push({x:b.x+b.w/2, y:b.y+b.h/2, r:92, i:0.95, c:null});
  else if (state === 'dead') L.push({x:P.px+32, y:P.py+32, r:60*(1-timer), i:0.6, c:null});
  const Lv = LEVELS[level];
  if (Lv.exit){
    const ex = Lv.exit;
    L.push({x:(ex[0]+ex[2]/2)*CELL, y:(ex[1]+ex[3]/2)*CELL, r:exitLocked?36:62, i:exitLocked?0.45:0.85, c:exitLocked?'rgba(120,100,180,0.18)':'rgba(170,140,255,0.32)'});
  }
  for (let k=0;k<lavaTop.length;k+=2){
    const x = lavaTop[k]*CELL+4, y = lavaY[lavaTop[k]]*CELL;
    if (vis(x,y)) L.push({x, y, r:30 + Math.sin(time*2+k)*3, i:0.7, c:'rgba(255,110,30,0.22)'});
  }
  for (const d of decor){
    if (!d.light || !vis(d.x, d.y)) continue;
    const isM = d.k === 'mush';
    L.push({x:d.x+2, y:d.y-4, r:isM?22:26, i:isM?0.55*(0.7+0.3*Math.sin(time*2.2+d.s*5)):0.6, c:hexA(isM?TH.mush:TH.crystal, 0.22)});
  }
  if (!b.empty){
    let nf = 0;
    for (let k=0;k<MW*MH && nf<4;k++) if (P.mask[k] === MAT.fire.id){ nf++;
      const w = cellWorld(k%MW,(k/MW)|0); L.push({x:w.x+4, y:w.y+4, r:28+Math.random()*4, i:0.5, c:'rgba(255,170,60,0.28)'}); }
  }
  for (const it of items) if (it.mat === 'fire' && vis(it.x, it.y)) L.push({x:it.x, y:it.y, r:18, i:0.4, c:'rgba(255,170,60,0.2)'});
  for (const e of enemies) if (e.mat === 'stone' && vis(e.x, e.y)) L.push({x:e.x+e.w/2, y:e.y+6, r:14, i:0.3, c:'rgba(255,140,60,0.2)'});
  return L;
}
function drawGlow(lights){
  if (quality < 2) return;
  ctx.globalCompositeOperation = 'lighter';
  for (const l of lights){
    if (!l.c) continue;
    const s = glowSprite(l.c), r = l.r*1.1;
    ctx.drawImage(s, l.x - r, l.y - r, r*2, r*2);
  }
  ctx.globalCompositeOperation = 'source-over';
}
function drawLightmap(lights){
  if (quality < 1) return;
  const W = lightCv.width, H = lightCv.height;
  lx.globalCompositeOperation = 'source-over';
  lx.clearRect(0,0,W,H);
  lx.fillStyle = 'rgba(3,2,8,'+TH.amb+')'; lx.fillRect(0,0,W,H);
  lx.globalCompositeOperation = 'destination-out';
  for (const l of lights){
    const x = (l.x - cam.x)/LS, y = (l.y - cam.y)/LS, r = l.r/LS;
    if (x < -r || y < -r || x > W+r || y > H+r) continue;
    lx.globalAlpha = l.i; lx.drawImage(holeSprite, x-r, y-r, r*2, r*2);
  }
  lx.globalAlpha = 1; lx.globalCompositeOperation = 'source-over';
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(lightCv, 0, 0, CW, CH);
  ctx.imageSmoothingEnabled = false;
}

const wFill = $('wbar').querySelector('i'), wMark = $('wbar').querySelector('em');
let lastW = -1, lastMark = null;
function drawHudInCanvas(){
  // 重量条放在 DOM 顶栏里,由 flex 布局排开,不会被按钮挡住
  const wsum = bounds().empty ? 0 : weight();
  if (wsum !== lastW){
    lastW = wsum;
    const pct = clamp(wsum/28, 0, 1);
    wFill.style.width = (pct*100).toFixed(1)+'%';
    wFill.style.background = pct > 0.8 ? '#ff7a5a' : wsum >= 12.5 ? '#c9a46a' : '#9a86d8';
  }
  const mark = LEVELS[level].rects.some(r => r.t === 'crumble');
  if (mark !== lastMark){ lastMark = mark; wMark.style.display = mark ? 'block' : 'none'; }
}

// ═════════════════════════════════════════════ 渲染
function render(){
  if (tilesDirty) redrawTiles();
  const sx = (shake > 0.3 ? (Math.random()-0.5)*shake : 0) + shakeX;
  const sy = (shake > 0.3 ? (Math.random()-0.5)*shake : 0) + shakeY;
  // 视差背景:远 0.25 / 中 0.5 / 近 0.75
  ctx.setTransform(ZOOM,0,0,ZOOM, Math.round(-cam.x*0.25*ZOOM + sx*0.3), Math.round(-cam.y*0.25*ZOOM + sy*0.3));
  ctx.drawImage(farCv, 0, 0);
  ctx.setTransform(ZOOM,0,0,ZOOM, Math.round(-cam.x*0.5*ZOOM + sx*0.5), Math.round(-cam.y*0.5*ZOOM + sy*0.5));
  ctx.drawImage(midCv, 0, 0);
  // 漂浮孢子(屏幕空间里慢慢飘)
  for (let i=0;i<9;i++){
    const t = time*(0.25+i*0.06) + i*1.7;
    const x = (i*137 + Math.sin(t)*40 + cam.x*0.5) % VW;   // 世界坐标
    const y = 90 + ((i*61) % 200) + Math.sin(t*1.4)*12 + cam.y*0.5;
    ctx.globalAlpha = 0.18 + 0.14*Math.sin(t*3);
    ctx.fillStyle = TH.spore;
    ctx.fillRect(Math.round(x), Math.round(y), 2, 2);
  }
  ctx.globalAlpha = 1;
  ctx.setTransform(ZOOM,0,0,ZOOM, Math.round(-cam.x*0.75*ZOOM + sx*0.8), Math.round(-cam.y*ZOOM + sy));
  ctx.drawImage(nearCv, 0, 0);

  // 世界
  ctx.setTransform(ZOOM, 0, 0, ZOOM, Math.round(-cam.x*ZOOM + sx), Math.round(-cam.y*ZOOM + sy));
  ctx.drawImage(tileCv, 0, 0);
  const x0 = Math.max(0, Math.floor(cam.x/CELL)-1), x1 = Math.min(GW-1, Math.ceil((cam.x+VIEW_W)/CELL)+1);
  const y0 = Math.max(0, Math.floor(cam.y/CELL)-1), y1 = Math.min(GH-1, Math.ceil((cam.y+VIEW_H)/CELL)+1);
  drawTilesDynamic(x0, x1, y0, y1);
  drawDecor(cam.x, cam.x+VIEW_W, cam.y, cam.y+VIEW_H);
  // 地面以下的黑暗,让底部不显得是一块灰板
  const gd = ctx.createLinearGradient(0, 318, 0, 362);
  gd.addColorStop(0, 'rgba(6,5,10,0)');
  gd.addColorStop(0.55, 'rgba(6,5,10,0.55)');
  gd.addColorStop(1, 'rgba(4,3,7,0.95)');
  ctx.fillStyle = gd;
  ctx.fillRect(cam.x-8, 318, VIEW_W+16, 44);
  drawExit();
  drawItems();
  drawBlocks();
  drawEnemies();
  if (state === 'play' || state === 'clear' || editing) drawPlayer();
  drawParticles();
  drawGhost();
  drawTutorial();
  const lights = collectLights();
  drawGlow(lights);
  drawFloaters();

  ctx.setTransform(1,0,0,1,0,0);
  drawLightmap(lights);
  drawHudInCanvas();

  // 受伤红闪
  if (P.flash > 0.01){
    ctx.fillStyle = 'rgba(255,40,60,'+(P.flash*0.18)+')';
    ctx.fillRect(0,0,CW,CH);
  }
  // 濒死:红色暗角跟着心跳
  if (state === 'play' && bounds().n <= 2){
    const p = Math.max(0, Math.sin(time*7.4))*0.35;
    const vg2 = ctx.createRadialGradient(CW/2,CH/2,CH*0.3,CW/2,CH/2,CH*0.85);
    vg2.addColorStop(0,'rgba(120,0,20,0)'); vg2.addColorStop(1,'rgba(150,10,30,'+p.toFixed(2)+')');
    ctx.fillStyle = vg2; ctx.fillRect(0,0,CW,CH);
  }
  // 转场
  if (state === 'clear'){
    const a = clamp(timer/0.85, 0, 1);
    ctx.fillStyle = 'rgba(6,5,10,'+a+')';
    ctx.fillRect(0,0,CW,CH);
  }
  if (state === 'play' && levelT < 0.4){
    ctx.fillStyle = 'rgba(6,5,10,'+(1-levelT/0.4).toFixed(2)+')'; ctx.fillRect(0,0,CW,CH);
  }
  if (state === 'dead'){
    ctx.fillStyle = 'rgba(20,4,10,'+clamp(timer*0.5,0,0.55)+')';
    ctx.fillRect(0,0,CW,CH);
    ctx.fillStyle = 'rgba(255,180,190,'+clamp(1-timer*1.2,0,1)+')';
    ctx.font = 'bold 16px "PingFang SC","Microsoft YaHei",monospace';
    ctx.textAlign = 'center';
    ctx.fillText('散　了', CW/2, CH/2);
    ctx.textAlign = 'left';
  }
  if (state === 'win'){
    ctx.fillStyle = 'rgba(6,5,10,0.6)'; ctx.fillRect(0,0,CW,CH);
  }
  // 暗角
  ctx.fillStyle = vignette; ctx.fillRect(0,0,CW,CH);
}
let vignette = null;
function makeVignette(){ const r = Math.max(CW, CH); const g = ctx.createRadialGradient(CW/2,CH/2,r*0.2,CW/2,CH/2,r*0.6); g.addColorStop(0,'rgba(0,0,0,0)'); g.addColorStop(1,'rgba(0,0,0,0.55)'); vignette = g; }
makeVignette();

// ─── 横屏 / 竖屏视野:手机竖着拿时画布变成 3:4,看得更高、画面更大
function applyViewMode(){
  const portrait = touchMode && window.innerHeight > window.innerWidth * 1.1;
  const w = portrait ? 360 : 640, h = portrait ? 480 : 360;
  document.body.classList.toggle('tall', portrait);
  if (w === CW && h === CH) return;
  CW = w; CH = h;
  cv.width = CW; cv.height = CH; ctx.imageSmoothingEnabled = false;
  VIEW_W = CW/ZOOM; VIEW_H = CH/ZOOM;
  lightCv.width = VIEW_W/LS; lightCv.height = VIEW_H/LS; lx.imageSmoothingEnabled = false;
  makeVignette();
  camSnap();
}

// ═════════════════════════════════════════════ 循环
let last = 0, paused = false;
function frame(t){
  requestAnimationFrame(frame);
  if (paused) { last = t; return; }
  if (!last) last = t;
  const raw = (t-last)/1000; last = t;
  const dt = clamp(raw, 0, 0.05);
  // 自动降画质:连续 2 秒平均帧时间 > 24ms 就关掉辉光层
  perfAcc += raw; perfN++;
  if (perfN >= 120){
    if (perfAcc/perfN > 0.024 && quality > 0){ quality--; if (quality === 0) MAX_PARTICLES = 180; }
    perfAcc = 0; perfN = 0;
  }
  update(dt);
  render();
  if (editing) drawEditor();
}
document.addEventListener('visibilitychange', ()=>{
  paused = document.hidden;
  if (document.hidden){ for (const k in keys) keys[k] = false; touchDir = 0; endMove(); releaseJump(); if (AC) AC.suspend().catch(()=>{}); if (state === 'play' && !editing) openMenu(); }
  else if (AC && !muted) AC.resume().catch(()=>{});
});
// iOS 地址栏伸缩时 100vh 不可靠,用真实 innerHeight
function fitVH(){ document.documentElement.style.setProperty('--vh', (window.innerHeight*0.01)+'px'); applyViewMode(); }
addEventListener('resize', fitVH); addEventListener('orientationchange', ()=> setTimeout(fitVH, 250));
fitVH();

// ═════════════════════════════════════════════ 开始
const ov = $('overlay');
function refreshContinue(){
  const best = store.get('best', 0);
  if (best > 0 && best < LEVELS.length){
    $('btnCont').textContent = '继续 · ' + LEVELS[best].name.split(' · ')[0];
    $('btnCont').classList.remove('hide');
  } else $('btnCont').classList.add('hide');
}
function showTitle(){
  closeEditor(true);
  loadLevel(0, true);
  state = 'title';
  document.body.classList.add('menu');
  refreshContinue();
  ov.classList.remove('hide');
}
// iPhone 的 Safari 不支持网页全屏:提示"添加到主屏幕"
(function(){
  let inFrame = false; try { inFrame = window.self !== window.top; } catch(e){ inFrame = true; }
  const ios = /iP(hone|od|ad)/.test(navigator.userAgent || '') || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone = navigator.standalone || (window.matchMedia && matchMedia('(display-mode: standalone)').matches);
  if (ios && !standalone && !inFrame) $('iosTip').hidden = false;
})();
function startGame(cont){
  if (state === 'win') { location.reload(); return; }
  if (ov.classList.contains('hide')) return;
  ov.classList.add('hide');
  document.body.classList.remove('menu');
  ac();
  stats.start = performance.now(); stats.deaths = 0;
  loadLevel(cont ? store.get('best', 0) : 0);
}
$('btnStart').addEventListener('click', ()=> startGame(false));
$('btnCont').addEventListener('click', ()=> startGame(true));
refreshContinue();
setMuted(muted);
if (IS_TOUCH) setTouchMode(true);

let bootLevel = -1;
/* @debug-start */
const qs = new URLSearchParams(location.search);
if (qs.has('lv')) bootLevel = parseInt(qs.get('lv'),10)||0;
const hm = /^#lv(\d)$/.exec(location.hash || '');     // 试玩跳关:链接后加 #lv3 = 第 4 关
if (hm) bootLevel = Math.min(+hm[1], LEVELS.length-1);
/* @debug-end */
if (bootLevel >= 0){
  ov.classList.add('hide');
  loadLevel(bootLevel);
} else {
  loadLevel(0);
  state = 'title';
  document.body.classList.add('menu');
  $('card').classList.remove('show');
}
requestAnimationFrame(frame);

/* @debug-start */
// 调试 / 自动化测试钩子(生产构建会删掉这一段)
window.__game = {
  get state(){ return state; },
  set state(v){ state = v; },
  P, LEVELS, loadLevel, get level(){ return level; },
  enemies: ()=> enemies, items: ()=> items, bounds, weight,
  placeAt, removeAt, canPlace, connectedWithout, undo, damage: (x,y)=> damagePlayerNear(x,y,1), get tutDone(){ return tutDone; }, tutStep: ()=> tutStep(),
  tile: (x,y)=> gt(x,y), locked: ()=> exitLocked,
  doors: ()=> ({...doorOpen}), plates: ()=> plateList.map(p=>({id:p.id,load:+p.load.toFixed(1),pressed:p.pressed})),
  blocks: ()=> blockList, dropBlock, pickBlock, blockAction,
  vineCount: ()=> grid.reduce((n,t)=>n+(t===TILE.VINE?1:0),0),
  setMouse: (x,y)=>{ mouse.x = x; mouse.y = y; mouse.inside = true; },
  get cam(){ return cam; },
  key: (code, down)=>{ keys[code] = !!down; if (down && code === 'Space') pressJump(); if (!down && code === 'Space') releaseJump(); },
  step: (dt)=> update(dt),
  render, drawEditor, openEditor, closeEditor, get editing(){ return editing; }, nearestEditable,
  get quality(){ return quality; },
};
/* @debug-end */
})();
