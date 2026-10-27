const assert=require('node:assert/strict');const {boot}=require('./harness');
const {G,els,win}=boot({touch:true});G.loadLevel(0);for(let i=0;i<30;i++)G.step(1/60);
const book=G.beadBook;assert.equal(book.total(),0);assert.equal(book.choose(1),false,'未解锁图纸不能选');book.open();
const px=G.P.px,py=G.P.py,bag=JSON.stringify(G.P.bag),body=Array.from(G.P.mask);
win.dispatchEvent({type:'keydown',code:'KeyD'});win.dispatchEvent({type:'keydown',code:'Space'});for(let i=0;i<30;i++)G.step(1/60);
assert.equal(G.P.px,px);assert.equal(G.P.py,py,'图册中玩法暂停');
assert.equal(book.finish(),false,'空图不能熨烫');const t=book.patterns[0];assert.equal(book.paint(3,1),false,'选错颜色不能填豆');
for(let j=0;j<8;j++)for(let i=0;i<8;i++){const v=+t.rows[j][i];if(v){book.select(v);assert.equal(book.paint(i,j),true);}}
assert.equal(book.counts().count,book.counts().max);assert.equal(book.finish(),true);assert.equal(book.worn,t.id);assert.equal(book.finish(),false,'成品不能重复领取');
assert.equal(JSON.stringify(G.P.bag),bag,'工坊不产生关内材料');assert.deepEqual(Array.from(G.P.mask),body);
book.collect(0,0);book.collect(0,0);assert.equal(book.total(),1,'同一颗光种不能重复记账');book.collect(0,1);assert.equal(book.total(),2);assert.equal(book.choose(1),true);
book.select(4);assert(book.paint(3,0));book.close();G.step(1/60);assert.equal(G.P.px,px,'关闭图册没有输入残留');
const saved=JSON.parse(win.localStorage.getItem('graft.beadBook'));assert.equal(saved.drafts.drop[3],4);assert(saved.done.includes('sprout'));
// 使用同一个存储重新创建图册，验证刷新恢复而不是只检查内存。
const store={get(k,d){const s=win.localStorage.getItem('graft.'+k);return s===null?d:JSON.parse(s)},set(k,v){win.localStorage.setItem('graft.'+k,JSON.stringify(v))}};
const restored=win.GraftBeads.create(store,{open(){},close(){},sound(){},finish(){}});assert.equal(restored.worn,'sprout');assert.equal(restored.total(),2);assert(restored.choose(1));assert.equal(restored.counts().count,1);
G.loadLevel(0);for(let i=0;i<30;i++)G.step(1/60);G.openEditor();const total=()=>G.P.mask.reduce((n,v)=>n+!!v,0)+Object.values(G.P.bag).reduce((a,b)=>a+b,0);const before=total();assert(G.quickBeads('slim'));assert(G.bounds().h<=16);assert(G.quickBeads('slim'));assert.equal(G.bounds().h,8,'第二次瘦身能通过单层缝');assert.equal(total(),before);
G.P.sel='meat';assert(G.quickBeads('attach'));assert.equal(total(),before);G.P.sel='water';assert.equal(G.quickBeads('attach'),false);assert.equal(G.P.bag.water,0);
G.P.bag.stone=2;G.P.sel='stone';assert(G.quickBeads('attach'));assert(G.quickBeads('attach'));const stoneTotal=total();assert(G.quickBeads('light'));assert.equal(G.P.bag.stone,2);assert.equal(total(),stoneTotal);
G.closeEditor();assert.equal(G.quickBeads('slim'),false,'只有暂停的豆板允许快捷改造');
console.log('PASS 图纸锁定、穿豆熨烫、挂件、存档恢复、光种去重、界面输入隔离、快捷改造库存守恒');
