// 自动通关:每关一个脚本化的"玩家",证明关卡确实能过(第 4 关是纯战斗,见 combat.js)
'use strict';
const { boot } = require('./harness');
const DT = 1/60;

function mk(){
  const { G } = boot();
  const a = {
    G,
    step(n){ for (let i=0;i<(n||1);i++){ G.step(DT); if (G.state !== 'play') return; } },
    hold(code, on){ G.key(code, on); },
    b(){ return G.bounds(); },
    cx(){ const b = G.bounds(); return (b.x + b.w/2)/8; },
    left(){ return G.bounds().x/8; },
    bottom(){ const b = G.bounds(); return (b.y+b.h)/8; },
    until(cond, max){ for (let i=0;i<(max||600);i++){ if (cond()) return true; if (G.state !== 'play') return false; G.step(DT); } return cond(); },
    walkTo(x, max){
      const dir = a.cx() < x ? 'KeyD' : 'KeyA';
      a.hold(dir, true);
      const ok = a.until(()=> dir==='KeyD' ? a.cx() >= x : a.cx() <= x, max||900);
      a.hold(dir, false); a.step(2); return ok;
    },
    put(list, mat){ let n=0; for (const [i,j] of list){ if (mat) G.P.sel = mat; if (G.placeAt(i,j)) n++; } return n; },
    cut(list){ let n=0; for (const [i,j] of list) if (G.removeAt(i,j)) n++; return n; },
    cleared(){ return G.state === 'clear' || G.state === 'win' || G.level > a._lv; },
    start(lv){ a._lv = lv; G.loadLevel(lv); a.step(30); },
  };
  return a;
}

const scripts = {
  0(a){ // 壹:削成 3×1 钻缝
    a.cut([[2,2],[3,2],[4,2],[2,3],[3,3],[4,3]]);
    a.hold('KeyD', true); a.until(a.cleared, 1500); a.hold('KeyD', false);
  },
  1(a){ // 贰:贴两块石头,站上脆地板
    a.walkTo(37);
    a.put([[5,4],[5,3]], 'stone');
    a.walkTo(47);
    a.until(a.cleared, 300);
  },
  2(a){ // 叁:贴 6 格水穿过岩浆
    a.walkTo(23);
    a.put([[2,1],[3,1],[4,1],[5,2],[5,3],[5,4]], 'water');
    a.hold('KeyD', true);
    for (let k=0;k<40 && !a.cleared();k++){ if (a.G.P.onGround) { a.hold('Space', true); a.step(20); a.hold('Space', false); } a.step(10); }
    a.hold('KeyD', false);
  },
  4(a){ // 伍:削扁钻洞 → 吃石头 → 长胖 → 压塌地板
    a.walkTo(17);
    a.cut([[2,2],[3,2],[4,2],[2,3],[3,3],[4,3]]);
    a.walkTo(40);
    if (a.bottom() > 40.1) throw new Error('没钻过矮洞');
    a.hold('KeyD', true); a.hold('Space', true); a.step(24); a.hold('Space', false);
    a.until(()=> a.G.P.onGround, 120); a.hold('KeyD', false);
    a.walkTo(49.5);
    a.step(60);
    if (a.G.P.bag.stone < 2) throw new Error('没拿到石头 bag='+JSON.stringify(a.G.P.bag));
    a.put([[2,3],[3,3],[4,3],[2,2],[3,2],[4,2]], 'meat');
    a.put([[5,4],[5,3]], 'stone');
    if (a.G.weight() < 12.5) throw new Error('不够重 '+a.G.weight());
    a.walkTo(52);
    a.walkTo(59.5);
    a.until(a.cleared, 300);
  },
  5(a){ // 陆:压成两格高,带 8 格水钻过低矮石板下的岩浆
    a.walkTo(19.5);
    a.step(40);
    a.cut([[2,2],[3,2],[4,2]]);
    a.put([[5,3],[5,4],[6,3],[6,4],[7,3],[7,4],[1,3],[1,4]], 'water');
    const water0 = a.G.P.mask.filter(v=>v===4).length;
    if (water0 < 8) throw new Error('水不够 '+water0);
    a.hold('KeyD', true);
    a.until(()=> a.left() >= 48.2, 900);
    a.hold('Space', true); a.step(22); a.hold('Space', false);
    a.until(()=> a.G.P.onGround && a.bottom() <= 40.01, 200);
    const left = a.G.P.mask.filter(v=>v===4).length;
    console.log('      岩浆里烧掉 '+(water0-left)+' 格水,剩 '+left+' 格');
    for (let k=0;k<60 && !a.cleared();k++){ if (a.G.P.onGround && Math.random()<0.5) { a.hold('Space', true); a.step(18); a.hold('Space', false); } a.step(8); }
    a.hold('KeyD', false);
  },
  6(a){ // 柒:敌人清光后出口解锁,台阶能一级级跳上去
    const G = a.G;
    G.enemies().forEach(e => e.hp = 0);
    a.step(2);
    if (G.locked()) throw new Error('敌人清光后出口没开');
    a.walkTo(5);
    const steps = [[6,35],[17,31],[28,27],[39,23],[50,19],[61,15],[71,11]];
    for (let s=0;s<steps.length;s++){
      const [px, row] = steps[s];
      a.walkTo(px - 3.2);
      a.hold('KeyD', true); a.hold('Space', true); a.step(20); a.hold('Space', false);
      a.until(()=> G.P.onGround, 120); a.hold('KeyD', false); a.step(4);
      if (a.cleared()) break;
      a.walkTo(px + 3.5);
      if (a.cleared()) break;
      if (Math.abs(a.bottom() - row) > 0.05) throw new Error('第'+(s+1)+'级没上去: bottom='+a.bottom().toFixed(2)+' 期望 '+row);
    }
    a.walkTo(75.5); a.until(a.cleared, 120);
  },
};

let fails = 0;
for (const lv of Object.keys(scripts).map(Number)){
  const a = mk();
  a.start(lv);
  let err = null;
  try { scripts[lv](a); } catch(e){ err = e.message; }
  const ok = !err && a.cleared();
  console.log((ok ? 'PASS ' : 'FAIL ') + 'L'+(lv+1)+' '+a.G.LEVELS[lv].name + (ok ? '' : '  → '+(err || ('state='+a.G.state+' x='+a.cx().toFixed(1)+' bottom='+a.bottom().toFixed(1)))));
  if (!ok) fails++;
}
process.exit(fails ? 1 : 0);
