const assert=require('node:assert/strict');
const {boot}=require('./harness');
function inLava(mask){
  const {G}=boot();G.loadLevel(2);G.items().length=G.enemies().length=0;
  G.P.mask.fill(0);for(const [i,j,mat]of mask)G.P.mask[j*8+i]=mat;
  const b=G.bounds();G.P.px+=30*8-b.x;G.P.py+=44*8-(b.y+b.h);
  return G;
}
let G=inLava([[3,3,4]]);
for(let i=0;i<100&&G.state==='play';i++)G.step(1/60);
assert.equal(G.state,'dead','最后一格水也会被岩浆击败');
const cells=[];for(let j=2;j<=4;j++)for(let i=2;i<=4;i++)cells.push([i,j,i===3&&j===3?4:1]);
G=inLava(cells);
for(let i=0;i<65&&G.state==='play';i++)G.step(1/60);
assert(G.bounds().n<9,'不可移除的内部水格不能让全身免伤');
G=inLava([[3,3,1],[4,3,4]]);
for(let i=0;i<60&&G.state==='play';i++)G.step(1/60);
assert.equal(G.state,'play');assert.equal(G.bounds().n,1);assert.equal(G.P.mask.includes(4),false);
console.log('PASS 岩浆消耗外围水,内部水和最后一格水不能无限免伤');
