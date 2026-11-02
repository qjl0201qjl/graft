const assert=require('node:assert/strict'),{boot}=require('./harness');
const {G,els,win}=boot();const click=e=>e.dispatchEvent({type:'click'});const step=n=>{for(let i=0;i<n;i++)G.step(1/60)};
click(els.btnExpedition);assert(G.missionSelect.active);assert.equal(G.state,'title');assert.equal(els.missionList.children.filter(b=>b.disabled).length,4);
click(els.pilotStyles.children[2]);assert.equal(G.missionSelect.style,'cloak');assert.equal(JSON.parse(win.localStorage.getItem('graft.pilotStyle')),'cloak');
click(els.missionModes.children[1]);click(els.missionStart);assert.equal(G.campaignDifficulty,'hard');assert.equal(G.level,12);assert.equal(G.enemies().length,3);assert(G.enemies().some(e=>e.elite));assert.equal(G.elements.boss.max,78);
G.expedition.take(0);G.expedition.take(0);assert(G.expedition.craft('cannon',0));
function kill(){G.enemies().forEach(e=>e.hp=0);step(4);}
G.P.invuln=999;kill();G.P.px=225;step(3);assert.equal(G.journeyWave,1);assert(G.enemies().some(e=>e.role==='ranged'));kill();G.P.px=325;step(3);assert.equal(G.journeyWave,2);assert(G.enemies().length>0);assert(!G.journeyReady(),'挑战必须完成第三队');kill();G.devices().filter(d=>d.type==='pylon'||d.type==='salvage').forEach(d=>d.used=true);G.P.px=375;step(3);assert.equal(G.journeyWave,3);assert(!G.journeyReady(),'前三个区域不提前出现首领');step(2);assert(!G.locked());assert(G.advanceExpeditionRoom());assert.equal(G.campaignRoom,1);
// The upper route grants a real one-use cooldown reward.
G.loadLevel(12);const b=G.bounds();G.P.px+=268-b.x-b.w/2;G.P.py+=240-b.y-b.h;G.P.vx=G.P.vy=0;step(2);assert(G.elements.boosted>0);const boost=G.elements.boosted;step(10);assert(G.elements.boosted<boost,'站在充能点不能无限刷新');assert(G.elements.cast());assert(G.elements.cooldown<.4,'充能必须实际缩短攻击间隔');
console.log('PASS 目录确认、锁定章节、造型存档、挑战精英/远程/三段门槛、关底首领与高台充能收益');
