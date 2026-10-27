// 新关卡使用真实移动、跳跃、贴削完成,不传送玩家或跳过机关。
const assert = require('node:assert/strict');
const {boot}=require('./harness');
const FPS=Number(process.env.GRAFT_TEST_FPS)||60;
const DT=1/FPS;
if(FPS!==60)console.log(`── ${FPS} FPS 通关检查`);
function player(lv){
 const {G}=boot();G.loadLevel(lv);
 const a={G,lv,frame(n=1){for(let i=0;i<Math.ceil(n*FPS/60)&&G.state==='play';i++)G.step(DT)},
  cx(){const b=G.bounds();return(b.x+b.w/2)/8},bottom(){const b=G.bounds();return(b.y+b.h)/8},
  wait(fn,max=1500){for(let i=0;i<Math.ceil(max*FPS/60)&&G.state==='play';i++){if(fn())return;G.step(DT)}assert(fn()||G.state==='clear'||G.state==='win',`L${lv+1}: wait failed x=${a.cx().toFixed(1)} floor=${a.bottom().toFixed(1)} state=${G.state}`)},
  walk(x){const dir=x>a.cx()?'KeyD':'KeyA';G.key(dir,true);a.wait(()=>dir==='KeyD'?a.cx()>=x:a.cx()<=x);G.key(dir,false)},
  land(row){a.wait(()=>G.P.onGround);if(a.G.state!=='play')return;assert(Math.abs(a.bottom()-row)<0.2,`L${lv+1}: landed ${a.bottom().toFixed(1)}, expected ${row} at x=${a.cx().toFixed(1)}`)},
  jump(x){G.key('Space',true);a.walk(x);G.key('Space',false)},
  equip(mat){G.P.sel=mat;for(const [i,j]of [[1,3],[1,4],[5,3],[5,4],[3,1]])if(G.placeAt(i,j))return;throw Error('cannot equip '+mat)},
  armor(){G.P.sel='stone';assert(G.placeAt(5,4));assert(G.placeAt(5,3))},
  unarmor(){assert(G.removeAt(5,3));assert(G.removeAt(5,4))},
  clear(){a.wait(()=>G.state==='clear'||G.state==='win',500)},
 };a.frame(30);return a;
}
const routes={
 7(a){a.G.P.sel='grass';assert(a.G.placeAt(5,3));a.walk(23);a.land(31);a.walk(42);a.land(23);a.walk(67);a.land(15);a.walk(75);a.clear()},
 8(a){
  a.walk(14);a.armor();a.walk(20);a.frame(10);assert(a.G.devices().find(d=>d.type==='gate').open);
  a.unarmor();a.walk(33.5);a.wait(()=>a.G.P.onGround&&a.bottom()<29);
  a.jump(41);a.land(28);a.armor();a.walk(44);a.frame(8);assert(a.G.devices().find(d=>d.id==='b').open);a.unarmor();a.walk(47);a.wait(()=>a.G.devices().find(d=>d.type==='lift'&&d.startX===51*8).y>=27.8*8);a.jump(55.5);a.wait(()=>a.G.P.onGround&&a.bottom()<20.5);
  a.jump(68);a.land(19);a.walk(75);a.clear();
 },
 9(a){ // 身上的水关喷口、冷却门;其余喷口仍然看灯通过。
  a.walk(17);a.G.P.sel='water';assert(a.G.placeAt(5,3));a.walk(21);a.frame(35);
  assert(a.G.devices().find(d=>d.type==='valve').lit);
  a.walk(8);a.jump(13);a.land(36);a.jump(21);a.land(33);a.walk(22);a.jump(34);a.land(29);a.equip('water');a.frame(5);assert(a.G.devices().find(d=>d.type==='relay').lit);a.walk(45);a.wait(()=>a.G.P.onGround);
  // 回到地面后穿越剩下的喷口。
  for(const x of [57]){
   a.walk(x-3);
   const d=a.G.devices().find(d=>d.type==='jet'&&d.startX===x*8);
   a.wait(()=>!d.active&&!d.warning&&((d.t+(d.phase||0))%d.period)<0.3);
   a.walk(x+5);
  }
  a.G.P.sel='water';assert(a.G.placeAt(1,3));
  a.G.key('KeyD',true);
  for(let i=0;i<1000&&a.G.state==='play';i++){
   if(a.G.P.onGround){a.G.key('Space',true);a.frame(18);a.G.key('Space',false)}a.frame(3);
  }
  a.G.key('KeyD',false);a.clear();
 },
 10(a){
  for(const [i,j] of [[2,2],[3,2],[4,2]])assert(a.G.removeAt(i,j));
  a.walk(27);a.G.P.sel='fire';assert(a.G.placeAt(1,3));
  a.walk(43);a.land(29);a.walk(46);a.equip('grass');a.equip('fire');a.walk(49);a.frame(5);assert(a.G.devices().find(d=>d.id==='garden'&&d.type==='gate').open);a.walk(47);a.wait(()=>a.G.devices().find(d=>d.type==='lift').y>=28.8*8);a.jump(55.5);a.wait(()=>a.G.P.onGround&&a.bottom()<20.5);
  a.jump(68);a.land(19);a.walk(75);a.clear();
 },
 11(a){
  a.walk(12);a.armor();a.walk(18);a.frame(10);a.unarmor();
  a.walk(25);a.G.P.sel='water';assert(a.G.placeAt(1,3));a.walk(29);
  a.G.P.sel='fire';assert(a.G.placeAt(1,3));
  a.walk(44);a.land(29);a.G.P.sel='grass';assert(a.G.placeAt(1,4));a.walk(47);a.wait(()=>a.G.devices().find(d=>d.type==='lift').y>=28.8*8);a.jump(56);a.wait(()=>a.G.P.onGround&&a.bottom()<22.5);
  a.jump(70);a.walk(77);a.clear();
 }
};
let failed=0;
for(const lv of Object.keys(routes).map(Number)){
 try{const a=player(lv);routes[lv](a);console.log('PASS L'+(lv+1)+' '+a.G.LEVELS[lv].name+' 正常操作通关')}
 catch(e){failed++;console.error('FAIL '+e.message)}
}
process.exitCode=failed?1:0;
