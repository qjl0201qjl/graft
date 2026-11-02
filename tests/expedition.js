const assert=require('node:assert/strict'),{boot}=require('./harness');
const {G,win,els}=boot();const lib=win.GraftExpedition,kit=lib.create();
const inventory=()=>kit.state.columns.flat().length+kit.state.tray.length+kit.state.spent;
assert.equal(inventory(),16);assert(kit.take(0));assert(kit.take(0));assert(kit.canCraft('cannon'));assert(!kit.craft('guard',0));assert.equal(inventory(),16);assert(kit.craft('cannon',0));assert.equal(inventory(),16);assert.equal(kit.stats().damage,1);
for(let i=0;i<4;i++)assert(kit.take(1));assert(!kit.take(2),'工作台满时不能取出第五颗');assert(kit.putBack(0));assert(kit.take(2));assert.equal(inventory(),16,'归还/再次取出不能复制材料');
const saved=kit.snapshot();kit.enter(1);kit.restore(saved);assert.equal(JSON.stringify(kit.snapshot()),JSON.stringify(saved));
// Legal state fixtures let us test every component's actual consequences in isolation.
function equip(id,level=1){const s=G.expedition.snapshot();s.gear=[{id,level},null,null];s.shield=id==='guard'?level:0;G.expedition.restore(s);}
const step=n=>{for(let i=0;i<n;i++)G.step(1/60)};
G.loadLevel(12);G.P.invuln=999;G.switchElement('fire');assert(G.elements.cast());const baseCooldown=G.elements.cooldown;step(30);equip('cannon',2);assert(G.elements.cast());assert(G.elements.cooldown<baseCooldown);assert.equal(G.elements.shots.at(-1).bonus,2);
G.loadLevel(12);equip('guard',2);G.P.invuln=0;const cells=G.bounds().n;G.damage(80,290);assert.equal(G.bounds().n,cells);assert.equal(G.expedition.state.shield,1);G.P.invuln=0;G.damage(80,290);assert.equal(G.bounds().n,cells);G.P.invuln=0;G.damage(80,290);assert(G.bounds().n<cells,'护盾次数耗尽后仍会受伤');
for(const enabled of [false,true]){G.loadLevel(12);if(enabled)equip('hook');G.enemies().length=0;G.P.invuln=999;G.P.py-=80;G.P.vy=0;G.P.onGround=false;G.P.coyote=0;G.key('Space',true);step(1);assert.equal(G.P.vy<0,enabled,'只有藤索可在空中再次跳');G.key('Space',false);if(enabled){G.P.vy=0;G.key('Space',true);step(1);assert(G.P.vy>=0,'一次腾空只能额外跳一次');G.key('Space',false);}}
// Real projectiles: stream pierces two enemies, steam's fourth shot blasts a nearby enemy.
for(const id of ['stream','steam']){
 G.loadLevel(12);equip(id);G.P.invuln=999;const b=G.bounds();G.P.px+=100-b.x-b.w/2;G.P.py+=320-b.y-b.h;G.enemies().length=0;
 const e=(x,y)=>({x,y,w:16,h:16,hp:100,inv:0,mat:'fire',flash:0});const enemies=G.enemies();enemies.push(e(135,300),e(id==='steam'?145:157,id==='steam'?288:300));
 for(let shot=0;shot<(id==='steam'?4:1);shot++){assert(G.elements.cast());for(let i=0;i<35;i++)G.elements.update(1/60);enemies.forEach(e=>e.inv=0);}
 assert(enemies[0].hp<100);assert(enemies[1].hp<100,id+' 必须实际命中第二个目标');
}
// All five chapters must go through four rooms. Clearing enemies alone never completes a chapter.
for(let chapter=0;chapter<5;chapter++){
 G.loadLevel(12+chapter,false,0,null,5);G.P.invuln=999;
 for(let room=0;room<3;room++){
  assert.equal(G.campaignRoom,room);assert(!G.journeyReady());assert(!G.advanceExpeditionRoom(),'未完成目标不可进入下一区');
  for(let i=0;i<110;i++){G.P.px=400;G.enemies().forEach(e=>e.hp=0);G.step(1/60);}
  assert(G.locked(),'仅清小怪不能跳过拼装和机关');
  if(G.expedition.state.crafted<(room===2?2:1)){const col=room===2?1:0;assert(G.expedition.take(col));assert(G.expedition.take(col));assert(G.expedition.craft('cannon',0));}
  G.devices().filter(d=>d.type==='pylon'||d.type==='salvage').forEach(d=>d.used=true);G.field.done=true;step(3);assert(!G.locked());const gear=JSON.stringify(G.expedition.state.gear);G.nextLevel();assert.equal(G.state,'play');assert.equal(G.campaignRoom,room+1);assert.equal(JSON.stringify(G.expedition.state.gear),gear,'换区保留装备');assert.equal(JSON.parse(win.localStorage.getItem('graft.elementChapter')||'0'),0,'前三个区域不能解锁下一章');
 }
 assert.equal(G.enemies().length,0,'大厅直接面对首领，不再藏在清怪条件后');assert(G.locked());G.nextLevel();assert.equal(G.state,'play','未击破首领不能结算');G.P.px=380;step(2);assert(G.journeyReady());
 G.elements.boss.hp=0;G.nextLevel();assert(['clear','win'].includes(G.state));
 // Reset progression for the next isolated chapter assertion.
 win.localStorage.setItem('graft.elementChapter','0');
}
console.log('PASS 取豆资源守恒、满槽归还、组件伤害/护盾/二段跳/穿透/爆炸、五章四区必经首领与装备继承');

// Invalid saved inventories are rejected; real menu retry remains in the current region.
assert(!kit.restore({room:3}));const bad=kit.snapshot();bad.tray=[bad.columns[0][0]];assert(!kit.restore(bad),'重复材料 ID 不能读入');
G.loadLevel(12,false,2);els.btnPause.dispatchEvent({type:'click'});els.pmRetry.dispatchEvent({type:'click'});assert.equal(G.campaignRoom,2);assert.equal(JSON.parse(win.localStorage.getItem('graft.campaignRun')).room,2);
console.log('PASS 损坏/重复材料存档拒绝、菜单重试保持当前区域');

// Defeated enemies drop stable salvage IDs. Replaying a checkpoint cannot claim the same craft stock twice.
G.loadLevel(12);G.P.invuln=999;
function claimFirstEnemy(){G.enemies()[0].hp=0;step(8);const b=G.bounds();G.items().forEach(it=>{it.x=b.x+b.w/2;it.y=b.y+b.h/2;it.vx=it.vy=0;});step(2);}
claimFirstEnemy();assert.equal(G.expedition.state.claimed.length,2);const loot=G.expedition.snapshot(),stock=loot.columns.flat().length;
G.loadLevel(12,true,0,loot);G.P.invuln=999;claimFirstEnemy();assert.equal(G.expedition.state.claimed.length,2);assert.equal(G.expedition.state.columns.flat().length,stock,'同一敌人掉落不能重复进入拼装库存');
console.log('PASS 实际战利品进入取豆堆、区域复活后相同掉落去重');
