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

// ═════════════════════════════════════════════ 材质
const MAT = {
  meat:  {id:1,key:'meat', label:'肉', c:'#ff8fa3', c2:'#d75f78', edge:'#4a1526', w:1.0, hard:1},
  grass: {id:2,key:'grass',label:'草', c:'#8be05c', c2:'#4f9e37', edge:'#1b3b11', w:0.5, hard:1},
  stone: {id:3,key:'stone',label:'石', c:'#a9aebe', c2:'#6d7283', edge:'#22252e', w:2.8, hard:3},
  water: {id:4,key:'water',label:'水', c:'#63d2ff', c2:'#2a8fbf', edge:'#0a2a3c', w:0.3, hard:0},
  fire:  {id:5,key:'fire', label:'火', c:'#ffb02e', c2:'#e0551b', edge:'#401104', w:0.8, hard:3},
};
const ORDER = ['meat','grass','stone','water','fire'];
const MAT_HELP = {
  meat:'肉 · 基础身体,可削下再贴回,用来调整形状',
  grass:'草 · 贴在身上可唤醒蘑菇、催生藤蔓;身体不会自动长草',
  stone:'石 · 贴上变重,能压碎脆地板、踩亮重踏板;也能作护甲',
  water:'水 · 消耗身上一格水,可冷却炽热门、关闭喷口或挡一次火',
  fire:'火 · 贴在身上靠近荆棘自动烧开,也能克制软敌人;熄灭后回背包',
};
const BY_ID = {};
for (const k of ORDER) BY_ID[MAT[k].id] = MAT[k];
function matKey(id){ const m = BY_ID[id]; return m ? m.key : 'meat'; }

const TILE = {EMPTY:0, STONE:1, CRUMBLE:2, LAVA:3};

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
let kJump = false, jumpBuf = 0, touchDir = 0, bufferedTouchJump = false, bookOpen = false;
const mouse = {x:-999, y:-999, inside:false};

function pressJump(touch){ jumpBuf = 0.18; bufferedTouchJump = !!touch; kJump = true; keys['Space'] = true; }
function releaseJump(){ kJump = false; keys['Space'] = false; }
function jumpHeld(){ return !!keys['Space']; }

addEventListener('keydown', e=>{
  if (bookOpen) return;
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
addEventListener('blur', clearInput);

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
  if (state !== 'play' || editing || menuOpen || bookOpen) return;
  const p = screenToWorld(e);
  if (e.pointerType === 'mouse'){
    if (e.button !== 0 && e.button !== 2) return;
    e.preventDefault();
    if (touchMode) setTouchMode(false);
    mouse.x = p.x; mouse.y = p.y;
    const i = Math.floor((p.x - P.px)/CELL), j = Math.floor((p.y - P.py)/CELL);
    // 鼠标和触控板统一:点击身体削格,点击空位贴格;保留右键削格。
    if (e.button === 2) removeAt(i,j);
    else if (i>=0 && j>=0 && i<MW && j<MH && P.mask[j*MW+i]) removeAt(i,j);
    else placeAt(i,j);
    return;
  }
  // 手机只把角色当作豆板入口；不再在移动中的小角色上误削一格。
  if (!touchMode) setTouchMode(true);
  const pick = nearestEditable(p.x, p.y);
  if (!pick) return;
  e.preventDefault();
  openEditor();
});
cv.addEventListener('wheel', e=>{
  e.preventDefault();
  const i = ORDER.indexOf(P.sel);
  selectMat(ORDER[(i + (e.deltaY>0?1:ORDER.length-1)) % ORDER.length]);
}, {passive:false});

// ─── 触屏手柄
const moveEl = $('move'), knob = moveEl.querySelector('.knob');
const arL = moveEl.querySelector('.ar.l'), arR = moveEl.querySelector('.ar.r');
let movePid = null, jumpTouch = false, jumpPid = null;
function updMove(e){
  const r = moveEl.getBoundingClientRect();
  const dx = e.clientX - (r.left + r.width/2);
  const dead = r.width*0.025;
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
  if (state !== 'play' || editing || menuOpen || bookOpen) return;
  if (movePid !== null) return;
  movePid = e.pointerId; try { moveEl.setPointerCapture(e.pointerId); } catch(_){}
  updMove(e);
});
moveEl.addEventListener('pointermove', e=>{ if (e.pointerId === movePid) updMove(e); });
moveEl.addEventListener('pointerup', e=>{ if (e.pointerId === movePid) endMove(); });
moveEl.querySelectorAll('.direction').forEach((button,i)=>{
  button.addEventListener('keydown',e=>{if(e.code!=='Space'&&e.code!=='Enter')return;e.preventDefault();e.stopPropagation();if(state==='play'&&!editing&&!menuOpen&&!bookOpen)touchDir=i===0?-1:1;});
  button.addEventListener('keyup',e=>{if(e.code==='Space'||e.code==='Enter'){e.preventDefault();e.stopPropagation();endMove();}});
  button.addEventListener('blur',endMove);
});
moveEl.addEventListener('pointercancel', e=>{ if (e.pointerId === movePid) endMove(); });
moveEl.addEventListener('lostpointercapture', e=>{ if (e.pointerId === movePid) endMove(); });

const jBtn = $('btnJump');
jBtn.addEventListener('pointerdown', e=>{
  e.preventDefault(); ac();
  if (state !== 'play' || editing || menuOpen || bookOpen) return;
  if (jumpPid !== null) return;
  jumpPid = e.pointerId;
  try { jBtn.setPointerCapture(e.pointerId); } catch(_){}
  jumpTouch = true; jBtn.classList.add('down');
  if (state === 'play' && !editing) pressJump(true);
});
const jEnd = e=>{ if (e && e.pointerId !== jumpPid) return; if (!jumpTouch) return; jumpPid = null; jumpTouch = false; jBtn.classList.remove('down'); releaseJump(); };
jBtn.addEventListener('pointerup', jEnd);
jBtn.addEventListener('pointercancel', jEnd);
jBtn.addEventListener('lostpointercapture', jEnd);
function clearInput(){
  for (const k in keys) keys[k]=false;
  jumpBuf=0; bufferedTouchJump=false;
  endMove(); jEnd(); releaseJump();
}

const uBtn = $('btnUndo');
uBtn.addEventListener('pointerdown', e=>{ e.preventDefault(); ac(); if (!editing && !menuOpen) undo(); });
$('edUndo').addEventListener('click', ()=> undo());
const eBtn = $('btnEdit');
eBtn.addEventListener('pointerdown', e=>{
  e.preventDefault(); ac();
  if (state !== 'play' || menuOpen || bookOpen) return;
  eBtn.classList.add('down');
  if (editing) closeEditor(); else openEditor();
});
eBtn.addEventListener('pointerup', ()=> eBtn.classList.remove('down'));
eBtn.addEventListener('pointercancel', ()=> eBtn.classList.remove('down'));

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
let devices = [], seeds = [], checkpoint = null;
function gt(x,y){ if (x<0||y<0||x>=GW||y>=GH) return TILE.STONE; return grid[y*GW+x]; }
function setT(x,y,v){ if (x<0||y<0||x>=GW||y>=GH) return; grid[y*GW+x] = v; tilesDirty = true; }
function solidAt(x,y){ const t = gt(x,y); return t===TILE.STONE || t===TILE.CRUMBLE; }
function boxSolid(px,py,w,h){
  if (w<=0||h<=0) return false;
  if (devices.some(d=>['gate','bramble','emberwall'].includes(d.type) && !d.open && rectOverlap({x:px,y:py,w,h},d))) return true;
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
           moss:['#3f8f73','#62c79a'], crystal:'#b58cff', mush:'#8be0ff', spore:'#b9a6ff', amb:0.37 },
  earth: { bg:['#130f0c','#0e0b09','#080605'], glow:'150,96,52', far:'36,26,18', mid:'26,19,13',
           rock:['#35302b','#302b27','#3b352f'], top:['#56493d','#6a5a49'], under:'#1b1714', sideL:'#433a32', sideR:'#211c18',
           moss:['#6e7f3a','#9cb04c'], crystal:'#ffb35c', mush:'#ffd27a', spore:'#e8c08a', amb:0.39 },
  ember: { bg:['#170b0b','#110809','#090405'], glow:'200,60,30', far:'40,16,14', mid:'28,11,10',
           rock:['#33262a','#2d2125','#3a2b2f'], top:['#58404a','#6c4e57'], under:'#1b1215', sideL:'#45323a', sideR:'#21171a',
           moss:['#8a3b2a','#c9643a'], crystal:'#ff7a4a', mush:'#ffb25e', spore:'#ff9b6b', amb:0.34 },
  frost: { bg:['#0b1018','#080c13','#05070b'], glow:'60,110,170', far:'16,24,38', mid:'11,17,28',
           rock:['#2a3140','#262c3a','#303849'], top:['#46546b','#5a6c86'], under:'#161b25', sideL:'#36404f', sideR:'#1a1f29',
           moss:['#3b7f95','#5ec8e0'], crystal:'#8fe3ff', mush:'#c6f4ff', spore:'#a6d8ff', amb:0.37 },
  fungal:{ bg:['#0b120e','#08100c','#050906'], glow:'60,150,90', far:'16,32,22', mid:'11,23,16',
           rock:['#29322d','#252d29','#2f3a34'], top:['#435a4c','#56725f'], under:'#151c18', sideL:'#34433a', sideR:'#19201c',
           moss:['#4c9a3c','#86d65a'], crystal:'#a6ff7a', mush:'#ff8ad8', spore:'#c8ff9a', amb:0.39 },
  dusk:  { bg:['#120c18','#0d0912','#07050a'], glow:'190,120,200', far:'34,20,40', mid:'24,14,29',
           rock:['#30293a','#2b2534','#372f42'], top:['#54475f','#6a5a77'], under:'#1a1520', sideL:'#40364b', sideR:'#1e1924',
           moss:['#8a5fb0','#d7a8ff'], crystal:'#ffd36b', mush:'#ff9ecf', spore:'#ffd9a6', amb:0.36 },
};
let TH = THEMES.violet, themeName = 'violet';

