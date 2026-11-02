const assert=require('node:assert/strict'),{boot}=require('./harness');
const {G,win,els}=boot();G.loadLevel(11);G.P.bag={meat:30,fire:30,water:30,stone:30,grass:30,light:30};G.openEditor();const total=()=>Object.values(G.P.bag).reduce((a,b)=>a+b,0)+G.P.mask.filter(Boolean).length,n=total();
for(const key of ['stone','fire','water','grass','light','steam']){assert(G.equipForm(key));assert.equal(win.GraftElements.skill(G.P.mask),key);assert.equal(total(),n);}
G.closeEditor();assert.equal(G.equipForm('fire'),false);
// Real casting in actual world, not direct damage hooks. Stay in range and use skills.
for(let lv=12;lv<17;lv++){
 G.loadLevel(lv,false,3,null,5);G.P.px=405;G.P.py=264;G.P.invuln=999; // controlled combat fixture, routes remain separately tested
 const boss=G.elements.boss;let guard=0;
 while(boss.hp>0&&guard++<150){const weak=boss.weak[Math.min(boss.phase,boss.weak.length-1)];assert(G.switchElement(boss.shield?weak:'fire'));
  G.P.invuln=999;G.elements.cast();for(let i=0;i<75;i++)G.step(1/60);
 }
 assert.equal(boss.hp,0,'L'+(lv+1)+' boss should be defeatable');assert.equal(boss.phase,lv===16?4:2,'首领必须完成全部阶段');assert.equal(G.elements.hazards.length,0,'击破首领清除残留攻击');assert(!G.locked());
}
G.loadLevel(16,false,3,null,5);G.switchElement('fire');G.P.px=405;G.P.py=264;G.P.invuln=999;G.elements.cast();for(let i=0;i<40;i++)G.step(1/60);assert.equal(G.elements.boss.hp,G.elements.boss.max);assert.equal(G.elements.boss.shield,2,'wrong element cannot brute force armor');
G.switchElement('light');assert(G.elements.cast());assert(G.elements.reveal>0);const clock=G.elements.boss.clock;G.forge.open();for(let i=0;i<100;i++)G.step(1/60);assert.equal(G.elements.boss.clock,clock,'editor freezes combat');G.forge.close();
console.log('PASS 六种形态、库存守恒、五个首领真实技能击杀、换相护盾、光驱暗与暂停冻结');
