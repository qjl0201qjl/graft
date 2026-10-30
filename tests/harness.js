// 零依赖的无头运行环境:最小 DOM/Canvas 桩,把 src/game.js 跑起来做自动化测试
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');

function makeCtx(){
  const grad = { addColorStop(){} };
  return new Proxy({}, { get(t, k){
    if (k in t) return t[k];
    if (k === 'createLinearGradient' || k === 'createRadialGradient') return ()=> grad;
    if (k === 'measureText') return ()=> ({width:10});
    if (k === 'getImageData') return ()=> ({data:new Uint8ClampedArray(4)});
    return ()=>{};
  }, set(t, k, v){ t[k] = v; return true; } });
}
function makeEl(tag){
  const cls = new Set();
  const listeners = new Map();
  return {
    tagName: (tag||'div').toUpperCase(), width:300, height:150, children:[], textContent:'', innerHTML:'',
    style: { setProperty(){} },
    classList: { add:(...c)=>c.forEach(x=>cls.add(x)), remove:(...c)=>c.forEach(x=>cls.delete(x)),
                 toggle:(c,f)=>{ const on = f===undefined ? !cls.has(c) : !!f; on?cls.add(c):cls.delete(c); return on; },
                 contains:c=>cls.has(c) },
    _ctx:null,
    setAttribute(k,v){this[k]=v;}, focus(){}, getClientRects(){return [{}];},
    getContext(){ return this._ctx || (this._ctx = makeCtx()); },
    addEventListener(type, fn){ if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(fn); },
    removeEventListener(type, fn){ listeners.get(type)?.delete(fn); },
    dispatchEvent(event){ for (const fn of listeners.get(event.type) || []) fn(event); },
    querySelector(){ return makeEl(); }, querySelectorAll(){ return [makeEl(), makeEl()]; },
    append(...c){ this.children.push(...c); }, appendChild(c){ this.children.push(c); return c; },
    getBoundingClientRect(){ return {left:0, top:0, width:640, height:360}; },
    setPointerCapture(){}, releasePointerCapture(){},
  };
}
function boot(opts){
  opts = opts || {};
  const els = {}, ls = new Map(), listeners = new Map();
  const document = {
    hidden:false,
    getElementById(id){ return els[id] || (els[id] = makeEl()); },
    createElement: makeEl, addEventListener(){},
    body: makeEl('body'), documentElement: makeEl('html'),
  };
  const win = {
    document, navigator:{ maxTouchPoints: opts.touch ? 5 : 0, vibrate(){} },
    innerHeight: opts.height || 800, innerWidth: opts.width || 1280,
    location:{ search: opts.search || '', reload(){} },
    localStorage:{ getItem:k=> ls.has(k)?ls.get(k):null, setItem:(k,v)=>ls.set(k,String(v)), removeItem:k=>ls.delete(k) },
    matchMedia:()=>({matches: !!opts.touch}),
    addEventListener(type, fn){ if(!listeners.has(type))listeners.set(type,new Set());listeners.get(type).add(fn); },
    removeEventListener(type, fn){listeners.get(type)?.delete(fn);},
    dispatchEvent(event){for(const fn of listeners.get(event.type)||[])fn(event);},
    requestAnimationFrame(){}, performance:{ now:()=> Date.now() },
    setTimeout, clearTimeout, setInterval, clearInterval, URLSearchParams, Math, JSON, console,
  };
  win.window = win; win.self = win;
  if (opts.touch) win.ontouchstart = null;
  const file = opts.file || path.join(__dirname, '..', 'src', 'game.js');
  vm.createContext(win);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'src', 'beads.js'), 'utf8'), win);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'src', 'harbor.js'), 'utf8'), win);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'src', 'elements.js'), 'utf8'), win);
  vm.runInContext(fs.readFileSync(file, 'utf8'), win, { filename:'game.js' });
  return { G: win.__game, els, win };
}
module.exports = { boot };