// ═════════════════════════════════════════════ 关卡
const LEVELS = [
  {
    name:'壹 · 缝隙', sub:'削扁自己', theme:'violet',
    hint:'<b>点击身体</b>削掉格子 —— 削扁了才钻得进墙缝　·　<b>点击空位</b>贴回去　·　A D 移动 / 空格 跳　·　<b>E</b> 改造面板',
    hintTouch:'点<b>豆板</b>，用<b>瘦身钻洞</b>；更窄的缝可以<b>再瘦一层</b>',
    start:[6,37],
    rects:[
      {x:0,y:40,w:80,h:4,t:'stone'},
      {x:0,y:22,w:80,h:3,t:'stone'},
      {x:28,y:25,w:2,h:13,t:'stone'},
      {x:48,y:25,w:2,h:14,t:'stone'},
      {x:62,y:33,w:6,h:1,t:'stone'},
    ],
    items:[ {c:[11,38],m:'grass'}, {c:[19,38],m:'stone'}, {c:[22,38],m:'meat'}, {c:[40,38],m:'grass'} ],
    enemies:[],
    exit:[73,37,3,3],
  },
  {
    name:'贰 · 撑不住', sub:'变重', theme:'earth',
    hint:'石很重。站在脆地板上,重量够了它自己会裂　·　右上角 <b>W</b> 是你的重量',
    hintTouch:'石很重。贴上石头站到脆地板上,重量够了它会裂',
    start:[6,37],
    rects:[
      {x:0,y:40,w:44,h:1,t:'stone'},
      {x:44,y:40,w:8,h:1,t:'crumble'},
      {x:52,y:40,w:28,h:1,t:'stone'},
      {x:0,y:22,w:80,h:2,t:'stone'},
      {x:20,y:33,w:6,h:1,t:'stone'},
      {x:33,y:28,w:7,h:1,t:'stone'},
    ],
    items:[ {c:[20,39],m:'stone'}, {c:[24,39],m:'stone'}, {c:[36,39],m:'stone'}, {c:[30,38],m:'grass'} ],
    enemies:[],
    exit:[49,41,3,3],
  },
  {
    name:'叁 · 过火', sub:'带着水走', theme:'ember',
    hint:'身上带水,岩浆只烧水不烧你。水会蒸发,别磨蹭',
    start:[6,37],
    rects:[
      {x:0,y:40,w:25,h:4,t:'stone'},
      {x:25,y:42,w:31,h:2,t:'lava'},
      {x:56,y:40,w:24,h:4,t:'stone'},
      {x:0,y:22,w:80,h:2,t:'stone'},
      {x:14,y:34,w:5,h:1,t:'stone'},
      {x:60,y:34,w:5,h:1,t:'stone'},
    ],
    items:[ {c:[11,39],m:'water'},{c:[13,39],m:'water'},{c:[15,39],m:'water'},
            {c:[18,39],m:'water'},{c:[20,39],m:'water'},{c:[22,39],m:'water'},
            {c:[60,33],m:'fire'},{c:[62,33],m:'fire'} ],
    enemies:[ {c:[66,37],w:3,h:3,m:'meat'} ],
    exit:[73,37,3,3],
  },
  {
    name:'肆 · 硬碰硬', sub:'改装再上场', theme:'frost',
    hint:'撞上去比的是接触面的材质:火/石 硬　肉/草 中　水 软　·　从上面踩也算',
    start:[6,37],
    rects:[
      {x:0,y:40,w:80,h:4,t:'stone'},
      {x:0,y:22,w:80,h:2,t:'stone'},
      {x:18,y:33,w:7,h:1,t:'stone'},
      {x:38,y:33,w:7,h:1,t:'stone'},
      {x:28,y:27,w:7,h:1,t:'stone'},
    ],
    items:[ {c:[8,38],m:'stone'},{c:[10,38],m:'stone'},{c:[12,38],m:'fire'},
            {c:[14,38],m:'fire'},{c:[16,38],m:'water'},{c:[6,38],m:'grass'} ],
    enemies:[
      {c:[44,37],w:3,h:3,m:'meat',speed:44},
      {c:[55,37],w:3,h:3,m:'meat',speed:50},
      {c:[66,36],w:5,h:4,m:'stone',speed:26,big:true},
    ],
    exit:[75,37,3,3], lock:true,
  },
  {
    name:'伍 · 先瘦后胖', sub:'钻进去,再压下去', theme:'fungal',
    hint:'先削扁钻过矮洞,再把里面的石头贴上身,压塌脆地板',
    start:[6,37],
    rects:[
      {x:0,y:40,w:56,h:1,t:'stone'},
      {x:56,y:40,w:8,h:1,t:'crumble'},
      {x:64,y:40,w:16,h:1,t:'stone'},
      {x:0,y:22,w:80,h:2,t:'stone'},
      {x:24,y:24,w:14,h:15,t:'stone'},
      {x:46,y:36,w:6,h:1,t:'stone'},
      {x:68,y:34,w:6,h:1,t:'stone'},
    ],
    items:[ {c:[16,38],m:'meat'}, {c:[47,34],m:'stone'}, {c:[50,34],m:'stone'}, {c:[70,32],m:'grass'} ],
    enemies:[],
    exit:[58,41,3,3],
  },
  {
    name:'陆 · 低头过火', sub:'两格高', theme:'ember',
    hint:'岩浆上方的石板压得很低 —— 带够水,把自己压成两格高再下去',
    start:[5,37],
    rects:[
      {x:0,y:40,w:22,h:4,t:'stone'},
      {x:22,y:42,w:34,h:2,t:'lava'},
      {x:56,y:40,w:24,h:4,t:'stone'},
      {x:0,y:22,w:80,h:2,t:'stone'},
      {x:30,y:24,w:18,h:18,t:'stone'},
      {x:60,y:34,w:5,h:1,t:'stone'},
    ],
    items:[ {c:[8,39],m:'water'},{c:[10,39],m:'water'},{c:[12,39],m:'water'},
            {c:[14,39],m:'water'},{c:[16,39],m:'water'},{c:[18,39],m:'water'},
            {c:[9,37],m:'water'},{c:[13,37],m:'water'},{c:[17,37],m:'water'},
            {c:[61,33],m:'fire'},{c:[63,33],m:'fire'} ],
    enemies:[ {c:[68,37],w:3,h:3,m:'meat',speed:46} ],
    exit:[75,37,3,3],
  },
  {
    name:'柒 · 自己的形状', sub:'轻着上去,硬着下来', theme:'dusk',
    hint:'材料散在台阶上。轻才跳得高,硬才打得赢 —— 打光它们,出口在最高处',
    start:[4,37],
    rects:[
      {x:0,y:40,w:80,h:4,t:'stone'},
      {x:6,y:35,w:7,h:1,t:'stone'},
      {x:17,y:31,w:7,h:1,t:'stone'},
      {x:28,y:27,w:7,h:1,t:'stone'},
      {x:39,y:23,w:7,h:1,t:'stone'},
      {x:50,y:19,w:7,h:1,t:'stone'},
      {x:61,y:15,w:7,h:1,t:'stone'},
      {x:71,y:11,w:8,h:1,t:'stone'},
    ],
    items:[ {c:[2,39],m:'stone'}, {c:[8,34],m:'grass'}, {c:[19,30],m:'grass'},
            {c:[30,26],m:'fire'}, {c:[32,26],m:'fire'}, {c:[41,22],m:'stone'}, {c:[43,22],m:'stone'},
            {c:[52,18],m:'fire'}, {c:[63,14],m:'water'} ],
    enemies:[
      {c:[40,37],w:3,h:3,m:'meat',speed:46},
      {c:[52,37],w:3,h:3,m:'meat',speed:52},
      {c:[64,36],w:5,h:4,m:'stone',speed:28,big:true,hp:12},
    ],
    exit:[74,8,3,3], lock:true,
  },
  {
    name:'捌 · 草醒森林', sub:'草唤醒植物', theme:'fungal',
    hint:'先把草贴在身上,靠近灰色蘑菇把它唤醒,踩上就弹!绿色种芽还能长出藤蔓踏板',
    start:[5,37],
    rects:[{x:0,y:40,w:80,h:4,t:'stone'}, {x:19,y:31,w:16,h:1,t:'stone'},
           {x:38,y:23,w:18,h:1,t:'stone'}, {x:60,y:15,w:19,h:1,t:'stone'}],
    devices:[{type:'spring',x:11,y:40,w:4,power:560,needs:'grass'}, {type:'spring',x:29,y:31,w:4,power:560,needs:'grass'},
             {type:'spring',x:51,y:23,w:4,power:560,needs:'grass'}, {type:'checkpoint',x:22,y:31},
             {type:'checkpoint',x:42,y:23}, {type:'bud',x:25,y:31,target:'forest'},
             {type:'vine',x:35,y:31,w:4,id:'forest'}],
    seeds:[[36,28],[40,20],[62,12]], items:[{c:[7,39],m:'grass'},{c:[25,30],m:'grass'}],
    enemies:[], exit:[74,12,3,3],
  },
  {
    name:'玖 · 石头的开关', sub:'先变重,再搭车', theme:'frost',
    hint:'先重装开第一道门,收石头搭浮台 · 中层再重装踩亮第二踏板,再轻装登顶;两道门永久锁定',
    start:[5,37],
    rects:[{x:0,y:40,w:80,h:4,t:'stone'}, {x:38,y:28,w:11,h:1,t:'stone'},
           {x:65,y:19,w:14,h:1,t:'stone'}],
    devices:[{type:'plate',x:18,y:40,w:5,weight:12.5,target:'a'},
             {type:'gate',x:28,y:22,w:2,h:18,id:'a'},
             {type:'lift',x:31,y:40,toX:31,toY:28,w:5,period:7},
             {type:'lift',x:51,y:28,toX:55,toY:19,w:8,period:7},
             {type:'checkpoint',x:40,y:28}, {type:'plate',x:42,y:28,w:5,weight:12.5,target:'b'},
             {type:'gate',x:64,y:1,w:1,h:39,id:'b'}],
    seeds:[[11,34],[44,24],[59,16]],
    items:[{c:[9,39],m:'stone'},{c:[12,39],m:'stone'},{c:[15,39],m:'stone'}],
    enemies:[],exit:[74,16,3,3],
  },
  {
    name:'拾 · 水到火熄', sub:'带水冷却开路', theme:'ember',
    hint:'水关喷口 → 走上层点亮蓝色共鸣柱 → 再用一格水冷却红门;上层储水补给可取,下层看准火焰节拍',
    start:[5,37],
    rects:[{x:0,y:40,w:80,h:4,t:'stone'}, {x:11,y:36,w:4,h:1,t:'stone'}, {x:17,y:33,w:8,h:1,t:'stone'},
           {x:30,y:29,w:9,h:1,t:'stone'}, {x:44,y:33,w:9,h:1,t:'stone'}],
    devices:[{type:'jet',x:23,y:40,w:3,h:6,period:3.8,phase:0,id:'water-jet'},
             {type:'jet',x:40,y:40,w:3,h:8,period:3.8,phase:1.2},
             {type:'jet',x:57,y:40,w:3,h:7,period:3.8,phase:2.4},
             {type:'checkpoint',x:33,y:40}, {type:'checkpoint',x:50,y:40},
             {type:'valve',x:19,y:40,target:'water-jet'}, {type:'emberwall',x:64,y:22,w:2,h:18},
             {type:'relay',x:34,y:29,mat:'water',target:'tide'},
             {type:'gate',x:70,y:1,w:1,h:39,id:'tide'}],
    seeds:[[21,30],[34,26],[60,30]],
    items:[{c:[9,39],m:'water'},{c:[12,39],m:'water'},{c:[15,39],m:'water'},
           {c:[34,28],m:'water'},{c:[35,28],m:'water'},{c:[34,39],m:'water'},{c:[51,39],m:'water'},{c:[61,39],m:'water'},{c:[62,39],m:'water'}],
    enemies:[{c:[69,37],w:3,h:3,m:'meat',speed:44}],exit:[75,37,3,3],
  },
  {
    name:'拾壹 · 火开荆途', sub:'带火烧出一条路', theme:'dusk',
    hint:'火烧荆棘开路 → 上层用火点灯、草唤醒种芽,两枚徽记一起开终门 · 藤蔓支路与浮台都能登顶',
    start:[5,37],
    rects:[{x:0,y:40,w:80,h:4,t:'stone'}, {x:16,y:23,w:11,h:15,t:'stone'},
           {x:39,y:29,w:12,h:1,t:'stone'}, {x:65,y:19,w:14,h:1,t:'stone'}],
    devices:[{type:'spring',x:32,y:40,w:4,power:500},
             {type:'lift',x:51,y:29,toX:55,toY:19,w:8,period:7},
             {type:'checkpoint',x:42,y:29}, {type:'jet',x:59,y:40,w:3,h:6,period:4,phase:0},
             {type:'bramble',x:29,y:20,w:2,h:20}, {type:'bud',x:45,y:29,target:'garden'},
             {type:'relay',x:48,y:29,mat:'fire',target:'garden'},
             {type:'gate',x:64,y:1,w:1,h:39,id:'garden'},
             {type:'vine',x:53,y:25,w:6,id:'garden'}, {type:'vine',x:60,y:21,w:5,id:'garden'}],
    seeds:[[22,39],[55,22],[61,16]],
    items:[{c:[10,39],m:'fire'},{c:[27,39],m:'fire'},{c:[28,39],m:'meat'},{c:[41,28],m:'fire'},{c:[44,28],m:'grass'}],
    enemies:[],exit:[74,16,3,3],
  },
  {
    name:'拾贰 · 洞穴游乐场', sub:'把学会的,玩出来', theme:'violet',
    hint:'石压开关 → 水冷却红门 → 火烧荆棘 → 草唤醒顶层蘑菇 · 四种材料,都要贴上身才有用!',
    start:[5,37],
    rects:[{x:0,y:40,w:80,h:4,t:'stone'}, {x:39,y:29,w:12,h:1,t:'stone'},
           {x:67,y:17,w:12,h:1,t:'stone'}, {x:75,y:9,w:4,h:1,t:'stone'}],
    devices:[{type:'plate',x:15,y:40,w:5,weight:12.5,target:'final'},
             {type:'gate',x:23,y:20,w:2,h:20,id:'final'},
             {type:'emberwall',x:27,y:20,w:1,h:20},
             {type:'bramble',x:31,y:20,w:1,h:20},
             {type:'spring',x:36,y:40,w:3,power:510},
             {type:'checkpoint',x:42,y:29},
             {type:'lift',x:51,y:29,toX:57,toY:22,w:8,period:6.8},
             {type:'spring',x:70,y:17,w:4,power:440,needs:'grass'}],
    seeds:[[18,33],[45,25],[73,8]],
    items:[{c:[8,39],m:'stone'},{c:[11,39],m:'stone'},{c:[13,39],m:'water'},
           {c:[26,39],m:'water'},{c:[29,39],m:'fire'},{c:[30,39],m:'fire'},{c:[43,28],m:'grass'}],
    enemies:[],exit:[76,6,3,3],
  },
];
// 老关卡保留入门路线,把难度放进可选的高处与绕路收集。
const EARLY_SEEDS = [
  [[19,33],[40,37],[65,30]], [[21,30],[35,25],[48,38]], [[16,31],[39,38],[62,31]],
  [[21,30],[31,24],[41,30]], [[18,34],[48,32],[60,38]], [[20,38],[26,40],[62,31]],
  [[9,32],[42,20],[74,6]],
];
EARLY_SEEDS.forEach((list,i)=>{ LEVELS[i].seeds=list; });
function levelHint(){
  const L = LEVELS[level]; if (!L) return '';
  return (touchMode && L.hintTouch) ? L.hintTouch : (L.hint || '');
}

