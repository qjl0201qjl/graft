(function(){'use strict';
const SKILLS={stone:{name:'岩锤',color:'#bac8df',cd:.65,range:70,damage:4},fire:{name:'喷火',color:'#ffad56',cd:.35,range:180,damage:3},water:{name:'水弹',color:'#6de0ff',cd:.45,range:230,damage:2},grass:{name:'藤缚',color:'#a7e680',cd:.9,range:190,damage:2},light:{name:'光脉冲',color:'#fff3a8',cd:1.1,range:220,damage:2},steam:{name:'蒸汽爆',color:'#d5f6ff',cd:1,range:115,damage:3}};
const BOSSES=[{name:'熔火巨像',weak:['water'],color:'#e78247'}, {name:'潮汐领主',weak:['grass'],color:'#6bc8ed'}, {name:'岩甲守卫',weak:['stone'],color:'#b1bad1'}, {name:'荆棘女王',weak:['fire'],color:'#a8d376'}, {name:'蚀光心核',weak:['light','water','grass','stone','fire'],color:'#bc9ee5'}];
function skill(mask){
 const pair=(id,vertical)=>{for(let j=0;j<8;j++)for(let i=0;i<8;i++)if(mask[j*8+i]===id&&((!vertical&&i<7&&mask[j*8+i+1]===id)||(j<7&&mask[(j+1)*8+i]===id)))return true;return false;};
 for(let k=0;k<64;k++)if(mask[k]===4&&((k%8<7&&mask[k+1]===5)||(k%8>0&&mask[k-1]===5)||(k>7&&mask[k-8]===5)||(k<56&&mask[k+8]===5)))return 'steam';
 for(const [id,key]of [[6,'light'],[2,'grass'],[4,'water'],[5,'fire'],[3,'stone']])if(pair(id,key==='stone'||key==='grass'))return key;
 return null;
}
function create(h){let boss=null,shots=[],hazards=[],held=false,cool=0,reveal=0,t=0;
 function reset(index){boss=index>=0?{...BOSSES[index],index,x:470,y:280,w:40,h:40,hp:30,max:30,phase:0,shield:2,open:0,clock:0,root:0,flash:0,engaged:false}:null;shots=[];hazards=[];held=false;cool=0;reveal=0;t=0;sync();}
 function hit(key){if(!boss||boss.hp<=0)return;const weak=boss.weak[Math.min(boss.phase,boss.weak.length-1)];boss.flash=.16;
 if(boss.shield>0){if(key===weak||(key==='steam'&&weak==='water')){boss.shield--;if(!boss.shield){boss.open=5;h.note('护盾击破！趁现在反击');}else h.note('护盾裂开，再命中一次');}else h.note('护盾克制：需要'+SKILLS[weak].name);return;}
 const damage=SKILLS[key].damage;boss.hp=Math.max(0,boss.hp-damage);h.burst(boss.x+20,boss.y+20,SKILLS[key].color,8,85,2);
 if(boss.index===4&&boss.hp>0&&boss.phase<4&&boss.hp<=30-(boss.phase+1)*6){boss.phase++;boss.shield=2;boss.open=0;boss.clock=0;h.note('首领换相：'+SKILLS[boss.weak[boss.phase]].name+'破盾');}
 if(boss.hp===0){h.note('首领击破！出口已开启');h.win();}sync();}
 function cast(){if(!h.play()||cool>0)return false;const key=skill(h.mask());if(!key){cool=.6;h.note('相邻的两颗元素豆才能形成技能，打开豆板选形态');return false;}
 const b=h.bounds(),cfg=SKILLS[key],x=b.x+b.w/2,y=b.y+b.h/2,target=boss&&boss.hp>0?boss:null,dir=target?Math.sign(target.x+20-x)||1:h.face();
 cool=cfg.cd;if(key==='light')reveal=7;
 shots.push({x,y,vx:dir*(key==='stone'?240:260),vy:target?(target.y+20-y)/Math.max(.2,Math.abs(target.x+20-x)/260):0,key,life:cfg.range/260,r:key==='stone'?11:key==='steam'?17:5});h.sound(key);sync();return true;}
 function update(dt){t+=dt;cool=Math.max(0,cool-dt);reveal=Math.max(0,reveal-dt);if(held)cast();
 const b=h.bounds();if(boss&&boss.hp>0){boss.flash=Math.max(0,boss.flash-dt);boss.root=Math.max(0,boss.root-dt);if(b.x+b.w>260)boss.engaged=true;
 if(boss.engaged){boss.clock+=dt;if(boss.root<=0)boss.x=470+Math.sin(t*.7)*38;
 if(boss.open>0){boss.open-=dt;if(boss.open<=0){boss.shield=2;h.note('护盾恢复，重新破盾');}}
 const period=boss.hp<=15?2.7:3.8;if(boss.clock>=period){boss.clock=0;const x=b.x+b.w/2;const base={x:x-21,y:280,w:42,h:40,t:0,wait:boss.index===4?.85:1.05,life:1.7,kind:'pillar',hit:false};
 if(boss.index===1){hazards.push({...base,x:boss.x,y:308,w:20,h:12,wait:.8,life:4,vx:-115});}
 else if(boss.index===2){hazards.push({...base,x:x-32,w:64,wait:1.3,life:1.8});}
 else if(boss.index===3){for(const d of [-48,0,48])hazards.push({...base,x:x+d-12,w:24,wait:1+Math.abs(d)/90,life:2.1});}
 else{hazards.push(base);if(boss.hp<=15)hazards.push({...base,x:x+65,wait:1.25,life:1.9});}
 if(boss.hp<=15)hazards.push({x:boss.x,y:308,w:18,h:12,t:0,wait:.95,life:3,vx:-115,kind:'wave',hit:false});}}
 if(Math.abs(b.x+b.w/2-(boss.x+20))<28&&Math.abs(b.y+b.h/2-300)<32)h.hurt(boss.x,boss.y+20);
 }
 for(const q of shots){q.life-=dt;const ox=q.x,oy=q.y;q.x+=q.vx*dt;q.y+=q.vy*dt;
 let blocked=false;const steps=Math.ceil(Math.max(Math.abs(q.x-ox),Math.abs(q.y-oy))/3);for(let k=1;k<=steps;k++)if(h.solid(ox+(q.x-ox)*k/steps,oy+(q.y-oy)*k/steps)){blocked=true;break;}if(blocked){q.life=0;continue;}
 const hitbox={x:Math.min(ox,q.x)-q.r,y:Math.min(oy,q.y)-q.r,w:Math.abs(q.x-ox)+q.r*2,h:Math.abs(q.y-oy)+q.r*2};
 if(boss&&boss.hp>0&&h.overlap(hitbox,boss)){if(q.key==='grass')boss.root=2.5;hit(q.key);q.life=0;}
 else for(const e of h.enemies())if(h.overlap(hitbox,e)){h.damage(e,SKILLS[q.key].damage,q.x,q.y);if(q.key==='grass')e.vx=0;q.life=0;break;}}
 shots=shots.filter(q=>q.life>0);
 for(const a of hazards){a.t+=dt;if(a.t>a.wait){if(a.vx)a.x+=a.vx*dt;if(!a.hit&&h.overlap(b,a)){h.hurt(a.x+a.w/2,a.y);a.hit=true;}}}hazards=hazards.filter(a=>a.t<a.life);sync();}
 function draw(p){if(boss&&boss.hp>0){if(boss.index===4&&reveal<=0){const b=h.bounds(),g=p.createRadialGradient(b.x+b.w/2,b.y+b.h/2,18,b.x+b.w/2,b.y+b.h/2,120);g.addColorStop(0,'rgba(14,7,35,0)');g.addColorStop(1,'rgba(14,7,35,.78)');p.fillStyle=g;p.fillRect(0,0,640,360);}
 p.fillStyle=boss.flash>0?'#fff7c6':boss.color;for(let j=0;j<5;j++)for(let i=0;i<5;i++){const x=boss.x+i*8,y=boss.y+j*8;p.fillRect(x+1,y+1,7,7);p.fillStyle='#29243e';p.fillRect(x+3,y+3,2,2);p.fillStyle=boss.flash>0?'#fff7c6':boss.color;}
 p.fillStyle='#1c2036';p.fillRect(boss.x+8,boss.y+10,6,5);p.fillRect(boss.x+27,boss.y+10,6,5);p.fillStyle='#fff9d2';p.fillRect(boss.x+9,boss.y+11,3,2);p.fillRect(boss.x+28,boss.y+11,3,2);
 if(boss.shield){p.strokeStyle=SKILLS[boss.weak[Math.min(boss.phase,boss.weak.length-1)]].color;p.lineWidth=2;p.strokeRect(boss.x-5,boss.y-5,50,50);}if(boss.root>0){p.strokeStyle='#a7e680';p.lineWidth=3;p.beginPath();p.moveTo(boss.x-5,320);p.lineTo(boss.x+8,295);p.lineTo(boss.x+26,319);p.lineTo(boss.x+43,295);p.stroke();}}
 for(const a of hazards){p.fillStyle=a.t<a.wait?'rgba(255,179,85,.3)':'rgba(255,92,85,.85)';p.fillRect(a.x,a.y,a.w,a.h);p.strokeStyle='#ffd8a2';p.strokeRect(a.x,a.y,a.w,a.h);}
 for(const q of shots){p.fillStyle=SKILLS[q.key].color;if(q.key==='grass'){p.fillRect(q.x-14,q.y-1,28,3);p.fillRect(q.x-4,q.y-7,3,14);}else if(q.key==='stone'){p.fillRect(q.x-10,q.y-6,17,13);p.fillStyle='#c69e73';p.fillRect(q.x-2,q.y,3,17);}else{p.beginPath();p.arc(q.x,q.y,q.r,0,Math.PI*2);p.fill();}}}
 function sync(){const key=skill(h.mask());h.ui(key?SKILLS[key].name:'拼出技能',cool,boss?{...boss,weakName:SKILLS[boss.weak[Math.min(boss.phase,boss.weak.length-1)]].name}:null);}
 return {reset,update,draw,cast,hold:v=>{held=!!v;},get boss(){return boss;},get cooldown(){return cool;},get reveal(){return reveal;},get shots(){return shots;}};
}
window.GraftElements={create,skill,SKILLS,BOSSES};})();
