const assert=require('node:assert/strict'),{boot}=require('./harness');
const {G,win,els}=boot();const patterns=G.beadBook.patterns;
function memory(initial){let data=initial||{};return {get(k,d){return k in data?JSON.parse(JSON.stringify(data[k])):d},set(k,v){data[k]=JSON.parse(JSON.stringify(v))},data:()=>data};}
function solve(model){let steps=0;while(model.state.status==='play'&&steps++<180){const indices=model.hint();assert(indices.length,'任何正常中间状态应有可成组提示');for(const i of indices)model.take(i);}assert.equal(model.state.status,'won');}
// 每种图纸多次变序，必须都有简单可执行解；点击一次只取一颗，不消耗旧背包。
for(let seed=0;seed<40;seed++){
 const store=memory({harbor:{attempt:seed*7}}),awards=[];const m=win.GraftHarbor.createModel(store,patterns,id=>awards.push(id));
 assert.equal(m.start(5),false,'不能跳过未解锁关卡');assert.equal(m.take(-1),null);assert.equal(m.take(1.2),null);
 for(let stage=0;stage<6;stage++){assert(m.start(stage));solve(m);assert.equal(awards.length,stage+1);assert.equal(m.canUndo,false,'成品发放后不能撤回刷奖励');assert.equal(m.take(0),null);}
 assert.equal(m.done.length,6);m.start(0);solve(m);assert.equal(new Set(awards).size,6);assert.equal(awards.length,6,'重复完成不发第二次奖励');
}
// 半局保存、撤回及篮子满恢复。
let lost=false;
for(let n=0;n<60&&!lost;n++){
 const store=memory({harbor:{done:[0,1,2,3],attempt:n}}),m=win.GraftHarbor.createModel(store,patterns,()=>{});m.start(4);
 for(let i=0;i<80&&m.state.status==='play';i++){const s=m.state;const free=s.pool.findIndex(c=>c&&s.tray.filter(v=>v===c).length<2);if(free>=0)m.take(free);else for(const p of m.hint())m.take(p);}
 if(m.state.status==='lost'){
  lost=true;const saved=m.state,restored=win.GraftHarbor.createModel(store,patterns,()=>{});assert.deepEqual(restored.state,saved);assert(restored.canUndo);assert(restored.undo());assert.equal(restored.state.status,'play');assert.equal(restored.state.tray.length,5);solve(restored);
 }
}
assert(lost,'应能验证真实篮满后的撤回恢复');
// 坏存档重建；不能恢复超前关或非法数量。
for(const active of [{stage:99},{stage:0,pool:[1],tray:[],stock:[],groups:[],status:'play'}]){const m=win.GraftHarbor.createModel(memory({harbor:{active}}),patterns,()=>{});assert.equal(m.state.stage,0);solve(m);}
// 图册是真正收到完整成品，且不动关内材料/光种；关闭后恢复原玩法。
G.loadLevel(0);for(let i=0;i<30;i++)G.step(1/60);const bag=JSON.stringify(G.P.bag),mask=Array.from(G.P.mask),pos=G.P.px;G.harbor.open();G.key('KeyD',true);for(let i=0;i<20;i++)G.step(1/60);assert.equal(G.P.px,pos);solve(G.harbor.model);assert(G.beadBook.completed.includes('sprout'));assert.equal(G.beadBook.worn,'sprout');assert.equal(G.beadBook.total(),0);assert.equal(JSON.stringify(G.P.bag),bag);assert.deepEqual(Array.from(G.P.mask),mask);G.harbor.close();G.step(1/60);assert.equal(G.P.px,pos);
console.log('PASS 六种图纸 240 次变序可解、解锁、篮满撤回恢复、坏存档、成品入册、进度隔离与输入暂停');

const home=boot();home.win.dispatchEvent({type:'keydown',code:'Enter',preventDefault(){}});assert(home.G.harbor.active,'首页默认键盘入口应进入豆岛');home.G.harbor.close();

assert(G.beadBook.awardPattern('drop'));G.beadBook.open('drop');assert.equal(els.bookName.textContent,'一滴海蓝','查看成品应定位到对应作品');G.beadBook.close();