// ═════════════════════════════════════════════ 洞穴机关:触碰即互动,不增加按键
function loadDevices(L){
  devices = (L.devices || []).map(d=>Object.assign({},d,{
    x:d.x*CELL,y:d.y*CELL,w:(d.w||3)*CELL,h:(d.h||1)*CELL,
    startX:d.x*CELL,startY:d.y*CELL,t:0,cd:0,open:false,lit:false,active:false,warning:false,grown:false,progress:0,quenched:false,
  }));
  seeds = (L.seeds || []).map(c=>({x:c[0]*CELL+4,y:c[1]*CELL+4,got:false}));
}
function updateDevices(dt){
  for (const d of devices){
    d.t += dt; d.cd = Math.max(0,d.cd-dt);
    if (d.type === 'jet'){
      const cycle = (d.t+(d.phase||0)) % d.period;
      d.warning = !d.quenched && cycle >= d.period*0.46 && cycle < d.period*0.62;
      d.active = !d.quenched && cycle >= d.period*0.62;
    }
    if (d.type !== 'lift') continue;
    const b = bounds(), oldX = d.x, oldY = d.y;
    const riding = !b.empty && P.vy >= 0 && Math.abs(b.y+b.h-oldY)<1.1 && b.x+b.w>oldX+1 && b.x<oldX+d.w-1;
    const t = (1-Math.cos(d.t*Math.PI*2/d.period))/2;
    d.x = lerp(d.startX,d.toX*CELL,t); d.y = lerp(d.startY,d.toY*CELL,t);
    if (riding){
      tryMoveX(d.x-oldX); tryMoveY(d.y-oldY);
      P.onGround = true; P.coyote = 0.14;
    }
  }
}
function snapshotCheckpoint(index){
  checkpoint = {index,px:P.px,py:P.py,mask:Array.from(P.mask),bag:Object.assign({},P.bag),sel:P.sel,
    grid:Array.from(grid),devices:devices.map(d=>Object.assign({},d)),seeds:seeds.map(s=>Object.assign({},s)),
    items:items.map(i=>Object.assign({},i)),enemies:enemies.map(e=>Object.assign({},e)),exitLocked};
  toast('复活点已点亮 · 散架后从这里继续');
  arp([523,784,1046],70); vibrate(20);
}
function respawnCheckpoint(){
  // 硬核模式:没有青旗,散架就从关卡开头重来
  const saved = store.get('hard', false) ? null : checkpoint;
  loadLevel(level,true);
  if (!saved){ toast('硬核:从头再来'); return; }
  checkpoint = saved;
  P.mask.set(saved.mask); P.bag = Object.assign({},saved.bag); P.sel = saved.sel;
  P.px=saved.px; P.py=saved.py; P.vx=P.vy=0; P.invuln=1.5; jumpBuf=0; P.touchFlight=false;
  grid.set(saved.grid); tilesDirty=true;
  devices=saved.devices.map(d=>Object.assign({},d)); seeds=saved.seeds.map(s=>Object.assign({},s));
  items=saved.items.map(i=>Object.assign({},i)); enemies=saved.enemies.map(e=>Object.assign({},e));
  exitLocked=saved.exitLocked; hist=[];
  camSnap(); syncBag(); syncUndo();
  toast('从青旗继续');
}
function consumeBodyMaterial(key){
  const id=MAT[key].id;
  for(let k=0;k<P.mask.length;k++){
    if(P.mask[k]===id && connectedWithout(k%MW,(k/MW)|0)){
      const w=cellWorld(k%MW,(k/MW)|0);
      P.mask[k]=0;
      burst(w.x+4,w.y+4,MAT[key].c,8,80,2);
      return true;
    }
  }
  return false;
}
function refreshChannel(target){
  if(!target)return;
  const switches=devices.filter(d=>d.target===target&&['plate','bud','relay','valve'].includes(d.type));
  if(!switches.length||!switches.every(d=>d.lit))return;
  for(const door of devices)if(door.type==='gate'&&door.id===target)door.open=true;
}
function interactMaterial(d,dt,b){
  const near=rectOverlap({x:b.x-10,y:b.y-10,w:b.w+20,h:b.h+20},d);
  if(d.type==='spring' && d.needs==='grass' && !d.lit && near && countMat('grass')>0){
    d.lit=true;
    burst(d.x+d.w/2,d.y-6,'#b2f284',10,100,2);
    toast('草唤醒了蘑菇 · 踩上去弹跳'); tone(500,1000,0.1,'triangle',0.05);
  }
  if(d.type==='bud' && !d.lit && near && countMat('grass')>0){
    d.lit=true;
    for(const vine of devices){
      if(vine.type==='vine' && vine.id===d.target){
        vine.grown=true;burst(vine.x+vine.w/2,vine.y,'#a7e77e',14,100,2);
      }
    }
    refreshChannel(d.target);
    toast('草唤醒种芽 · 藤蔓长成了踏板'); arp([392,523,784],70);
  }
  if(d.type==='relay' && !d.lit && near && countMat(d.mat)>0){
    d.lit=true;refreshChannel(d.target);
    burst(d.x+d.w/2,d.y-12,MAT[d.mat].c,14,90,2);
    const remaining=devices.filter(s=>s.target===d.target&&['relay','bud','plate'].includes(s.type)&&!s.lit).length;
    toast(MAT[d.mat].label+'徽记已亮'+(remaining?' · 还需 '+remaining+' 枚徽记':' · 联动门已开启'));arp([440,660,880],65);
  }
  if(d.type==='bramble' && !d.open){
    if(near && countMat('fire')>0){
      d.progress=Math.min(1,d.progress+dt/0.75);
      if(Math.random()<dt*25)ember(d.x+Math.random()*d.w,d.y+d.h*Math.random(),'#ffc25c');
      if(d.progress>=1){
        d.open=true;burst(d.x+d.w/2,b.y+b.h/2,'#ffb75d',22,150,2);
        toast('火烧开了荆棘'); noise(0.15,0.04,700,5000);kick(4,0,0);
      }
    } else d.progress=Math.max(0,d.progress-dt*0.5);
  }
  if((d.type==='emberwall' && !d.open || d.type==='valve' && !d.lit) && near && countMat('water')>0){
    d.progress=Math.min(1,d.progress+dt/0.4);
    if(d.progress>=1 && consumeBodyMaterial('water')){
      d.open=true;d.lit=true;
      if(d.type==='valve'){
        for(const jet of devices)if(jet.type==='jet' && jet.id===d.target){jet.quenched=true;jet.active=false;jet.warning=false;}
      }
      burst(d.x+d.w/2,b.y,'#c7f3ff',20,100,2);
      toast(d.type==='valve'?'用掉一格水 · 喷口关闭':'用掉一格水 · 炽热门冷却打开');
      refreshChannel(d.target);tone(1100,350,0.14,'sine',0.05);syncBag();
    }
  } else if(d.type==='emberwall'||d.type==='valve')d.progress=Math.max(0,d.progress-dt*0.8);
}
function interactDevices(dt){
  if (state !== 'play') return;
  const b = bounds(); if (b.empty) return;
  for (const d of devices){
    const over = b.x+b.w>d.x && b.x<d.x+d.w;
    interactMaterial(d,dt,b);
    const onTop = over && Math.abs(b.y+b.h-d.y)<2 && P.vy>=0;
    if (d.type === 'spring' && (!d.needs || d.lit) && onTop && d.cd<=0){
      P.vy = -(d.power||490)*clamp(1-(weight()-9)*0.015,0.7,1.12);
      P.onGround=false; P.coyote=0; jumpBuf=0; P.springFlight=true; d.cd=0.3;
      squash(0.7,1.3); kick(3,0,-1);
      burst(b.x+b.w/2,d.y-2,'#ffb2e7',12,110,2);
      tone(280,1100,0.16,'triangle',0.07); vibrate(15);
    }
    if (d.type === 'plate' && !d.lit && onTop && P.onGround){
      if (weight() >= d.weight){
        d.lit=true;
        refreshChannel(d.target);
        burst(d.x+d.w/2,d.y-3,'#ffe39a',12,100,2);
        toast('光门开了 · 踏板已锁定,可以收回石头'); arp([330,494,659],65);
      } else if (d.cd<=0){
        d.cd=2; floater(d.x+d.w/2,d.y-20,'贴石头 · 重量 ≥ '+d.weight,'#ffe39a');
      }
    }
    if (d.type === 'jet' && d.active && d.cd<=0 && P.invuln<=0 && rectOverlap(b,{x:d.x,y:d.y-d.h,w:d.w,h:d.h})){
      d.cd=0.75;
      let water=-1;
      for (let k=0;k<P.mask.length;k++) if (P.mask[k]===MAT.water.id && connectedWithout(k%MW,(k/MW)|0)){water=k;break;}
      if (water>=0){
        P.mask[water]=0; P.invuln=0.65;
        burst(b.x+b.w/2,b.y+b.h/2,'#bcefff',14,110,2);
        toast('水挡住了喷火'); tone(1000,400,0.12,'sine',0.05);
      } else {
        damagePlayerNear(d.x+d.w/2,b.y+b.h,1);
        P.kbT=0.14; P.kbV=b.x+b.w/2<d.x+d.w/2?-80:80;
      }
    }
  }
  for (const s of seeds){
    if (!s.got && rectOverlap(b,{x:s.x-5,y:s.y-6,w:10,h:12})){
      s.got=true;
      const newPaper=beadBook.collect(level,seeds.indexOf(s));
      if(newPaper.length)toast('新图纸「'+newPaper.join('、')+'」解锁了，去拼豆图册看看');
      const n=seeds.filter(s=>s.got).length;
      burst(s.x,s.y,'#ffe9a3',18,125,2); tone(660+n*100,1000+n*130,0.12,'triangle',0.06);
      floater(s.x,s.y-10,'✦ '+n+'/'+seeds.length,'#fff0ae');
      if (n===seeds.length&&!newPaper.length) toast('光种收齐了！暂停里打开拼豆图册');
    }
  }
  // 收集与战斗结算后再存档,避免复活时复制材料;仅在安全站稳时激活。
  if (P.onGround && P.invuln<=0){
    devices.forEach((d,index)=>{
      if (d.type==='checkpoint' && !d.lit && rectOverlap(bounds(),{x:d.x-6,y:d.y-26,w:20,h:27})){
        d.lit=true; snapshotCheckpoint(index);
      }
    });
  }
}

