// 验证目标随玩法变化、通关结果保留、跨界面输入和重试后的成长记录。
const assert=require('node:assert/strict');
const {boot}=require('./harness');
const {G,els,win}=boot({touch:true});
const step=n=>{for(let i=0;i<n;i++)G.step(1/60);};
const click=id=>els[id].dispatchEvent({type:'click'});
const saved=k=>JSON.parse(win.localStorage.getItem('graft.'+k));
const down=code=>win.dispatchEvent({type:'keydown',code,preventDefault(){}});

G.loadLevel(0);step(30);
assert.match(G.routeStep().title,/削到两格/);
G.openEditor();G.quickBeads('slim');G.closeEditor();
assert.match(els.stepGoal.textContent,/形状合适/);
assert.match(els.toast.textContent,/多跳/,'改造后说明动作带来的变化');
G.openEditor();G.quickBeads('slim');G.closeEditor();
G.key('KeyD',true);
for(let i=0;i<500&&!G.checkpoint;i++)step(1);
G.key('KeyD',false);
assert(G.checkpoint,'穿过第一道缝后触发安全复活点');
assert.match(G.routeStep().title,/一格高/);
const checkpointX=G.P.px;
G.die();step(90);
assert.equal(G.state,'play');assert(Math.abs(G.P.px-checkpointX)<1);
G.key('KeyD',true);
for(let i=0;i<600&&G.state==='play';i++)step(1);
assert.equal(G.state,'clear');
assert(!els.stageClear.classList.contains('hide'));assert(els.wrap.inert);
assert.match(els.clearPraise.textContent,/散架/);
assert.equal(saved('journeyRecords')[0].deaths,1);
assert.equal(saved('unlocked'),1,'到达出口就解锁下一关');
step(240);assert.equal(G.level,0,'结果页不再自动跳走');
const x=G.P.px;down('KeyD');step(30);assert.equal(G.P.px,x);

// Enter 在不同按钮上应交给按钮本身，不能一律跳下一关。
win.dispatchEvent({type:'keydown',code:'Enter',target:{tagName:'BUTTON'},preventDefault(){}});
assert.equal(G.state,'clear');
click('clearBook');assert(G.beadBook.active);down('Enter');step(60);
assert.equal(G.level,0,'拼豆期间不能误跳关');
G.beadBook.close();assert.equal(G.state,'clear');assert(!els.stageClear.inert);
click('clearNext');assert.equal(G.level,1);assert.equal(G.state,'play');assert(!els.wrap.inert);
assert(els.stageClear.classList.contains('hide'));
assert(!G.P.vx,'下一关没有上一关的移动残留');
click('btnGuide');assert.match(els.pmAdvice.textContent,/12.5/);assert.match(els.pmGoal.textContent,/变重/);
const frozen=G.P.px;step(30);assert.equal(G.P.px,frozen);click('pmResume');

// 最佳成绩只会提升；重试不重复计算图册中的同一颗光种。
G.loadLevel(0);G.nextLevel();
assert.equal(saved('journeyRecords')[0].deaths,0);assert.match(els.clearPraise.textContent,/少散架 1 次/);
click('clearRetry');G.die();step(90);G.nextLevel();
assert.equal(saved('journeyRecords')[0].deaths,0);assert.equal(saved('journeyRecords')[0].clears,3);
G.loadLevel(G.LEVELS.length-1);G.nextLevel();assert.equal(G.state,'win');
click('clearBook');assert(G.beadBook.active);G.beadBook.close();
click('clearNext');assert.equal(G.state,'title');assert(els.stageClear.classList.contains('hide'));assert(!els.wrap.inert);
console.log('PASS 动态目标、早期复活点、成果停留、图册往返、输入隔离、成长记录与最终通关');

// 后期目标反映已经触发的机关，不能一直要求已经完成的动作。
G.loadLevel(9);assert.match(G.routeStep().title,/喷口/);
G.devices().find(d=>d.type==='valve').lit=true;assert.match(G.routeStep().title,/柱子/);
G.devices().find(d=>d.type==='relay').lit=true;assert.match(G.routeStep().title,/红门/);
G.devices().find(d=>d.type==='emberwall').open=true;assert.match(G.routeStep().title,/出口/);
G.loadLevel(10);G.P.px=30*8;assert.match(G.routeStep().title,/荆棘/);
G.devices().find(d=>d.type==='bramble').open=true;assert.match(G.routeStep().title,/两处机关/);

// 拾取物恰好在角色中心时不能因 0/0 变成 NaN 而消失。
G.loadLevel(0);step(30);const b=G.bounds(),it=G.items()[0];
it.x=b.x+b.w/2;it.y=b.y+b.h/2;it.vx=it.vy=0;it.t=1;
const before=G.P.bag[it.mat];step(1);
assert.equal(G.P.bag[it.mat],before+1);assert(G.items().every(i=>Number.isFinite(i.x)&&Number.isFinite(i.y)));
console.log('PASS 机关目标推进与中心拾取边界情况');
