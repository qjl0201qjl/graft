// 材料能力必须由身上贴着的对应色块触发;背包库存、错误材料都不能代替。
const assert=require('node:assert/strict');
const {boot}=require('./harness');
const {G,els}=boot();
const step=n=>{for(let i=0;i<n;i++)G.step(1/60)};
const warp=(cx,bottom)=>{const b=G.bounds();G.P.px+=cx*8-(b.x+b.w/2);G.P.py+=bottom*8-(b.y+b.h);G.P.vx=G.P.vy=0;G.P.invuln=0};
function equip(mat){G.P.bag[mat]=1;G.P.sel=mat;assert(G.placeAt(1,3));}
function start(lv){G.loadLevel(lv);step(30);G.items().length=0;G.enemies().length=0;}
// 草专属:库存里有草不会唤醒蘑菇,带石头也不行;贴草后才会弹起。
start(7);warp(10,40);G.P.bag.grass=10;step(5);
let mushroom=G.devices().find(d=>d.type==='spring');assert(!mushroom.lit);assert(G.P.vy>=0);
equip('stone');step(5);assert(!mushroom.lit);assert(G.removeAt(1,3));
equip('grass');step(5);assert(mushroom.lit);assert(G.P.vy<0);
// 草只长场景藤蔓,不复制身体或库存;植物踏板也确实能站上去。
warp(25,31);const mask=Array.from(G.P.mask),bag=G.P.bag.grass;step(3);
const vines=G.devices().filter(d=>d.type==='vine');assert(vines.every(d=>d.grown));
assert.deepEqual(Array.from(G.P.mask),mask);assert.equal(G.P.bag.grass,bag);
warp(36,29);step(90);assert(Math.abs(G.bounds().y+G.bounds().h-31*8)<0.1);
// 火专属:肉、石和背包里的火都烧不开;贴身火自动烧开,编辑暂停不推进燃烧。
start(10);for(const [i,j] of [[2,2],[3,2],[4,2]])assert(G.removeAt(i,j));warp(27.5,40);G.P.bag.fire=10;step(60);
let bramble=G.devices().find(d=>d.type==='bramble');assert(!bramble.open);assert.equal(bramble.progress,0);
equip('stone');step(60);assert(!bramble.open);assert(G.removeAt(1,3));
equip('fire');step(10);assert(bramble.progress>0&&bramble.progress<1);
const progress=bramble.progress;G.openEditor();step(90);assert.equal(bramble.progress,progress);G.closeEditor();
step(60);assert(bramble.open);
// 水专属:火和库存水不能冷却门;身上消耗一格水后永久开门,不扣第二次。
start(9);warp(62.5,40);G.P.bag.water=10;step(50);
let wall=G.devices().find(d=>d.type==='emberwall');assert(!wall.open);
equip('fire');step(40);assert(!wall.open);assert(G.removeAt(1,3));
equip('water');const waterBag=G.P.bag.water,bodyN=G.bounds().n;step(40);
assert(wall.open);assert.equal(G.bounds().n,bodyN-1);assert.equal(G.P.bag.water,waterBag);
equip('water');step(40);assert.equal(G.P.mask.filter(v=>v===4).length,1);
// 水阀永久关掉目标喷口,跨过多个喷火周期也不会重燃。
start(9);warp(19,40);equip('water');step(30);
const valve=G.devices().find(d=>d.type==='valve');const jet=G.devices().find(d=>d.id==='water-jet');
assert(valve.lit&&jet.quenched);step(600);assert(!jet.active&&!jet.warning);
// 元素进度可随复活点恢复,手动重来才清空。
warp(50,40);step(3);assert(G.checkpoint);const saved=G.checkpoint;G.die();step(130);
assert(G.devices().find(d=>d.id==='water-jet').quenched);assert.equal(G.checkpoint,saved);
G.loadLevel(9,true);assert(!G.devices().find(d=>d.id==='water-jet').quenched);
assert(els.edMatHint.textContent.includes('石'));
console.log('PASS 火烧荆棘、水冷却与灭火、草唤醒与藤蔓、库存区分、暂停及复活持久化');