// Icons describe material function even when viewed in grayscale.
function drawMaterialBadge(mat,x,y,painter=ctx,alpha=1){
  painter.save();painter.translate(Math.round(x),Math.round(y));painter.globalAlpha=alpha;
  painter.fillStyle='#292d40';painter.beginPath();painter.moveTo(0,-7);painter.lineTo(7,0);painter.lineTo(0,7);painter.lineTo(-7,0);painter.closePath();painter.fill();
  painter.strokeStyle='#ad926c';painter.lineWidth=1;painter.stroke();
  painter.fillStyle=MAT[mat].c;
  if(mat==='grass'){
    painter.fillRect(-3,-3,4,3);painter.fillRect(1,-1,3,3);painter.fillRect(0,-1,1,5);
    painter.fillStyle='#e2f6b6';painter.fillRect(-2,-2,2,1);
  }else if(mat==='water'){
    painter.fillRect(0,-4,1,2);painter.fillRect(-1,-2,3,2);painter.fillRect(-3,0,7,3);painter.fillRect(-2,3,5,1);
    painter.fillStyle='#e3ffff';painter.fillRect(-2,1,1,2);
  }else if(mat==='fire'){
    painter.fillRect(0,-4,2,3);painter.fillRect(-2,-1,5,4);painter.fillRect(-3,1,7,2);
    painter.fillStyle='#fff0ae';painter.fillRect(0,0,2,3);
  }else if(mat==='stone'){
    painter.fillRect(-2,-3,4,1);painter.fillRect(-3,-2,7,5);painter.fillStyle='#e0e5dd';painter.fillRect(-2,-2,3,1);
    painter.fillStyle='#627086';painter.fillRect(1,0,1,3);
  }else{
    painter.fillRect(-3,-2,3,3);painter.fillRect(1,-2,3,3);painter.fillRect(-2,1,5,2);painter.fillRect(0,3,1,1);
  }
  painter.restore();
}
function drawMechanismLinks(){
  ctx.save();ctx.lineWidth=1;
  for(const d of devices){
    if(!d.target||!['plate','bud','relay','valve'].includes(d.type))continue;
    const door=devices.find(g=>g.id===d.target&&['gate','jet'].includes(g.type));if(!door)continue;
    ctx.strokeStyle=d.lit?'rgba(225,200,146,0.52)':'rgba(179,158,121,0.23)';
    ctx.setLineDash(d.lit?[]:[2,3]);
    ctx.beginPath();ctx.moveTo(d.x+d.w/2,d.y+3);ctx.lineTo(door.x+door.w/2,d.y+3);ctx.lineTo(door.x+door.w/2,door.y+door.h-3);ctx.stroke();
  }
  ctx.restore();
}
function drawChapterWayfinding(){
  const chapters={7:['VERDANT ARCHIVE','草木档案'],8:['THE COUNTERWEIGHT','石衡工坊'],9:['TIDAL FURNACE','潮汐熔炉'],10:['EMBER GARDEN','余烬花园'],11:['THE FIVEFOLD GATE','五色之门']};
  if(!chapters[level])return;
  const [en,cn]=chapters[level],L=LEVELS[level],x=L.start[0]*8-7,y=L.start[1]*8-38;
  ctx.save();ctx.fillStyle='rgba(224,198,153,0.34)';ctx.font='5px monospace';ctx.fillText(en,x,y);
  ctx.fillStyle='rgba(214,206,223,0.54)';ctx.font='7px "PingFang SC",sans-serif';ctx.fillText(cn,x,y+11);
  for(let i=0;i<3;i++){ctx.fillStyle='#635671';ctx.fillRect(x+i*5,y+18,3,1);}
  ctx.restore();
}
function drawDevices(){
  ctx.font='6px monospace'; ctx.textAlign='center';
  drawMechanismLinks();
  for (const d of devices){
    if (d.x+d.w<cam.x-50 || d.x>cam.x+VIEW_W+50) continue;
    const x=Math.round(d.x), y=Math.round(d.y);
    if (d.type==='spring'){
      const press=d.cd>0?3:0;
      const asleep=d.needs && !d.lit;
      ctx.fillStyle='#54435c';ctx.fillRect(x+5,y-7,d.w-10,7);
      ctx.fillStyle=asleep?'#514c58':'#a1437d';ctx.fillRect(x,y-9+press,d.w,4);
      ctx.fillStyle=asleep?'#797280':'#ff9dd5';ctx.fillRect(x+2,y-11+press,d.w-4,3);
      ctx.fillStyle=asleep?'#6b6473':'#b35993';ctx.fillRect(x+3,y-7+press,d.w-6,2);
      ctx.fillStyle=asleep?'#b3aaad':'#fbd4e9';ctx.fillRect(x+7,y-5,d.w-14,2);
      ctx.fillStyle='#674f66';ctx.fillRect(x+8,y-4,2,4);ctx.fillRect(x+d.w-10,y-4,2,4);
      ctx.fillStyle='#fff0d5';for(let k=5;k<d.w-3;k+=8)ctx.fillRect(x+k,y-9+press,3,2);
      ctx.fillStyle=asleep?'#a7e77e':'#ffd8ed';ctx.fillText(asleep?'草 → 醒':'↑',x+d.w/2,y-17+Math.sin(time*3)*2);
    }
    if(d.type==='vine'){
      ctx.strokeStyle=d.grown?'#72bc62':'rgba(92,133,86,0.22)';ctx.lineWidth=d.grown?3:1;
      ctx.beginPath();ctx.moveTo(x,y+4);ctx.lineTo(x+d.w,y+4);ctx.stroke();
      if(d.grown){
        ctx.fillStyle='#95dc70';ctx.fillRect(x,y,d.w,3);
        for(let k=3;k<d.w;k+=8){ctx.fillRect(x+k,y+4,3,4);ctx.fillRect(x+k-2,y+5,3,2);}
      }
    }
    if(d.type==='bud'){
      ctx.fillStyle='#5e8060';ctx.fillRect(x+d.w/2-1,y-8,2,8);
      ctx.fillStyle=d.lit?'#b8ff8d':'#69955d';ctx.fillRect(x+d.w/2-7,y-10,7,4);ctx.fillRect(x+d.w/2+1,y-13,7,4);
      ctx.fillStyle='#b5f095';ctx.fillText(d.lit?'藤蔓已长成':'草 → 生长',x+d.w/2,y-20);
    }
    if(d.type==='bramble' && !d.open){
      ctx.fillStyle='rgba(73,68,37,0.45)';ctx.fillRect(x,y,d.w,d.h);
      ctx.strokeStyle=d.progress>0?'#ef9b53':'#9a9a58';ctx.lineWidth=2;
      for(let k=4;k<d.h;k+=11){
        ctx.beginPath();ctx.moveTo(x,y+k);ctx.lineTo(x+d.w,y+k+6);ctx.moveTo(x+d.w,y+k-3);ctx.lineTo(x,y+k+4);ctx.stroke();
        ctx.fillStyle='#b4a268';ctx.fillRect(x+d.w/2,y+k-3,2,4);
      }
      const labelY=clamp(y+d.h/2,cam.y+25,cam.y+VIEW_H-25);
      ctx.fillStyle='#ffc684';ctx.fillText('火 → 烧开',x+d.w/2,labelY);
      ctx.fillStyle='#ffb963';ctx.fillRect(x,labelY+4,d.w*d.progress,2);
    }
    if(d.type==='emberwall'){
      ctx.fillStyle=d.open?'#426c80':'#853e36';ctx.fillRect(x-1,y,d.w+2,3);
      if(!d.open){
        ctx.fillStyle='#542e31';ctx.fillRect(x,y,d.w,d.h);
        for(let k=5;k<d.h;k+=9){ctx.fillStyle='#fa8751';ctx.fillRect(x+2,y+k,d.w-4,2);}
        const labelY=clamp(y+d.h/2,cam.y+25,cam.y+VIEW_H-25);
        ctx.fillStyle='#a8e9ff';ctx.fillText('水 → 冷却',x+d.w/2,labelY);
        ctx.fillRect(x,labelY+4,d.w*d.progress,2);
      }
    }
    if(d.type==='valve'){
      ctx.fillStyle='#5a839c';ctx.fillRect(x+3,y-8,d.w-6,8);
      ctx.strokeStyle=d.lit?'#b5f5f4':'#81caff';ctx.lineWidth=2;ctx.beginPath();ctx.arc(x+d.w/2,y-13,5,0,Math.PI*2);ctx.stroke();
      ctx.fillStyle='#b3eaff';ctx.fillText(d.lit?'已关闭':'水 → 关火',x+d.w/2,y-24);
    }
    if (d.type==='lift'){
      ctx.strokeStyle='rgba(125,222,255,0.25)';ctx.lineWidth=1;
      ctx.beginPath();ctx.moveTo(d.startX+d.w/2,d.startY+4);ctx.lineTo(d.toX*CELL+d.w/2,d.toY*CELL+4);ctx.stroke();
      ctx.fillStyle='#253f5b';ctx.fillRect(x,y,d.w,7);
      ctx.fillStyle='#8bdcf5';ctx.fillRect(x,y,d.w,2);
      ctx.fillStyle='#4d7890';for(let k=3;k<d.w;k+=8)ctx.fillRect(x+k,y+4,4,2);
      for(const side of [1,d.w-7]){
        ctx.fillStyle='#ba9870';ctx.fillRect(x+side,y+1,6,5);ctx.fillStyle='#e6d6a5';ctx.fillRect(x+side+2,y+2,2,2);
      }
      ctx.fillStyle='#2a3549';ctx.fillRect(x+7,y+7,d.w-14,3);
      ctx.fillStyle='#83d3d9';ctx.fillRect(x+d.w/2-3,y+7,6,1);
    }
    if (d.type==='plate'){
      ctx.fillStyle=d.lit?'#fff3ae':'#99763d';ctx.fillRect(x,y-(d.lit?1:3),d.w,3);
      ctx.fillStyle=d.lit?'#93ffd0':'#ffe39a';ctx.fillText(d.lit?'✓':'◆ '+d.weight,x+d.w/2,y-10);
    }
    if(d.type==='relay'){
      const c=MAT[d.mat].c;
      ctx.fillStyle='#383646';ctx.fillRect(x+4,y-20,d.w-8,20);
      ctx.fillStyle='#827966';ctx.fillRect(x+2,y-2,d.w-4,2);
      ctx.fillStyle=d.lit?c:'#665769';ctx.fillRect(x+6,y-23,d.w-12,3);
      drawMaterialBadge(d.mat,x+d.w/2,y-12,ctx,d.lit?1:0.6);
      ctx.fillStyle=d.lit?'#ead9b0':c;ctx.fillText(d.lit?'已共鸣':MAT[d.mat].label+' → 共鸣',x+d.w/2,y-30);
    }
    if (d.type==='gate'){
      const switches=devices.filter(s=>s.target===d.id&&['plate','relay','bud'].includes(s.type));
      switches.forEach((sw,i)=>{const yy=clamp(y+12+i*10,cam.y+26+i*10,cam.y+VIEW_H-18);ctx.fillStyle=sw.lit?'#b9ecc3':'#75644f';ctx.fillRect(x+d.w+3,yy,4,4);});
      ctx.fillStyle='#725a3d';ctx.fillRect(x-2,y,2,d.h);ctx.fillRect(x+d.w,y,2,d.h);
      ctx.fillRect(x-2,y,d.w+4,3);
      if (!d.open){
        ctx.fillStyle='rgba(255,203,111,0.2)';ctx.fillRect(x,y,d.w,d.h);
        ctx.fillStyle='#e6b56a';for(let k=3;k<d.w;k+=5)ctx.fillRect(x+k,y,1,d.h);
      } else { ctx.fillStyle='#8fffca';ctx.fillRect(x,y,d.w,2); }
    }
    if (d.type==='jet'){
      ctx.fillStyle='#5a3940';ctx.fillRect(x,y-3,d.w,3);
      ctx.fillStyle=d.active?'#fff0ac':d.warning?'#ffb756':'#5b6d77';
      for(let k=2;k<d.w;k+=5)ctx.fillRect(x+k,y-2,2,2);
      if (d.warning){ctx.fillStyle='#ffbf75';ctx.fillText('!',x+d.w/2,y-12);}
      if (d.active){
        ctx.fillStyle='rgba(255,104,35,0.38)';ctx.fillRect(x,y-d.h,d.w,d.h);
        for(let k=2;k<d.w;k+=5){
          const h=d.h*(0.74+0.2*Math.sin(time*28+k));
          ctx.fillStyle='#ff9c45';ctx.fillRect(x+k,y-h,3,h);
          ctx.fillStyle='#ffe8a0';ctx.fillRect(x+k+1,y-h*0.6,1,h*0.6);
        }
      }
    }
    if (d.type==='checkpoint'){
      ctx.fillStyle='#5c6d76';ctx.fillRect(x,y-25,2,25);
      ctx.fillStyle=d.lit?'#a5ffe1':'#3c847a';ctx.fillRect(x+2,y-25,12,9);
      ctx.fillStyle=d.lit?'#e3fff1':'#82baab';ctx.fillRect(x+4,y-23,2,5);
      ctx.fillStyle='#463d4f';ctx.fillRect(x-3,y-2,8,3);
      ctx.fillStyle='#d1b080';ctx.fillRect(x-2,y-28,6,3);
      ctx.fillStyle=d.lit?'#d9ffdf':'#719a8a';ctx.fillRect(x,y-32,2,4);
    }
  }
  for (const s of seeds){
    if (s.got) continue;
    const y=s.y+Math.sin(time*3+s.x)*2;
    ctx.fillStyle='rgba(255,217,111,0.14)';ctx.fillRect(s.x-7,y-7,14,14);
    ctx.fillStyle='#ffde83';ctx.beginPath();ctx.moveTo(s.x,y-5);ctx.lineTo(s.x+4,y);ctx.lineTo(s.x,y+5);ctx.lineTo(s.x-4,y);ctx.closePath();ctx.fill();
    ctx.fillStyle='#fff8d2';ctx.fillRect(s.x-1,y-2,2,3);
  }
  ctx.textAlign='left';
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
  burnT:0, evapT:0, lavaT:0, crumbleT:0,
  bornT:0, springFlight:false, touchFlight:false,
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
  P.invuln = 0; P.denyT = 0; P.flash = 0; P.crumbleT = 0; P.bornT = 0.5; P.springFlight=false; P.touchFlight=false;
  P.burnT = 0; P.evapT = 0; P.lavaT = 0; P.shake = 0;
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
  let blocked = false, landedLift = false;
  for (let s=0;s<steps;s++){
    const lift = st > 0 && devices.find(d=>(d.type === 'lift' || (d.type === 'vine' && d.grown)) && x+w>d.x+0.1 && x<d.x+d.w-0.1 &&
      y+h<=d.y+0.01 && y+h+st>=d.y);
    if (lift){ y = lift.y-h; blocked = true; landedLift = true; break; }
    if (boxSolid(x, y+st, w, h)) {
      let shift=0;
      if(st<0)for(let d=1;d<=3&&!shift;d++)for(const side of [-1,1]){
        if(!boxSolid(x+side*d,y,w,h)&&!boxSolid(x+side*d,y+st,w,h)){shift=side*d;break;}
      }
      if(shift){x+=shift;P.px+=shift;}
      else {blocked = true;break;}
    }
    y += st;
  }
  if (blocked && !landedLift){
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
  const ok = !boxSolid(b.x, b.y, b.w, b.h) && !devices.some(d=>(d.type==='lift'||(d.type==='vine'&&d.grown)) && rectOverlap(b,d));
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
  checkpoint = null;
  loadDevices(L);
  grid.fill(0);
  for (let x=1;x<GW-1;x++){ setT(x,0,TILE.STONE); setT(x,GH-1,TILE.STONE); }
  for (let y=1;y<GH-1;y++){ setT(0,y,TILE.STONE); setT(GW-1,y,TILE.STONE); }
  for (const r of (L.rects||[])){
    const t = r.t==='crumble'?TILE.CRUMBLE : r.t==='lava'?TILE.LAVA : TILE.STONE;
    for (let y=r.y;y<r.y+r.h;y++) for (let x=r.x;x<r.x+r.w;x++) setT(x,y,t);
  }
  spawnPlayer(L.start[0], L.start[1]);
  P.bag = {meat:0,grass:0,stone:0,water:0,fire:0};
  P.sel = 'stone';
  items = []; enemies = []; particles = []; floaters = []; drips = []; hist = []; tut = 0; tutCuts = 0;
  for (const it of (L.items||[])) addItem(it.c[0]*CELL+4, it.c[1]*CELL+4, it.m);
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
  const bestSeeds = store.get('seeds', {});
  bestSeeds[level] = Math.max(bestSeeds[level] || 0, seeds.filter(s=>s.got).length);
  store.set('seeds', bestSeeds);
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
    el.title = MAT_HELP[k];
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
  $('edMatHint').textContent = MAT_HELP[P.sel];
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
  if (state !== 'play' || menuOpen || bookOpen) return;
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
  if (state !== 'play' || editing || menuOpen || bookOpen) return;
  editing = true; edEl.classList.remove('hide');
  clearInput();
  tone(500,700,0.06,'triangle',0.04);
}
function closeEditor(silent){
  if (!editing) { edEl.classList.add('hide'); return; }
  editing = false; edEl.classList.add('hide');
  if (!silent) tone(700,500,0.06,'triangle',0.04);
}
function quickBeads(action){
  if (!editing || state !== 'play' || bookOpen) return false;
  let changed=false;
  if (action==='slim'){
    const goal=bounds().h>CELL*2?CELL*2:CELL;
    for(let pass=0;pass<MH;pass++){
      const b=bounds();if(b.h<=goal)break;
      let cut=false;
      for(let i=b.i0;i<=b.i1;i++)if(P.mask[b.j0*MW+i]&&connectedWithout(i,b.j0)){removeAt(i,b.j0);cut=changed=true;}
      if(!cut)break;
    }
    toast(changed?'收好豆子了，现在更矮、更轻':'已经很矮了，也可以逐颗调整');
  }else if(action==='light'){
    for(let pass=0;pass<MW*MH;pass++){
      let cut=false;
      for(let k=0;k<MW*MH;k++)if(P.mask[k]===MAT.stone.id&&connectedWithout(k%MW,k>>3)){removeAt(k%MW,k>>3);cut=changed=true;}
      if(!cut)break;
    }
    toast(changed?'石豆已收回背包，跳得更高':'没有可直接取下的石豆，连接处请手动调整');
  }else if(action==='attach'){
    const b=bounds(),spots=[];
    for(let j=0;j<MH;j++)for(let i=0;i<MW;i++)if(canPlace(i,j))spots.push({i,j,score:Math.abs(j-b.j1)*4+Math.abs(i-(b.i0+b.i1)/2)});
    spots.sort((a,b)=>a.score-b.score);
    if(spots.length)changed=placeAt(spots[0].i,spots[0].j);
    else toast('周围被挡住了，先到宽敞一点的地方');
  }
  drawEditor();return changed;
}
$('edSlim').addEventListener('click',()=>quickBeads('slim'));
$('edLight').addEventListener('click',()=>quickBeads('light'));
$('edAttach').addEventListener('click',()=>quickBeads('attach'));
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
    window.GraftBeads.drawBead(edx,x,y,S,id,false);
    edx.fillStyle='#49354b';edx.font='9px sans-serif';edx.textAlign='center';
    edx.fillText(m.label,x+S/2,y+S-3);
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
  const height=bounds().h;
  $('edSlim').textContent=height>CELL*2?'瘦身钻洞':height>CELL?'再瘦一层':'已是单层';
  $('edSlim').disabled=height<=CELL;
  const w = weight();
  $('edW').textContent = '跳高约 ' + (jumpPower()*jumpPower()/(2*GRAV*CELL)).toFixed(1) + ' 格 · 重 ' + w.toFixed(1) + (level === 1 || level === 4 ? (w >= 12.5 ? ' · 够压塌地板' : ' · 压塌地板要 12.5') : '');
}

