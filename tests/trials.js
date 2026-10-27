// 试炼关可通性验证:每关一套脚本化解法
'use strict';
const { boot } = require('./harness');
const DT = 1/60;

function mk(){
  const { G } = boot();
  const a = {
    G,
    step(n){ for (let i=0;i<(n||1);i++){ G.step(DT); if (G.state !== 'play') return; } },
    hold(c,on){ G.key(c,on); },
    b(){ return G.bounds(); },
    cx(){ const b=G.bounds(); return (b.x+b.w/2)/8; },
    left(){ return G.bounds().x/8; },
    bottom(){ const b=G.bounds(); return (b.y+b.h)/8; },
    until(cond,max){ for(let i=0;i<(max||900);i++){ if(cond()) return true; if(G.state!=='play') return false; G.step(DT);} return cond(); },
    walkTo(x,max){
      const dir = a.cx() < x ? 'KeyD' : 'KeyA';
      a.hold(dir,true);
      const ok = a.until(()=> dir==='KeyD' ? a.cx() >= x : a.cx() <= x, max||900);
      a.hold(dir,false); a.step(2); return ok;
    },
    // 跳过一段坑:先走到起跳点,再按住跳+右
    hop(x){
      a.walkTo(x);
      a.hold('KeyD', true); a.hold('Space', true); a.step(16); a.hold('Space', false);
      a.until(()=> a.G.P.onGround, 200);
      a.hold('KeyD', false); a.step(3);
    },
    put(list, mat){ let n=0; for (const [i,j] of list){ if (mat) G.P.sel = mat; if (G.placeAt(i,j)) n++; } return n; },
    cut(list){ let n=0; for (const [i,j] of list) if (G.removeAt(i,j)) n++; return n; },
    cleared(){ return G.state === 'clear' || G.state === 'win' || G.level > a._lv; },
    start(lv){ a._lv = lv; G.loadLevel(lv); a.step(30); },
  };
  return a;
}

const cases = [
  [12, '试炼 1 · 四印', (a)=>{
    a.start(12);
    a.walkTo(10);                                  // 捡石头
    if (a.G.P.bag.stone < 2) throw new Error('石头不够 '+JSON.stringify(a.G.P.bag));
    a.put([[5,2],[5,3]], 'stone');                 // 贴两块 → 重 15
    if (a.G.weight() < 12.5) throw new Error('重量不够 '+a.G.weight());
    a.walkTo(14);                                  // 站上压板
    a.step(10);
    a.hop(19);                                     // 跳过熔岩沟
    a.walkTo(30);
    a.walkTo(32);                                  // 捡水
    a.put([[1,3]], 'water');
    a.walkTo(37); a.step(30);                      // 冷却红门
    a.walkTo(43);                                  // 捡火
    a.put([[1,3]], 'fire');
    a.walkTo(47); a.step(40);                      // 烧荆棘
    a.walkTo(70); a.until(a.cleared, 300);
  }],
  [13, '试炼 2 · 逆流', (a)=>{
    a.start(13);
    a.walkTo(8);                                   // 捡火
    if (a.G.P.bag.fire < 1) throw new Error('火不够');
    a.put([[5,3]], 'fire');
    a.walkTo(16); a.step(40);                      // 烧开荆棘(18)
    a.walkTo(25);                                  // 捡水
    a.put([[1,3]], 'water');
    a.hop(28);                                     // 跳过熔岩(30..34)
    a.walkTo(35); a.step(30);                      // 冷却红门(36)
    a.walkTo(41);                                  // 捡石头
    a.put([[5,2],[5,3]], 'stone');
    a.walkTo(52); a.step(14);                      // 踩压板
    a.walkTo(71); a.until(a.cleared, 300);
  }],
  [14, '试炼 3 · 双闸', (a)=>{
    a.start(14);
    a.walkTo(10);
    a.put([[5,2],[5,3]], 'stone');
    a.walkTo(12); a.step(14);                      // 第一块压板 → 第一道门
    a.hop(20);                                     // 跳过熔岩(22..25)
    a.walkTo(29);                                  // 过第一道门
    a.walkTo(33);                                  // 捡石头
    a.put([[5,2],[5,3]], 'stone');
    a.walkTo(48); a.step(14);                      // 第二块压板 → 第二道门
    a.walkTo(70); a.until(a.cleared, 300);
  }],
];

let ok = 0;
for (const [lv, name, fn] of cases){
  const a = mk();
  try {
    fn(a);
    if (a.cleared()) { console.log('PASS', name); ok++; }
    else console.log('FAIL', name, '没到出口 · cx='+a.cx().toFixed(1)+' bottom='+a.bottom().toFixed(1)+' state='+a.G.state);
  } catch(e){
    console.log('FAIL', name, e.message, '· cx='+a.cx().toFixed(1)+' bottom='+a.bottom().toFixed(1));
  }
}
if (ok !== cases.length) process.exit(1);
