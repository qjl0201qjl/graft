// 撤销:能撤回贴/削,但不能用来回血、不能把格子撤进墙里
const { boot } = require('./harness');
const { G } = boot();
let bad = 0;
const ok = (c, m)=>{ console.log((c?'PASS ':'FAIL ')+m); if (!c) bad++; };
const n = ()=> G.P.mask.reduce((a,v)=> a + (v?1:0), 0);
G.loadLevel(0); for (let i=0;i<30;i++) G.step(1/60);

G.removeAt(3,2);                         // 削一格
ok(n() === 8 && G.P.bag.meat === 1, '削一格后 8 格,背包 +1');
G.undo();
ok(n() === 9 && G.P.bag.meat === 0, '撤销削:格子回来,背包 -1');
G.P.bag.stone = 1; G.P.sel = 'stone';
G.placeAt(5,4);
ok(n() === 10 && G.P.bag.stone === 0, '贴一格石头');
G.undo();
ok(n() === 9 && G.P.bag.stone === 1, '撤销贴:石头回背包');

// 受伤后撤销,不能把被打掉的格子变回来
G.removeAt(3,2);                         // 先削(进历史)
const b = G.bounds();
G.damage(b.x + b.w/2, b.y + b.h);        // 再被打掉一格
const afterHit = n(), bagAfterHit = G.P.bag.meat;
G.undo();                                // 撤销"削":只能把背包里的材料贴回去
ok(n() === afterHit + 1 && G.P.bag.meat === bagAfterHit - 1, '受伤后撤销只是把背包材料贴回,不会凭空回血');

// 走到墙边后再撤销:被墙挡住的位置不能撤回
G.loadLevel(0); for (let i=0;i<30;i++) G.step(1/60);
G.removeAt(2,2); G.removeAt(3,2); G.removeAt(4,2); G.removeAt(2,3); G.removeAt(3,3); G.removeAt(4,3);
G.key('KeyD', true); for (let i=0;i<200 && G.bounds().x/8 < 31;i++) G.step(1/60); G.key('KeyD', false);
const before = n();
for (let k=0;k<6;k++) G.undo();
const b2 = G.bounds();
let inWall = false;
for (let y=b2.y; y<b2.y+b2.h; y+=8) for (let x=b2.x; x<b2.x+b2.w; x+=8) if (G.tile(Math.floor(x/8), Math.floor(y/8)) === 1) inWall = true;
ok(!inWall, '在墙缝里撤销,不会把格子撤进墙(撤回 '+(n()-before)+' 格)');

// 新手引导
G.loadLevel(0); for (let i=0;i<30;i++) G.step(1/60);
ok(/往右/.test(G.tutStep().text), '引导第 1 步:往右走');
G.key('KeyD', true); for (let i=0;i<200 && G.bounds().x/8 < 21;i++) G.step(1/60); G.key('KeyD', false);
const t2 = G.tutStep();
ok(t2 && t2.target && /削/.test(t2.text), '引导第 2 步:手指指向要削的格子');
process.exit(bad?1:0);
