const assert=require('node:assert/strict'),{boot}=require('./harness');
const {G,win,els}=boot();const C=win.GraftCampaign;
const missions=C.WORLDS.flatMap((_,w)=>Array.from({length:6},(_,s)=>C.mission(w,s)));
assert.equal(missions.length,30);assert.equal(new Set(missions.map(m=>m.name)).size,30);assert.equal(new Set(missions.map(m=>m.kind)).size,6);
assert(missions.every(m=>m.target===120));assert.equal(C.progress(null,2).unlocked,12,'旧世界解锁迁移到对应关号');
for(const fps of [30,60,120])for(const mode of ['escort','defend']){
 const f=C.encounter(mode);const p={x:322,y:296,w:16,h:24};let spawn=0;
 for(let i=0;i<fps*4;i++)spawn+=C.encounterStep(f,1/fps,{x:10,y:296,w:16,h:24},[])?1:0;assert.equal(f.progress,0,'远离任务不能空等完成');
 for(let i=0;i<fps*50;i++){p.x=f.x-8;spawn+=C.encounterStep(f,1/fps,p,[])?1:0;}assert(f.done);assert.equal(spawn,4);assert(f.progress>=46);
 const blocked=C.encounter(mode);for(let i=0;i<fps*5;i++)C.encounterStep(blocked,1/fps,p,[{x:blocked.x,y:296,w:16,h:24,hp:8}]);assert.equal(blocked.progress,0,'守卫贴近目标时不能继续充能');
}
const step=n=>{for(let i=0;i<n;i++)G.step(1/60)};
// A complete catalog test isolates objective state; actual paths and projectiles are separately tested.
for(const m of missions){
 G.loadLevel(12+m.world,false,0,null,m.stage);G.P.invuln=999;
 G.expedition.take(0);G.expedition.take(0);assert(G.expedition.craft('cannon',0));G.expedition.take(1);G.expedition.take(1);assert(G.expedition.craft('stream',1));
 for(let room=0;room<4;room++){
  G.nextLevel();assert.equal(G.state,'play');assert.equal(G.campaignRoom,room,'未完成目标不可跳到下一区');
  if(room<3){for(let i=0;i<100;i++){G.P.px=400;G.enemies().forEach(e=>e.hp=0);G.step(1/60);}}
  G.enemies().length=0;G.devices().filter(d=>['pylon','salvage','shard'].includes(d.type)).forEach(d=>d.used=true);G.field.done=true;G.field.delivered=true;
  if(room===3&&m.stage===5)G.elements.boss.hp=0;step(2);G.nextLevel();
 }
 assert.equal(G.state,m.id===29?'win':'clear');const p=JSON.parse(win.localStorage.getItem('graft.missionProgress'));assert(p.cleared[m.id]);assert.equal(p.unlocked,Math.min(29,m.id+1));
 if(m.id<29){G.continueJourney();assert.equal(G.level,12+Math.floor((m.id+1)/6));assert.equal(G.missionStage,(m.id+1)%6,'下一关不能跳过同世界的普通关');}
}
// Timer includes crafting decisions, excludes pause, and survives region transitions.
G.loadLevel(12);step(60);const t=G.missionElapsed;G.forge.open();const field=G.field.progress;step(60);assert(G.missionElapsed>=t+.99);assert.equal(G.field.progress,field);G.forge.close();els.btnPause.dispatchEvent({type:'click'});const paused=G.missionElapsed;step(60);assert.equal(G.missionElapsed,paused);els.pmResume.dispatchEvent({type:'click'});
els.btnExpedition.dispatchEvent({type:'click'});assert.equal(els.missionStages.children.length,6);G.missionSelect.close();
console.log('PASS 三十关唯一命名/六种任务、旧进度迁移、独立结算与逐关解锁、30-120FPS护送/守灯、拼装计时与暂停');
