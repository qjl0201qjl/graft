const assert=require('node:assert/strict');
const {boot}=require('./harness');
const {G,els}=boot();
const step=n=>{for(let i=0;i<n;i++)G.step(1/60)};
const warp=(cx,bottom)=>{const b=G.bounds();G.P.px+=cx*8-(b.x+b.w/2);G.P.py+=bottom*8-(b.y+b.h);G.P.vx=G.P.vy=0;G.P.onGround=false;G.P.invuln=0};
// 小体重踩不亮开关;够重后开门,收回石头仍保持开启。
G.loadLevel(8);step(30);warp(20,40);step(3);
let gate=G.devices().find(d=>d.type==='gate');assert.equal(gate.open,false);
G.P.bag.stone=2;G.P.sel='stone';assert(G.placeAt(5,4));assert(G.placeAt(5,3));step(3);
assert.equal(gate.open,true);assert(G.removeAt(5,3));assert(G.removeAt(5,4));step(3);assert.equal(gate.open,true);
// 单向浮台能载人,暂停/改造时整个机关时钟不动。
let lift=G.devices().find(d=>d.type==='lift');warp(lift.x/8+lift.w/16,lift.y/8);step(10);
assert(Math.abs(G.bounds().y+G.bounds().h-lift.y)<0.1);
let t=lift.t;G.openEditor();step(90);assert.equal(lift.t,t);G.closeEditor();
els.btnPause.dispatchEvent({type:'click'});step(90);assert.equal(lift.t,t);els.pmResume.dispatchEvent({type:'click'});
// 喷火先预警再生效;水消耗一格保护身体,空档不伤人。
G.loadLevel(9);step(30);G.P.bag.water=1;G.P.sel='water';assert(G.placeAt(5,3));
let jet=G.devices().find(d=>d.type==='jet');jet.t=jet.period*0.5;step(1);assert(jet.warning&&!jet.active);
jet.t=jet.period*0.65;warp(24.5,40);step(1);
assert(jet.active);assert(!G.P.mask.includes(4));assert.equal(G.bounds().n,9);assert(G.P.invuln>0);
jet.t=0;jet.phase=0;G.P.invuln=0;const n=G.bounds().n;step(10);assert.equal(G.bounds().n,n);
// 复活还原机关、材料、收集物,不会重复领取或丢失门的进度。
G.loadLevel(8);step(30);gate=G.devices().find(d=>d.type==='gate');gate.open=true;
warp(40,28);step(2);assert(G.checkpoint);const saved=G.checkpoint;
G.P.bag.stone=99;G.seeds()[0].got=true;gate.open=false;G.die();step(130);
assert.equal(G.state,'play');assert.equal(G.P.bag.stone,saved.bag.stone);
assert.equal(G.devices().find(d=>d.type==='gate').open,true);
assert.equal(G.seeds()[0].got,saved.seeds[0].got);
assert(G.P.invuln>0);
G.loadLevel(8,true);assert.equal(G.checkpoint,null);assert.equal(G.devices().find(d=>d.type==='gate').open,false);
// 光种不能藏在实心墙里;只剩一格时受伤也必须能失败,杜绝无敌逃课。
for(let lv=0;lv<G.LEVELS.length;lv++){
 G.loadLevel(lv);assert.equal(G.seeds().length,3);
 for(const s of G.seeds())assert(![1,2].includes(G.tile(Math.floor(s.x/8),Math.floor(s.y/8))),`seed inside wall in level ${lv+1}`);
}
G.loadLevel(0);G.P.mask.fill(0);G.P.mask[3*8+3]=1;G.damage(G.P.px+28,G.P.py+28);assert.equal(G.state,'dead');
console.log('PASS 开关、浮台、暂停、预警、水护盾、复活存档、光种和最后一格伤害');
