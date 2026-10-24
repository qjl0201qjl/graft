// 战斗可行性:一个很笨的机器人(贴石头当盾、对大石怪起跳踩头),8 局里能打光几局
'use strict';
const { boot } = require('./harness');
const DT = 1/60;

function fight(lv, seed){
  let s = seed; const R = ()=> (s = (s*16807) % 2147483647) / 2147483647;
  const { G, win } = boot(); win.Math.random = R;
  G.loadLevel(lv);
  const st = n => { for (let i=0;i<n;i++) G.step(DT); };
  st(20);
  const b = ()=> G.bounds(), cx = ()=> b().x + b().w/2;
  G.key('KeyD', true); for (let f=0; f<120 && cx() < 17*8; f++) st(1); G.key('KeyD', false); st(10);
  const armor = ()=>{
    for (const [i,j] of [[5,4],[5,3],[5,2],[1,4],[1,3],[1,2],[2,1],[3,1],[4,1]])
      for (const k of ['stone','fire','meat','grass']) if (G.P.bag[k] > 0){ G.P.sel = k; if (G.placeAt(i,j)) break; }
  };
  armor();
  let t = 0, deaths = 0;
  while (t < 90*60){
    if (G.state === 'dead'){ deaths++; st(80); armor(); continue; }
    if (G.state !== 'play') break;
    const es = G.enemies();
    if (!es.length) break;
    let e = es[0], d = 1e9;
    for (const q of es){ const dd = Math.abs(q.x+q.w/2 - cx()); if (dd < d){ d = dd; e = q; } }
    const dir = (e.x + e.w/2) > cx() ? 1 : -1;
    G.key('KeyD', dir > 0); G.key('KeyA', dir < 0);
    if (e.big){ if (G.P.onGround && d < 48 && d > 16){ G.key('Space', true); st(18); G.key('Space', false); } }
    else if (G.P.onGround && R() < 0.02){ G.key('Space', true); st(10); G.key('Space', false); }
    st(1); t++;
    if (t % 90 === 0) armor();
  }
  G.key('KeyD', false); G.key('KeyA', false);
  return { win: G.enemies().length === 0 && !G.locked(), deaths, secs: (t/60).toFixed(0) };
}

let bad = 0;
for (const lv of [3, 6]){
  const runs = [];
  for (let k=1;k<=8;k++) runs.push(fight(lv, k*7919));
  const wins = runs.filter(r => r.win).length;
  console.log((wins?'PASS ':'FAIL ')+'L'+(lv+1)+' 战斗:笨机器人 8 局打光 '+wins+' 局  ('+runs.map(r=> (r.win?'✓':'✗')+r.secs+'s').join(' ')+')');
  if (!wins) bad++;
}
process.exit(bad ? 1 : 0);
