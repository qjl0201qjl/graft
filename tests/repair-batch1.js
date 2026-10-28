const assert=require('node:assert/strict');
const {boot}=require('./harness');
const {G,els,win}=boot({touch:true,width:320,height:568});
const step=n=>{for(let i=0;i<n;i++)G.step(1/60)};
const stand=(cx,row)=>{const b=G.bounds();G.P.px+=cx*8-b.x-b.w/2;G.P.py+=row*8-b.y-b.h;G.P.vx=G.P.vy=0;G.P.invuln=0;};
const overlap=(a,b)=>a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y;
const click=id=>els[id].dispatchEvent({type:'click'});

// 所有关卡出生的敌人都不能卡在闭门/实体墙内；光种避开旗面与徽记标签。
for(let lv=0;lv<G.LEVELS.length;lv++){
 G.loadLevel(lv);
 const barriers=G.devices().filter(d=>['gate','bramble','emberwall'].includes(d.type));
 for(const enemy of G.enemies()){
  for(const door of barriers)assert(!overlap(enemy,door),'L'+(lv+1)+' 敌人出生在门内');
  for(let y=Math.floor(enemy.y/8);y<Math.ceil((enemy.y+enemy.h)/8);y++)for(let x=Math.floor(enemy.x/8);x<Math.ceil((enemy.x+enemy.w)/8);x++)assert(![1,2].includes(G.tile(x,y)));
 }
 for(const seed of G.seeds()){
  const seedBox={x:seed.x-5,y:seed.y-7,w:10,h:14};
  for(const d of G.devices()){
   if(d.type==='checkpoint')assert(!overlap(seedBox,{x:d.x-2,y:d.y-28,w:16,h:28}),'L'+(lv+1)+' 光种碰复活旗');
   if(d.type==='relay')assert(!overlap(seedBox,{x:d.x+d.w/2-18,y:d.y-36,w:36,h:8}),'L'+(lv+1)+' 光种碰共鸣文字');
  }
 }
}
G.loadLevel(9);step(30);stand(68.5,40);const body=Array.from(G.P.mask);
G.key('KeyD',true);step(120);G.key('KeyD',false);
assert.deepEqual(Array.from(G.P.mask),body,'贴闭门两秒，敌人不能隔门伤人');assert.equal(G.state,'play');

// 中间桥接的水不能消耗，必须解释原因；外侧水可消耗且只用一颗。
G.loadLevel(9);G.items().length=0;G.enemies().length=0;
G.P.mask.fill(0);G.P.mask[4*8+2]=1;G.P.mask[4*8+3]=4;G.P.mask[4*8+4]=1;
stand(62,40);step(35);const door=G.devices().find(d=>d.type==='emberwall');
assert(!door.open);assert.match(els.toast.textContent,/把水贴到边缘/);assert.equal(G.P.mask.filter(v=>v===4).length,1);
G.P.bag.water=1;G.P.sel='water';assert(G.placeAt(2,3));step(35);assert(door.open);
assert.equal(G.P.mask.filter(v=>v===4).length,1);step(60);assert.equal(G.P.mask.filter(v=>v===4).length,1);

// pointerdown 不抢执行权；原生 click 一次只执行一次，键盘默认激活未被全局拦截。
G.loadLevel(0);G.items().length=0;step(30);
els.btnEdit.dispatchEvent({type:'pointerdown',preventDefault(){}});assert(!G.editing);
click('btnEdit');assert(G.editing);G.drawEditor();assert(els.edLight.disabled);assert(els.edAttach.disabled);
G.P.bag.stone=1;G.P.sel='stone';G.drawEditor();assert(!els.edAttach.disabled);
click('edAttach');assert(els.edAttach.disabled);assert(!els.edLight.disabled);
click('edLight');assert(els.edLight.disabled);assert(!els.edAttach.disabled);
for(const code of ['Space','Enter','Tab']){
 let prevented=false;
 win.dispatchEvent({type:'keydown',code,target:{tagName:'BUTTON'},preventDefault(){prevented=true;}});
 assert(!prevented,'按钮上的 '+code+' 应交给浏览器');assert(G.editing);
}
click('btnEdit');assert(!G.editing);
assert(G.removeAt(3,2));const cut=G.bounds().n;
els.btnUndo.dispatchEvent({type:'pointerdown',preventDefault(){}});assert.equal(G.bounds().n,cut);
click('btnUndo');assert.equal(G.bounds().n,cut+1);assert(!G.P.vy);

// 跳关解锁不是通关；只有记录 clears 的关卡能点亮足迹。
const fresh=boot();fresh.G.loadLevel(7);fresh.G.nextLevel();
assert(fresh.els.clearTrail.children.slice(0,7).every(e=>!e.className.includes(' done')));
assert(fresh.els.clearTrail.children[7].className.includes(' done'));
fresh.G.loadLevel(0);assert.match(fresh.G.routeStep().tip,/点击身体/);

// 重量数字跟随未完成的踏板；上限也参与达标判断，不能一概越重越绿。
G.loadLevel(8);step(30);G.render();assert.equal(els.wValue.textContent,'9.0 / 12.5+');
G.devices().find(d=>d.type==='plate'&&d.target==='a').lit=true;
G.P.bag.stone=3;G.P.sel='stone';assert(G.placeAt(5,4));assert(G.placeAt(5,3));G.render();
assert.equal(els.wValue.textContent,'14.6 / 12.5–15.5');assert(els.wbar.classList.contains('matched'));
assert(G.placeAt(5,2));G.render();assert(!els.wbar.classList.contains('matched'));
G.devices().find(d=>d.type==='plate'&&d.target==='b').lit=true;G.render();assert(!els.wValue.textContent.includes('/'));

// 关数变为 13 时可以收集第 13 关，仍保留旧格式存档和去重。
let count=13;const mem={beadSeeds:{0:3},seeds:{1:2}};
const book=win.GraftBeads.create({get:(k,d)=>mem[k]??d,set:(k,v)=>mem[k]=v},{levelCount:()=>count,open(){},close(){},sound(){},finish(){}});
assert.equal(book.total(),4);book.collect(12,2);book.collect(12,2);assert.equal(book.total(),5);
book.collect(13,0);book.collect(.5,0);assert.equal(book.total(),5);book.open();assert.match(els.bookGoal.textContent,/5\/39/);book.close();
count=2;book.open();assert.equal(book.total(),4);assert.match(els.bookGoal.textContent,/4\/6/);book.close();
console.log('PASS 第一批修复：敌人隔门、旗与徽记重叠、水桥提示、原生按钮、禁用状态、真实通关记录、重量上下限和动态关数');
