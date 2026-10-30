const assert=require('node:assert/strict'),{boot}=require('./harness');
const {G,win,els}=boot();G.loadLevel(16);G.openEditor();const total=()=>Object.values(G.P.bag).reduce((a,b)=>a+b,0)+G.P.mask.filter(Boolean).length,n=total();
for(const key of ['stone','fire','water','grass','light','steam']){assert(G.equipForm(key));assert.equal(win.GraftElements.skill(G.P.mask),key);assert.equal(total(),n);}
G.closeEditor();assert.equal(G.equipForm('fire'),false);
// Real casting in actual world, not direct damage hooks. Stay in range and use skills.
for(let lv=12;lv<17;lv++){
 G.loadLevel(lv);G.enemies().forEach(e=>e.hp=0);G.P.px=230;for(let n=0;n<10;n++)G.step(1/60);G.enemies().forEach(e=>e.hp=0);for(let n=0;n<10;n++)G.step(1/60);G.P.px=405;G.P.py=264;G.P.invuln=999; // controlled combat fixture, routes remain separately tested
 const boss=G.elements.boss;let guard=0;
 while(boss.hp>0&&guard++<150){const weak=boss.weak[Math.min(boss.phase,boss.weak.length-1)];G.openEditor();assert(G.equipForm(boss.shield?weak:'fire'));G.closeEditor();
  G.P.invuln=999;G.elements.cast();for(let i=0;i<75;i++)G.step(1/60);
 }
 assert.equal(boss.hp,0,'L'+(lv+1)+' boss should be defeatable');assert(!G.locked());
}
G.loadLevel(16);G.enemies().forEach(e=>e.hp=0);G.P.px=230;for(let n=0;n<10;n++)G.step(1/60);G.enemies().forEach(e=>e.hp=0);for(let n=0;n<10;n++)G.step(1/60);G.openEditor();G.equipForm('fire');G.closeEditor();G.P.px=405;G.P.py=264;G.P.invuln=999;G.elements.cast();for(let i=0;i<40;i++)G.step(1/60);assert.equal(G.elements.boss.hp,30);assert.equal(G.elements.boss.shield,2,'wrong element cannot brute force armor');
G.openEditor();G.equipForm('light');G.closeEditor();assert(G.elements.cast());assert(G.elements.reveal>0);const clock=G.elements.boss.clock;G.openEditor();for(let i=0;i<100;i++)G.step(1/60);assert.equal(G.elements.boss.clock,clock,'editor freezes combat');G.closeEditor();
assert(total()>=n,'战斗掉落应保留在背包');console.log('PASS 六种形态、库存守恒、五个首领真实技能击杀、换相护盾、光驱暗与暂停冻结');
