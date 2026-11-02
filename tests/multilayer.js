const assert=require('node:assert/strict'),{boot}=require('./harness');
const {win}=boot();const lib=win.GraftElements;const surfaces=[{x:0,y:320,w:640},{x:430,y:240,w:100},{x:290,y:280,w:80}];
for(const fps of [30,60,120])for(let bossIndex=0;bossIndex<5;bossIndex++){
 let b={x:482,y:216,w:16,h:24},hurt=0;
 const c=lib.create({mask:()=>new Uint8Array(64),selected:()=> 'water',bounds:()=>b,face:()=>1,play:()=>true,ready:()=>true,surfaces:()=>surfaces,solid:()=>false,overlap:(a,q)=>a.x<q.x+q.w&&a.x+a.w>q.x&&a.y<q.y+q.h&&a.y+a.h>q.y,hurt:()=>hurt++,note(){},ui(){},burst(){},sound(){},win(){},enemies:()=>[],damage(){}});
 c.reset(bossIndex);for(let i=0;i<Math.ceil(4.1*fps);i++)c.update(1/fps);assert.equal(hurt,0,'预警结束前不能造成伤害');assert(c.hazards.some(a=>a.y<250),'高台玩家必须触发高层攻击');for(let i=0;i<Math.ceil(2*fps);i++)c.update(1/fps);assert(hurt>0,'站着不动的高台玩家必须能被命中，boss '+bossIndex);
 hurt=0;c.reset(bossIndex);b={x:482,y:216,w:16,h:24};for(let i=0;i<4*fps;i++)c.update(1/fps);b={x:70,y:140,w:16,h:24};for(let i=0;i<2.2*fps;i++)c.update(1/fps);assert.equal(hurt,0,'预警后换位必须能躲开');
 if(bossIndex===2)assert(c.boss.y<260,'岩甲跃击应真正登上高台');
}
// A truly vertical shot must aim vertically rather than shoot sideways at 260px/s.
let b={x:482,y:140,w:16,h:24};const c=lib.create({mask:()=>new Uint8Array(64),selected:()=> 'water',bounds:()=>b,face:()=>1,play:()=>true,ready:()=>true,surfaces:()=>surfaces,solid:()=>false,overlap:()=>false,hurt(){},note(){},ui(){},burst(){},sound(){},win(){},enemies:()=>[],damage(){}});c.reset(0);assert(c.cast());assert(Math.abs(c.shots[0].vx)<.01);assert(c.shots[0].vy>250);
// Real node projectile interaction, including wrong elements and upper-platform line of sight.
const {G}=boot();G.loadLevel(12,false,1);G.P.invuln=999;const nodes=G.devices().filter(d=>d.type==='pylon');const step=n=>{for(let i=0;i<n;i++)G.step(1/60)};const stand=d=>{const b=G.bounds();G.P.px+=d.x-44-b.x;G.P.py+=d.y-b.y-b.h;G.P.vx=G.P.vy=0;};
G.enemies().length=0;G.switchElement('fire');stand(nodes[0]);G.elements.cast();step(40);assert(!nodes[0].used);assert.equal(nodes[0].hits,0,'错误元素不能解开节点');
for(const node of nodes){G.switchElement(node.mat);for(let hit=0;hit<(node.requiredHits||2);hit++){G.enemies().length=0;stand(node);step(35);stand(node);G.enemies().length=0;assert(G.elements.cast());step(25);}assert(node.used,node.label+' 必须能用实际弹道解除');}
assert(G.elements.boosted>0);assert.equal(nodes.filter(d=>d.used).length,3);
console.log('PASS 五首领高台伤害/预警换位/30-120FPS、岩甲登台、垂直瞄准、双节点弹道与元素校验');

// A boss retry stays in the fourth room and retains forged equipment, without repeating three rooms.
G.loadLevel(12,false,3,null,5);G.P.invuln=999;G.expedition.take(0);G.expedition.take(0);assert(G.expedition.craft('cannon',0));
const flag=G.devices().find(d=>d.type==='checkpoint'&&d.x>300);
const b0=G.bounds();G.P.px+=flag.x-b0.x-b0.w/2;G.P.py+=flag.y-b0.y-b0.h;G.P.vx=G.P.vy=0;G.P.invuln=0;step(3);assert(G.checkpoint);const saved=G.checkpoint;assert.equal(saved.campaign.room,3);
G.P.bag.fire=99;G.elements.boss.hp=1;G.die();step(75);
assert.equal(G.state,'play');assert.equal(G.campaignRoom,3);assert.equal(G.enemies().length,0);assert.equal(G.expedition.stats().damage,1);assert.equal(G.P.bag.fire,saved.bag.fire);assert.equal(G.elements.boss.hp,G.elements.boss.max);assert.equal(G.elements.boss.phase,0);assert.equal(G.elements.hazards.length,0);
console.log('PASS 首领复活保留第四区域和拼装装备，首领与攻击完整重置');
