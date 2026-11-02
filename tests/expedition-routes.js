// Real movement/jumps/projectiles. Combat damage is isolated to validate mandatory routes.
const assert=require('node:assert/strict'),{boot}=require('./harness');
const fps=Number(process.env.GRAFT_TEST_FPS)||60,dt=1/fps;
function run(chapter,room,stage){
 const {G}=boot({touch:true});G.loadLevel(12+chapter,false,room,null,stage);G.P.invuln=999;
 const foot=()=>{const b=G.bounds();return(b.y+b.h)/8},cx=()=>{const b=G.bounds();return(b.x+b.w/2)/8};
 const tick=()=>{G.enemies().length=0;G.step(dt);assert.equal(G.state,'play');};
 const wait=(test,max=8)=>{for(let i=0;i<max*fps;i++){if(test())return;tick();}assert(test(),`C${chapter+1} S${stage+1} R${room+1}: x=${cx().toFixed(1)} foot=${foot().toFixed(1)}`);};
 const walk=x=>{const right=x>cx();G.key(right?'KeyD':'KeyA',true);wait(()=>right?cx()>=x:cx()<=x);G.key(right?'KeyD':'KeyA',false);};
 const jump=(x,row,allowHigher=false)=>{G.key('Space',true);walk(x);G.key('Space',false);wait(()=>G.P.onGround);assert(allowHigher?foot()<=row+.2:Math.abs(foot()-row)<.2,`C${chapter+1} S${stage+1} R${room+1} landing ${foot().toFixed(1)}, wanted ${row}`);};
 const shoot=node=>{G.switchElement(node.mat);for(let attempt=0;attempt<8&&!node.used;attempt++){G.enemies().length=0;G.elements.cast();for(let i=0;i<fps*.6;i++)tick();}assert(node.used,'真实路线必须能用弹道打开 '+node.label);};
 wait(()=>G.P.onGround);const nodes=G.devices().filter(d=>d.type==='pylon');
 if(room===0){walk(13);jump(21,35);jump(26.5,34);jump(33,30);walk(40);wait(()=>G.P.onGround);jump(44.5,35);shoot(nodes[0]);walk(54);wait(()=>G.P.onGround);jump(58.5,35,true);jump(65,31);assert(G.devices().filter(d=>d.type==='salvage').every(d=>d.used));}
 if(room===1){walk(13);jump(20,36);jump(25.5,36);jump(31.5,32);shoot(nodes[0]);jump(40.5,32);jump(46,28);shoot(nodes.find(d=>d.x===46*8));walk(54);wait(()=>G.P.onGround);jump(58.5,36,true);jump(64.5,32);shoot(nodes[1]);wait(()=>G.devices().find(d=>d.type==='gate').open);}
 if(room===2){walk(43);jump(48,35);shoot(nodes[0]);}
 if(room===3){
  if(stage===0||stage===4){walk(23);shoot(nodes[0]);walk(40);jump(44.5,35);shoot(nodes[1]);walk(54);wait(()=>G.P.onGround);jump(58.5,35,true);jump(65,31);shoot(nodes[2]);}
  if(stage===1){walk(17);for(let i=0;i<3;i++)tick();assert(G.field.carry);walk(54);jump(58.5,35,true);jump(65,31);for(let i=0;i<3;i++)tick();assert(G.field.delivered);}
  if(stage===2){walk(42);for(let i=0;i<3;i++)tick();assert(G.field.started);}
  if(stage===3){walk(13);jump(21,35);jump(26.5,34);jump(33,30);jump(46,35);walk(54);wait(()=>G.P.onGround);jump(58.5,35,true);jump(65,31);assert(G.devices().filter(d=>d.type==='shard').every(d=>d.used));}
  if(stage===5){walk(54);jump(58.5,35,true);jump(64.5,31);}
 }

}
for(let chapter=0;chapter<5;chapter++)for(let stage=0;stage<6;stage++)for(let room=0;room<4;room++)run(chapter,room,stage);
console.log('PASS '+fps+'FPS 三十关一百二十区域的补给、桥机、运送、寻物、接力与首领高台真实路线');