// ─── 暂停菜单:继续 / 重来本关 / 选关 / 声音 / 回标题(手机上没有键盘,这是唯一的重开入口)
const menuEl = $('pause');
let menuOpen = false;
function openMenu(){
  if (state !== 'play' || menuOpen || bookOpen) return;
  closeEditor(true);
  menuOpen = true; menuEl.classList.remove('hide');
  clearInput();
  $('pmLevel').textContent = LEVELS[level].name;
  $('pmSound').textContent = muted ? '声音:关' : '声音:开';
  $('pmHard').textContent = store.get('hard', false) ? '硬核:开(无青旗)' : '硬核:关';
  const grid = $('pmLevels'); grid.textContent = '';
  const un = Math.max(store.get('unlocked', 0), level);
  LEVELS.forEach((L, i)=>{
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'lvb' + (i === level ? ' cur' : '') + (i > un ? ' todo' : '');
    const stars = (store.get('seeds', {})[i] || 0);
    b.textContent = L.name.split(' · ')[0];
    if (stars){ const badge=document.createElement('small'); badge.textContent='✦'.repeat(stars); b.appendChild(badge); }
    b.title = L.name + ' · 最佳光种 ' + stars + '/3' + (i > un ? ' · 还没通关' : '');
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
$('pmHard').addEventListener('click', ()=>{ const v = !store.get('hard', false); store.set('hard', v); $('pmHard').textContent = v ? '硬核:开(无青旗)' : '硬核:关'; tone(v?620:320, v?380:620, .07, 'triangle', .04); });
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
  if (cx < 17 && tutCuts === 0) return {text: touchMode ? '按住左下的右箭头移动' : '按 D 往右走', arrow:true};
  if (cx < 31){
    if (b.h > 16) return {text: touchMode ? '点豆板 → 瘦身钻洞' : tutCuts ? '继续削,矮到两格就钻得过去' : '点一下自己的身体,削掉一格', target: pickCut()};
    return {text:'钻过去!', arrow:true};
  }
  if (cx > 38 && cx < 47.5 && b.h > 8) return {text:touchMode?'点豆板 → 再瘦一层':'这道缝只有一格高 —— 削成一片', target: pickCut()};
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
      if (b0.n > 1 && !connectedWithout(i,j)) continue;
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
      P.onGround = true; P.coyote = 0.14;
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
    P.vy = -jumpPower() - GRAV*dt*0.5;
    P.touchFlight = bufferedTouchJump; bufferedTouchJump=false;
    P.onGround = false; P.coyote = 0; jumpBuf = 0;
    burst(b0.x+b0.w/2, b0.y+b0.h, '#9a92ad', 3, 50, 1);
    dust(b0.x+b0.w/2, b0.y+b0.h, -1, 2); dust(b0.x+b0.w/2, b0.y+b0.h, 1, 2);
    squash(0.78, 1.22);
    tone(250, 480, 0.09, 'square', 0.045);
  }
  if (P.vy>=0) {P.springFlight=false;P.touchFlight=false;}
  if (P.vy < 0 && !jumpHeld() && !P.springFlight && !P.touchFlight) P.vy += GRAV*dt*0.55;

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

  // 岩浆
  if (inLava){
    P.lavaT += dt;
    const hasWater = countMat('water') > 0;
    const gap = hasWater ? 0.9 : 0.28;
    if (Math.random() < 0.3) burst(b0.x + Math.random()*b0.w, b0.y+b0.h-2, hasWater ? '#dff4ff' : '#ff9b4a', 1, 30, 1);
    if (P.lavaT > gap){
      P.lavaT = 0;
      if (hasWater){
        // 烧掉一格水
        let picked = -1;
        for (let k2=0;k2<MW*MH;k2++) if (P.mask[k2]===MAT.water.id && connectedWithout(k2%MW,(k2/MW)|0)) { picked = k2; break; }
        if (picked >= 0){
          const w = cellWorld(picked%MW,(picked/MW)|0);
          burst(w.x+4,w.y+4,'#cfeaff',10,90,2);
          for (let s=0;s<4;s++) particles.push({x:w.x+4,y:w.y+4,vx:(Math.random()-0.5)*20,vy:-30-Math.random()*30,life:0.8,max:0.8,c:'rgba(230,240,255,0.5)',s:2,g:-30,soft:true});
          P.mask[picked] = 0;
          tone(900, 400, 0.12, 'sine', 0.04);
          noise(0.2, 0.04, 2000, 8000);
          if (countMat('water') <= 1) toast('水快烧完了');
        } else {
          // 不可削出的水(连接身体的核心或最后一格)不能提供无限岩浆保护。
          damagePlayerNear(b0.x+b0.w/2,b0.y+b0.h);
          toast('把水贴在身体边缘,才能消耗它挡住岩浆');
        }
      } else {
        damagePlayerNear(b0.x+b0.w/2, b0.y+b0.h);
      }
    }
  } else P.lavaT = 0;

  // 火烧自己
  if (countMat('fire') > 0){
    P.burnT += dt;
    if (Math.random() < 0.25){
      for (let k2=0;k2<MW*MH;k2++) if (P.mask[k2]===MAT.fire.id && Math.random()<0.3){
        const w = cellWorld(k2%MW,(k2/MW)|0); ember(w.x+Math.random()*8, w.y, '#ffb02e'); break;
      }
    }
    if (P.burnT > 2.4){
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

  // 水蒸发
  if (countMat('water') > 0){
    P.evapT += dt;
    if (P.evapT > 7){
      P.evapT = 0;
      let picked = -1;
      for (let k2=MW*MH-1;k2>=0;k2--) if (P.mask[k2]===MAT.water.id && connectedWithout(k2%MW,(k2/MW)|0)) { picked = k2; break; }
      if (picked >= 0){
        const w = cellWorld(picked%MW,(picked/MW)|0);
        burst(w.x+4,w.y+4,'#9fe4ff',5,60,1);
        P.mask[picked] = 0;
        P.bag.water++;
        syncBag();
      }
    }
  } else P.evapT = 0;

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
  if (editing || menuOpen || bookOpen) return;
  if (state === 'dead'){
    timer += dt;
    updateParticles(dt);
    if (timer > 1.1) respawnCheckpoint();
    return;
  }
  if (state === 'clear'){
    timer += dt; updateParticles(dt);
    if (timer > 0.85) loadLevel(level+1);
    return;
  }
  if (state !== 'play') return;
  levelT += dt;

  updateDevices(dt);
  updatePlayer(dt);
  if (level === 0 && !tutDone && bounds().x/CELL > 52){ tutDone = true; store.set('tutDone', true); }
  updateEnemies(dt);
  updateItems(dt);
  interactDevices(dt);
  if (state !== 'play') return;
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
  fx.fillStyle = 'rgba(5,4,9,0.24)'; fx.fillRect(0,0,VW,VH);
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
  buildSanctuary(mx,level);
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
function buildSanctuary(painter,chapter){
  painter.save();
  const cx=240+(chapter%3)*60, y=155-(chapter%4)*17;
  painter.strokeStyle='rgba('+TH.glow+',0.20)';painter.lineWidth=3;
  painter.beginPath();painter.arc(cx,y,58,Math.PI,Math.PI*2);painter.stroke();
  painter.fillStyle='rgba('+TH.glow+',0.08)';painter.fillRect(cx-56,y,112,140);
  for(const side of [-1,1]){
    const x=cx+side*58-5;
    painter.fillStyle='rgba('+TH.glow+',0.13)';painter.fillRect(x,y-4,10,130);painter.fillRect(x-4,y-8,18,5);
    for(let j=0;j<5;j++){painter.fillStyle='rgba(190,184,203,0.09)';painter.fillRect(x+2,y+10+j*21,3,7);}
  }
  painter.strokeStyle='rgba(220,190,137,0.18)';painter.lineWidth=1;
  painter.beginPath();painter.arc(cx,y-1,35,0,Math.PI*2);painter.stroke();
  for(let n=0;n<8;n++){
    const a=n*Math.PI/4,x=cx+Math.cos(a)*35,yy=y+Math.sin(a)*35;
    painter.fillStyle='rgba(229,201,154,0.25)';painter.fillRect(Math.round(x)-1,Math.round(yy)-2,2,4);
  }
  // Five material marks on the ruined observatory wheel.
  const cs=['#d1909b','#8cae78','#b7b6b9','#7fb7c9','#d5a369'];
  cs.forEach((c,i)=>{painter.globalAlpha=0.24;painter.fillStyle=c;painter.fillRect(cx-20+i*9,y-2,5,5);});
  painter.restore();
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
    }
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
  ctx.fillStyle='#363347';ctx.fillRect(x-3,y+h-2,w+6,4);
  ctx.fillStyle='#7b6885';ctx.fillRect(x-1,y+h-2,w+2,1);
  ctx.strokeStyle=exitLocked?'#514457':'rgba(229,196,143,0.45)';ctx.lineWidth=1;
  ctx.beginPath();ctx.arc(x+w/2,y+h/2,w*0.7,0,Math.PI*2);ctx.stroke();
  // 拱门
  ctx.fillStyle = exitLocked ? '#3c3550' : '#8e74c8';
  ctx.fillRect(x+2, y+2, w-4, 2);
  ctx.fillRect(x+2, y+2, 2, h-2);
  ctx.fillRect(x+w-4, y+2, 2, h-2);
  for(const side of [0,w-3]){ctx.fillStyle='#c4a57f';ctx.fillRect(x+side,y+5,3,3);ctx.fillRect(x+side,y+h-7,3,3);}
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
function cellTexture(id,x,y,i,j,topOpen){
  const h=hash(i+11,j+7), t=time;
  if(id===2){
    ctx.fillStyle='#4f8e4b';ctx.fillRect(x+3,y+2,1,4);
    ctx.fillStyle='#c7ef8f';ctx.fillRect(x+1,y+2,3,2);ctx.fillRect(x+4,y+4,2,2);
    ctx.fillStyle='#7ac97b';ctx.fillRect(x+2,y+5,1,1);
    if(topOpen){const w=Math.round(Math.sin(t*2.5+i));ctx.fillStyle='#c4ef9b';ctx.fillRect(x+3,y-2,1,3);ctx.fillRect(x+1+w,y-3,3,1);ctx.fillRect(x+4+w,y-4,2,2);}
  } else if(id===3){
    ctx.fillStyle='#4f596e';ctx.fillRect(x+2,y+2,1,3);ctx.fillRect(x+3,y+4,3,1);
    ctx.fillStyle='#c9d8e4';ctx.fillRect(x+1,y+1,4,1);ctx.fillRect(x+5,y+2,1,1);
    ctx.fillStyle='#7bdbcf';if(h>0.35)ctx.fillRect(x+3,y+3,1,1);
  } else if(id===4){
    const wave=Math.round(Math.sin(t*3+i)*1);
    ctx.fillStyle='#c4f9ff';ctx.fillRect(x+1,y+2+wave,3,1);ctx.fillRect(x+4,y+3+wave,2,1);
    ctx.fillStyle='#287eaf';ctx.fillRect(x+2,y+5,3,1);
    ctx.fillStyle='#e4ffff';ctx.fillRect(x+5,y+1+((j+i)%3),1,1);
  } else if(id===5){
    const f=Math.sin(t*13+i*2+j);
    ctx.fillStyle='#c65a28';ctx.fillRect(x+1,y+4,6,3);
    ctx.fillStyle='#ffdb75';ctx.fillRect(x+2,y+2,4,3);
    ctx.fillStyle='#fff0bc';ctx.fillRect(x+3,y+(f>0?0:1),2,4);
    if(topOpen){ctx.fillStyle='#ffb65e';ctx.fillRect(x+2,y-2-(f>0?1:0),1,3);ctx.fillRect(x+5,y-1,1,2);}
  } else {
    ctx.fillStyle='#ffc5ce';ctx.fillRect(x+1,y+1,4,1);ctx.fillRect(x+2,y+2,1,1);
    ctx.fillStyle='#c36a87';if((i+j)%3===0){ctx.fillRect(x+4,y+5,2,1);ctx.fillRect(x+5,y+4,1,1);}
    ctx.fillStyle='rgba(255,236,217,0.45)';ctx.fillRect(x+1,y+4,1,1);
  }
}

// The goggles and lantern are attached to existing body cells; they never alter collision.
function drawExplorerFace(b,cellOf){
  let best=[],run=[];
  for(let i=b.i0;i<=b.i1+1;i++){
    if(i<=b.i1&&cellOf(i,b.j0))run.push(i);
    else{if(run.length>best.length)best=run;run=[];}
  }
  if(!best.length)return;
  const left=P.px+best[0]*CELL,width=best.length*CELL;
  const cx=Math.round(left+width/2), y=Math.round(P.py+b.j0*CELL+3);
  const wide=width>=16, eyeGap=wide?4:2, eyeW=wide?4:2;
  const move=Math.sign(P.vx)||P.face;
  ctx.fillStyle='#493b42';ctx.fillRect(left,y,Math.min(width,eyeGap*2+eyeW+4),2);
  for(const sign of [-1,1]){
    const x=cx+sign*eyeGap-eyeW/2;
    ctx.fillStyle='#634749';ctx.fillRect(x-1,y-1,eyeW+2,5);
    ctx.fillStyle='#e4be83';ctx.fillRect(x-1,y-1,eyeW+2,1);ctx.fillRect(x-1,y+3,eyeW+2,1);
    ctx.fillRect(x-1,y,1,3);ctx.fillRect(x+eyeW,y,1,3);
    ctx.fillStyle=P.hurtFace>0?'#cf8f9e':'#b8e8e7';ctx.fillRect(x,y,eyeW,3);
    ctx.fillStyle='#273c50';
    if(P.blink>0)ctx.fillRect(x,y+1,eyeW,1);
    else if(P.hurtFace>0){ctx.fillRect(x+(sign<0?0:1),y,1,1);ctx.fillRect(x+(sign<0?1:0),y+1,1,1);}
    else ctx.fillRect(x+(move>0?eyeW-1:0),y+1,1,2);
    ctx.fillStyle='#f4ffed';ctx.fillRect(x,y,1,1);
  }
  ctx.fillStyle='#e8c994';ctx.fillRect(cx-1,y+1,2,1);
  // A little scarf knot, shown only where the body continues below the face.
  const mid=best[Math.floor(best.length/2)];
  if(cellOf(mid,b.j0+1)){
    const sy=Math.round(P.py+(b.j0+1)*CELL+1);
    ctx.fillStyle='#633e57';ctx.fillRect(cx-4,sy-1,8,3);
    ctx.fillStyle='#f1cc9b';ctx.fillRect(cx-3,sy,6,1);ctx.fillRect(cx+2,sy+1,2,3);
  }
  if(b.n>=7){
    let chosen=-1,distance=1e9;
    for(let j=b.j0+1;j<=b.j1;j++)for(let i=b.i0;i<=b.i1;i++)if(cellOf(i,j)){
      const d=Math.abs(i-(b.i0+b.i1)/2)+Math.abs(j-b.j1)*0.5;
      if(d<distance){distance=d;chosen=j*MW+i;}
    }
    if(chosen>=0){
      const x=Math.round(P.px+(chosen%MW)*CELL+2),yy=Math.round(P.py+Math.floor(chosen/MW)*CELL+2);
      ctx.fillStyle='#463c49';ctx.fillRect(x-1,yy-1,6,6);
      ctx.fillStyle='#b99268';ctx.fillRect(x,yy,4,4);
      ctx.fillStyle='#f8d994';ctx.fillRect(x+1,yy,2,3);
      ctx.fillStyle='#fff4c6';ctx.fillRect(x+1,yy,1,1);
    }
  }
  if(b.n<=2){ctx.fillStyle='#b1f4f6';ctx.fillRect(Math.round(left+width),y-2,1,2);}
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
      ctx.fillStyle='rgba(25,18,38,0.22)'; ctx.fillRect(x+s-1,y+1,1,s-2);
      ctx.fillStyle='rgba(255,245,220,0.16)'; ctx.fillRect(x+1,y+1,1,s-3);
      const topOpen = !cellOf(i,j-1);
      if (topOpen){ ctx.fillStyle = 'rgba(255,255,255,0.24)'; ctx.fillRect(x+1,y,s-2,1); }
      cellTexture(id, x, y, i, j, topOpen);
      ctx.fillStyle=m.edge;ctx.fillRect(x+3,y+3,2,2);
      ctx.fillStyle='rgba(255,245,220,.65)';ctx.fillRect(x+2,y+2,2,1);
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

  if(!born)drawExplorerFace(b,cellOf);
  if(!born && beadBook.charm){
    ctx.strokeStyle='#e4c49a';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(b.x+b.w-1,b.y+b.h-7);ctx.lineTo(b.x+b.w+5,b.y+b.h-4);ctx.stroke();
    ctx.drawImage(beadBook.charm,b.x+b.w+1,b.y+b.h-5,10,10);
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
      // 石头怪:肩甲铆钉、岩芯与发光裂纹
      ctx.fillStyle='#34394c';ctx.fillRect(Math.round(e.x-2),eyY+1,3,6);ctx.fillRect(Math.round(e.x+e.w-1),eyY+1,3,6);
      ctx.fillStyle='#c3b78f';ctx.fillRect(Math.round(e.x),eyY+2,1,1);ctx.fillRect(Math.round(e.x+e.w),eyY+2,1,1);
      if(e.h>=24){ctx.fillStyle='#453947';ctx.fillRect(ecx-3,eyY+7,6,5);ctx.fillStyle=e.wind>0?'#fff1b3':'#f1a46c';ctx.fillRect(ecx-1,eyY+8,2,3);}
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
      // 不规则耳角和背部斑纹,与玩家护目镜清楚区分
      ctx.fillStyle=m.edge;ctx.fillRect(Math.round(e.x+1),eyY-5,3,3);ctx.fillRect(Math.round(e.x+e.w-4),eyY-5,3,3);
      ctx.fillStyle='#bc5478';ctx.fillRect(Math.round(e.x+2),eyY+7,3,2);ctx.fillRect(Math.round(e.x+e.w-5),eyY+9,2,2);
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
  for (const s of seeds) if (!s.got && vis(s.x,s.y)) L.push({x:s.x,y:s.y,r:22,i:0.6,c:'rgba(255,218,120,0.28)'});
  for (const d of devices){
    if (!vis(d.x+d.w/2,d.y-8)) continue;
    const hot=d.type==='jet' && (d.active||d.warning) || d.type==='emberwall'&&!d.open || d.type==='bramble'&&d.progress>0&&!d.open;
    const friendly=['spring','lift','checkpoint','bud','valve','relay'].includes(d.type);
    if (hot||friendly) L.push({x:d.x+d.w/2,y:d.y-(hot?d.h/2:8),r:hot?45:24,i:0.65,
      c:hot?'rgba(255,135,45,0.25)':d.type==='spring'?'rgba(255,133,207,0.18)':'rgba(125,240,230,0.18)'});
  }
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
  $('seedCount').textContent = seeds.length ? '✦ ' + seeds.filter(s=>s.got).length + '/' + seeds.length : '';
  const mark = LEVELS[level].rects.some(r => r.t === 'crumble');
  if (mark !== lastMark){ lastMark = mark; wMark.style.display = mark ? 'block' : 'none'; }
}
let portraitReady=false;
function drawTitlePortrait(){
  if(portraitReady)return;
  const c=$('portraitCv');c.width=240;c.height=116;
  const p=c.getContext('2d');p.imageSmoothingEnabled=false;
  p.save();p.translate(120,59);
  p.strokeStyle='#62546f';p.lineWidth=1;p.beginPath();p.arc(0,0,45,0,Math.PI*2);p.stroke();
  p.strokeStyle='#423a50';p.beginPath();p.arc(0,0,51,-Math.PI*0.85,Math.PI*0.85);p.stroke();
  const mats=['grass','stone','meat','water','fire'];
  mats.forEach((m,i)=>{const a=-Math.PI/2+i*Math.PI*2/5;drawMaterialBadge(m,Math.cos(a)*52,Math.sin(a)*52,p);});
  p.scale(2.2,2.2);p.translate(-12,-12);
  const body=[['grass','meat','stone'],['meat','meat','meat'],['water','meat','fire']];
  for(let j=0;j<3;j++)for(let i=0;i<3;i++){
    const m=MAT[body[j][i]],x=i*8,y=j*8;
    p.fillStyle=m.edge;p.fillRect(x,y,8,8);p.fillStyle=m.c;p.fillRect(x+1,y+1,6,5);p.fillStyle=m.c2;p.fillRect(x+1,y+6,6,1);
    p.fillStyle='rgba(255,246,216,.42)';p.fillRect(x+1,y+1,4,1);
  }
  p.fillStyle='#c8ef99';p.fillRect(3,-3,1,4);p.fillRect(1,-4,3,2);p.fillRect(4,-5,2,2);
  p.fillStyle='#fff1af';p.fillRect(19,16,2,4);p.fillRect(18,18,4,3);
  p.fillStyle='#72554b';p.fillRect(3,4,18,4);
  for(const x of [5,14]){
    p.fillStyle='#eed29b';p.fillRect(x-1,2,7,7);p.fillStyle='#547380';p.fillRect(x,3,5,5);
    p.fillStyle='#c5eeee';p.fillRect(x,3,4,4);p.fillStyle='#2b3149';p.fillRect(x+2,4,2,3);p.fillStyle='#fff9d9';p.fillRect(x,3,2,1);
  }
  p.fillStyle='#f0ce9d';p.fillRect(11,5,3,1);p.fillStyle='#643e50';p.fillRect(8,11,10,2);p.fillStyle='#e4c399';p.fillRect(9,11,8,1);p.fillRect(15,12,2,3);
  p.fillStyle='#514453';p.fillRect(10,17,6,6);p.fillStyle='#e9bb77';p.fillRect(11,18,4,4);p.fillStyle='#fff1bb';p.fillRect(12,18,2,3);
  p.restore();portraitReady=true;
}

// ═════════════════════════════════════════════ 渲染
function render(){
  if(state==='title')drawTitlePortrait();
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
  drawChapterWayfinding();
  drawDevices();
  drawExit();
  drawItems();
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
  if (document.hidden){ clearInput(); if (AC) AC.suspend().catch(()=>{}); if (state === 'play' && !editing && !bookOpen) openMenu(); }
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
const beadBook=window.GraftBeads.create(store,{
  open(){closeEditor(true);closeMenu(true);bookOpen=true;clearInput();document.body.classList.add('crafting');},
  close(){bookOpen=false;clearInput();document.body.classList.remove('crafting');},
  sound(){tone(610,820,.035,'triangle',.025);},
  finish(){arp([523,659,784,1046],90);vibrate(25);},
});
$('btnBook').addEventListener('click',()=>beadBook.open());
$('pmBook').addEventListener('click',()=>beadBook.open());
$('btnStart').addEventListener('click', ()=> startGame(false));
$('btnCont').addEventListener('click', ()=> startGame(true));

// ─── 选关:标题页也能直接进任意一关(不再按解锁进度锁死)
const lpEl = $('levelPick');
function fillLevelPick(cur, onPick){
  const grid = $('lpGrid'); grid.textContent = '';
  const un = Math.max(store.get('unlocked', 0), store.get('best', 0));
  LEVELS.forEach((L, i)=>{
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'lvb' + (i === cur ? ' cur' : '') + (i > un ? ' todo' : '');
    b.textContent = L.name.split(' · ')[0];
    const stars = (store.get('seeds', {})[i] || 0);
    if (stars){ const s = document.createElement('small'); s.textContent = '✦'.repeat(stars); b.appendChild(s); }
    b.title = L.name + ' · ' + (L.sub || '') + (i > un ? ' · 还没通关' : '');
    b.addEventListener('click', ()=> onPick(i));
    grid.appendChild(b);
  });
}
function openLevelPick(){
  fillLevelPick(-1, (i)=>{
    lpEl.classList.add('hide');
    ov.classList.add('hide');
    document.body.classList.remove('menu');
    ac();
    stats.start = performance.now(); stats.deaths = 0;
    loadLevel(i);
  });
  lpEl.classList.remove('hide');
}
$('btnPick').addEventListener('click', openLevelPick);
$('lpClose').addEventListener('click', ()=> lpEl.classList.add('hide'));
refreshContinue();
setMuted(muted);
if (IS_TOUCH) setTouchMode(true);

let bootLevel = -1;
/* @debug-start */
const qs = new URLSearchParams(location.search);
if (qs.has('lv')) bootLevel = parseInt(qs.get('lv'),10)||0;
const hm = /^#lv(\d+)$/.exec(location.hash || '');     // 试玩跳关:链接后加 #lv3 = 第 4 关
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
  P, LEVELS, loadLevel, devices:()=>devices, seeds:()=>seeds, die, get checkpoint(){return checkpoint;}, get level(){ return level; },
  enemies: ()=> enemies, items: ()=> items, bounds, weight,
  placeAt, removeAt, canPlace, connectedWithout, undo, damage: (x,y)=> damagePlayerNear(x,y,1), get tutDone(){ return tutDone; }, tutStep: ()=> tutStep(),
  tile: (x,y)=> gt(x,y), locked: ()=> exitLocked,
  setMouse: (x,y)=>{ mouse.x = x; mouse.y = y; mouse.inside = true; },
  get cam(){ return cam; },
  key: (code, down)=>{ keys[code] = !!down; if (down && code === 'Space') pressJump(); if (!down && code === 'Space') releaseJump(); },
  step: (dt)=> update(dt),
  beadBook, quickBeads, jumpPower, tryMoveY, render, drawEditor, openEditor, closeEditor, get editing(){ return editing; }, nearestEditable,
  get quality(){ return quality; },
};
/* @debug-end */
})();
