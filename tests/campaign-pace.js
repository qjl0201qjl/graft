const assert=require('assert/strict'),{boot}=require('./harness');
function play(world,stage){
 const {G,win}=boot({touch:true});let rng=2401+world*7+stage;win.Math.random=()=>{rng=(Math.imul(rng,1664525)+1013904223)>>>0;return rng/4294967296;};G.loadLevel(12+world,false,0,null,stage);G.P.invuln=999;let frame=0,selected='water',manualNode=null;
 const foot=()=>{const b=G.bounds();return(b.y+b.h)/8},cx=()=>{const b=G.bounds();return(b.x+b.w/2)/8};
 function tick(){if(G.enemies().length&&!manualNode){const e=G.enemies().filter(e=>e.hp>0).sort((a,b)=>Math.abs(a.x-cx()*8)-Math.abs(b.x-cx()*8))[0];const k=e&&({fire:'water',water:'grass',grass:'fire',stone:world>=2?'stone':'fire',dark:'light'}[e.affinity]);if(k&&k!==selected){if(G.switchElement(k))selected=k;}}
  G.elements.hold(true);G.step(1/60);frame++;assert(frame<60*300,`timeout W${world} S${stage} R${G.campaignRoom} x${cx()} mobs${G.enemies().length} field${G.field.progress}`);assert(['play','clear','win'].includes(G.state));}
 const wait=(test,max=30)=>{for(let i=0;i<max*60;i++){if(test())return;tick();}assert(test(),`wait W${world} S${stage} R${G.campaignRoom} x${cx()} foot${foot()} mobs${G.enemies().length} wave${G.journeyWave}`);};
 const seconds=n=>{for(let i=0;i<n*60;i++)tick();};
 const walk=x=>{const initialRoom=G.campaignRoom,right=x>cx();G.key(right?'KeyD':'KeyA',true);wait(()=>G.campaignRoom!==initialRoom||G.state!=='play'||(right?cx()>=x:cx()<=x),8);G.key(right?'KeyD':'KeyA',false);};
 const jump=(x,row,higher=false)=>{G.key('Space',true);walk(x);G.key('Space',false);wait(()=>G.P.onGround,5);assert(higher?foot()<=row+.3:Math.abs(foot()-row)<.3,`landing W${world} S${stage} R${G.campaignRoom}: ${foot()} wanted ${row}`);};
 const shoot=d=>{if(d.used)return;G.switchElement(d.mat);selected=d.mat;manualNode=d;wait(()=>d.used,15);if(G.campaignRoom===3)wait(()=>!G.enemies().some(e=>e.hp>0&&Math.abs(e.x-d.x)<40),15);manualNode=null;};
 G.expedition.take(0);seconds(.6);G.expedition.take(0);seconds(.6);assert(G.expedition.craft('cannon',0));seconds(1.8);G.expedition.take(1);seconds(.6);G.expedition.take(1);seconds(.6);assert(G.expedition.craft('stream',1));seconds(1.8);
 const times=[];
 for(let room=0;room<4;room++){
  const before=G.missionElapsed;wait(()=>G.P.onGround);G.P.invuln=999;
  if(room<3){walk(35.5);wait(()=>G.journeyWave===2&&!G.enemies().length);G.switchElement('water');selected='water';}
  const nodes=G.devices().filter(d=>d.type==='pylon');
  if(room===0){walk(13);jump(21,35);jump(26.5,34);jump(33,30);walk(40);wait(()=>G.P.onGround);jump(44.5,35);shoot(nodes[0]);walk(54);wait(()=>G.P.onGround);jump(58.5,35);jump(65,31);}
  if(room===1){walk(13);jump(20,36);jump(25.5,36);jump(31.5,32);shoot(nodes[0]);jump(40.5,32);jump(46,28);shoot(nodes.find(d=>d.x===46*8));walk(54);wait(()=>G.P.onGround);jump(58.5,36,true);jump(64.5,32);shoot(nodes[1]);}
  if(room===2){assert(G.expedition.state.crafted>=2);
   walk(43);jump(48,35);shoot(nodes[0]);
   while(!G.field.done){if(Math.abs(cx()*8-G.field.x)>45)walk((G.field.x+10)/8);else tick();}
  }
  if(room===3){
   if(stage===0||stage===4){walk(23);shoot(nodes[0]);walk(40);jump(44.5,35);shoot(nodes[1]);walk(54);wait(()=>G.P.onGround);jump(58.5,35);jump(64.5,31);shoot(nodes[2]);}
   if(stage===1){walk(17);seconds(.2);assert(G.field.carry);walk(54);jump(58.5,35);jump(65,31);wait(()=>G.field.delivered);}
   if(stage===2){walk(42);wait(()=>G.field.done,70);}
   if(stage===3){walk(13);wait(()=>!G.enemies().some(e=>e.hp>0&&e.x<240));jump(21,35);jump(26.5,34);jump(33,30);jump(46,35);walk(54);wait(()=>G.P.onGround);jump(58.5,35);jump(65,31);}
   if(stage===5){walk(50);const boss=G.elements.boss;while(boss.hp>0){const k=boss.shield?boss.weak[Math.min(boss.phase,boss.weak.length-1)]:'fire';if(k!==selected){G.switchElement(k);selected=k;}tick();}}
  }
  wait(()=>!G.locked(),10);walk(75);times.push(+(G.missionElapsed-before).toFixed(1));
  if(room<3)wait(()=>G.campaignRoom===room+1);else break;
 }
 return {world,stage,seconds:+G.missionElapsed.toFixed(1),segments:times};
}
for(const stage of [0,1,2,3,4,5]){try{const result=play(0,stage);assert(result.seconds>=80&&result.seconds<=160,'快速路线应处于设计节奏范围内');console.log('PACE '+JSON.stringify(result));}catch(e){console.error(e.message);process.exitCode=1;break;}}
