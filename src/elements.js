(function(){'use strict';
const SKILLS={stone:{name:'岩击',color:'#bac8df',cd:.65,range:70,damage:4},fire:{name:'焰流',color:'#ffad56',cd:.35,range:180,damage:3},water:{name:'涌泉',color:'#6de0ff',cd:.45,range:230,damage:2},grass:{name:'缠绕',color:'#a7e680',cd:.9,range:190,damage:2},light:{name:'闪光',color:'#fff3a8',cd:1.1,range:220,damage:2},steam:{name:'雾爆',color:'#d5f6ff',cd:1,range:115,damage:3}};
SKILLS.basic={name:'攻击',color:'#ffbccb',cd:.45,range:170,damage:2};
const ELEMENT_NAMES={water:'水',fire:'火',grass:'草',stone:'岩',light:'光',steam:'雾'};
const BOSSES=[{name:'烬冠·第七熔炉',weak:['water'],color:'#e78247'}, {name:'潮眠·深海遗蜕',weak:['grass'],color:'#6bc8ed'}, {name:'磐誓·群山守灵',weak:['stone'],color:'#b1bad1'}, {name:'荆冕·永春囚王',weak:['fire'],color:'#a8d376'}, {name:'无昼·坠星观测者',weak:['light','water','grass','stone','fire'],color:'#bc9ee5'}];
function skill(mask){
 const pair=(id,vertical)=>{for(let j=0;j<8;j++)for(let i=0;i<8;i++)if(mask[j*8+i]===id&&((!vertical&&i<7&&mask[j*8+i+1]===id)||(j<7&&mask[(j+1)*8+i]===id)))return true;return false;};
 for(let k=0;k<64;k++)if(mask[k]===4&&((k%8<7&&mask[k+1]===5)||(k%8>0&&mask[k-1]===5)||(k>7&&mask[k-8]===5)||(k<56&&mask[k+8]===5)))return 'steam';
 for(const [id,key]of [[6,'light'],[2,'grass'],[4,'water'],[5,'fire'],[3,'stone']])if(pair(id,key==='stone'||key==='grass'))return key;
 return null;
}
function planAttack(b,bounds,surfaces,sequence){
 const cx=bounds.x+bounds.w/2,foot=bounds.y+bounds.h;
 const below=(x)=>{const list=surfaces.filter(s=>s.w>=20&&x>=s.x&&x<=s.x+s.w&&s.y>=foot-3).sort((a,b)=>a.y-b.y);return list.length?list[0].y:320;};
 const floor=below(cx),high=floor<300,origin={x:b.x+20,y:b.y+20};const hazards=[];
 const mark=(x,y,w,h,wait,kind)=>({x,y,w,h,t:0,wait,life:wait+.45,hit:false,kind:kind||'eruption',layer:y+h});
 const eruption=(x,delay=1)=>{const f=below(x);hazards.push(mark(x-19,f-52,38,52,delay));};
 const bolt=(targetX,targetY,delay=.85)=>{const dx=targetX-origin.x,dy=targetY-origin.y,d=Math.max(1,Math.hypot(dx,dy));hazards.push({...mark(origin.x-5,origin.y-5,10,10,delay,'bolt'),life:delay+3,vx:dx/d*145,vy:dy/d*145,aimX:targetX,aimY:targetY});};
 let motion=null,title='';
 if(b.index===0){title='落焰 · 记录落点后离开';eruption(cx,.95);if(sequence%2===0||b.hp<=b.max/2)bolt(cx,bounds.y+bounds.h/2,1.15);}
 else if(b.index===1){title='潮线 · 跳起或换层';const dir=Math.sign(cx-origin.x)||-1;hazards.push({...mark(origin.x,floor-13,22,13,.85,'wave'),life:3.8,vx:dir*135,vy:0,aimX:cx,aimY:floor-7});if(high||sequence%2===0)bolt(cx,bounds.y+bounds.h/2,1.15);}
 else if(b.index===2){title='跃击 · 离开标记平台';const platforms=surfaces.filter(s=>s.w>=40&&s.y>=foot-3).sort((a,c)=>Math.abs(a.y-foot)+Math.abs(a.x+a.w/2-cx)*.2-(Math.abs(c.y-foot)+Math.abs(c.x+c.w/2-cx)*.2));const landing=platforms[0]||{x:0,y:320,w:640};const lx=Math.max(landing.x+20,Math.min(landing.x+landing.w-20,cx));motion={fromX:b.x,fromY:b.y,toX:lx-20,toY:landing.y-40,t:0,wind:.45,travel:.8,minX:landing.x,maxX:landing.x+landing.w-40};hazards.push(mark(lx-32,landing.y-38,64,38,1.25,'slam'));}
 else if(b.index===3){title='棘刺 · 看清分层落点';eruption(cx,1);for(const dx of [-48,48])eruption(Math.max(12,Math.min(628,cx+dx)),1.3);if(sequence%2===0)bolt(cx,bounds.y+bounds.h/2,1.1);}
 else{title='交叉封锁 · 移动到空白区';hazards.push(mark(cx-13,Math.max(8,floor-110),26,110,1.05,'column'));hazards.push(mark(Math.max(8,cx-92),bounds.y+bounds.h/2-6,184,12,1.35,'beam'));bolt(cx,bounds.y+bounds.h/2,.9);}
 if(b.hp<=b.max/2&&b.index!==4){const other=surfaces.filter(s=>s.w>=40&&Math.abs(s.y-floor)>20).sort((a,c)=>Math.abs(a.x+a.w/2-cx)-Math.abs(c.x+c.w/2-cx))[0];if(other)hazards.push(mark(other.x+other.w/2-16,other.y-44,32,44,1.45));}
 return {hazards,motion,title,layer:floor};
}
function create(h){let boss=null,shots=[],hazards=[],held=false,cool=0,reveal=0,t=0,boostT=0,castCount=0;
 function reset(index){boss=index>=0?{...BOSSES[index],index,x:470,y:280,w:40,h:40,hp:54,max:54,phase:0,shield:2,open:0,clock:0,root:0,flash:0,engaged:false,anchorX:470,anchorY:280,motion:null,sequence:0,pose:0,transition:0,action:'',anchorMin:320,anchorMax:560}:null;shots=[];hazards=[];held=false;cool=0;reveal=0;t=0;boostT=0;castCount=0;sync();}
 function hit(key,bonus=0){if(!boss||boss.hp<=0||boss.transition>0)return;const weak=boss.weak[Math.min(boss.phase,boss.weak.length-1)];boss.flash=.16;
 if(boss.shield>0){if(key===weak||(key==='steam'&&weak==='water')){boss.shield--;if(!boss.shield){boss.open=5;h.note('护盾击破！趁现在反击');}else h.note('护盾裂开，再命中一次');}else h.note('护盾克制：需要'+ELEMENT_NAMES[weak]);return;}
 const damage=SKILLS[key].damage+bonus;boss.hp=Math.max(0,boss.hp-damage);h.burst(boss.x+20,boss.y+20,SKILLS[key].color,8,85,2);
 const phases=boss.index===4?5:3;if(boss.hp>0&&boss.phase<phases-1&&boss.hp<=boss.max-(boss.phase+1)*boss.max/phases){boss.phase++;boss.shield=2;boss.open=0;boss.transition=.85;boss.clock=3;boss.pose=1.25;h.note(boss.index===4?'首领换相：'+ELEMENT_NAMES[boss.weak[boss.phase]]+'破盾':'首领重整护盾，留意接下来的攻势');}
 if(boss.hp===0){hazards=[];h.note('首领击破！出口已开启');h.win();}sync();}
 function cast(){if(!h.play()||cool>0)return false;const key=(h.selected&&h.selected())||skill(h.mask())||'basic';
 const b=h.bounds(),cfg=SKILLS[key],x=b.x+b.w/2,y=b.y+b.h/2,targets=h.enemies().filter(e=>e.hp>0).concat(h.objectives?h.objectives():[]),target=boss&&boss.hp>0&&(!h.ready||h.ready())?boss:targets.sort((a,b)=>Math.hypot(a.x+a.w/2-x,a.y+a.h/2-y)-Math.hypot(b.x+b.w/2-x,b.y+b.h/2-y))[0],dir=target?Math.sign(target.x+target.w/2-x)||1:h.face();
 const stats=h.stats?h.stats():{};castCount++;
 cool=cfg.cd*(boostT>0?.65:1)*(stats.rate||1);if(key==='light')reveal=7;
 const dx=target?target.x+target.w/2-x:dir,dy=target?target.y+target.h/2-y:0,length=Math.max(.001,Math.hypot(dx,dy)),speed=key==='stone'?240:260;
 shots.push({x,y,vx:dx/length*speed,vy:dy/length*speed,key,life:(cfg.range+(stats.range||0))/speed,bonus:stats.damage||0,pierce:stats.pierce||0,hitEnemies:new Set(),blast:stats.steam&&castCount%4===0?24+stats.steam*8:0,r:key==='stone'?11:key==='steam'?17:5});h.sound(key);sync();return true;}
 function update(dt){t+=dt;boostT=Math.max(0,boostT-dt);for(const e of h.enemies())if(e.role==='ranged'&&e.hp>0){e.shootT-=dt;if(e.shootT<=0){e.shootT=3.1;const b=h.bounds();hazards.push({x:b.x+b.w/2-12,y:b.y+b.h-30,w:24,h:30,t:0,wait:.9,life:1.35,hit:false});}}cool=Math.max(0,cool-dt);reveal=Math.max(0,reveal-dt);if(held)cast();
 const b=h.bounds();if(boss&&boss.hp>0&&(!h.ready||h.ready())){boss.flash=Math.max(0,boss.flash-dt);boss.transition=Math.max(0,boss.transition-dt);boss.root=Math.max(0,boss.root-dt);if(b.x+b.w>260)boss.engaged=true;
 if(boss.engaged){boss.clock+=dt;boss.pose=Math.max(0,boss.pose-dt);if(boss.motion){const m=boss.motion;m.t+=dt;const f=Math.max(0,Math.min(1,(m.t-m.wind)/m.travel));boss.x=m.fromX+(m.toX-m.fromX)*f;boss.y=m.fromY+(m.toY-m.fromY)*f-Math.sin(f*Math.PI)*58;if(f>=1){boss.anchorX=m.toX;boss.anchorY=m.toY;boss.anchorMin=m.minX;boss.anchorMax=m.maxX;boss.motion=null;}}else if(boss.root<=0){boss.x=Math.max(boss.anchorMin,Math.min(boss.anchorMax,boss.anchorX+Math.sin(t*.7)*18));if(boss.index===1||boss.index===4)boss.y=boss.anchorY+Math.sin(t*1.5)*5;}
 if(boss.open>0){boss.open-=dt;if(boss.open<=0){boss.shield=2;h.note('护盾恢复，重新破盾');}}
 const period=boss.hp<=boss.max/2?2.7:3.8;if(boss.clock>=period&&!boss.motion){boss.clock=0;boss.sequence++;const attack=planAttack(boss,b,h.surfaces?h.surfaces():[{x:0,y:320,w:640}],boss.sequence);hazards.push(...attack.hazards);boss.motion=attack.motion;boss.pose=1.25;boss.action=attack.title;h.note(attack.title);}}
 if(!boss.motion&&Math.abs(b.x+b.w/2-(boss.x+20))<28&&Math.abs(b.y+b.h/2-(boss.y+20))<32)h.hurt(boss.x,boss.y+20);
 }
 for(const q of shots){q.life-=dt;const ox=q.x,oy=q.y;q.x+=q.vx*dt;q.y+=q.vy*dt;
 let blocked=false;const steps=Math.ceil(Math.max(Math.abs(q.x-ox),Math.abs(q.y-oy))/3);for(let k=1;k<=steps;k++)if(h.solid(ox+(q.x-ox)*k/steps,oy+(q.y-oy)*k/steps)){blocked=true;break;}if(blocked){q.life=0;continue;}
 const hitbox={x:Math.min(ox,q.x)-q.r,y:Math.min(oy,q.y)-q.r,w:Math.abs(q.x-ox)+q.r*2,h:Math.abs(q.y-oy)+q.r*2};
 const objective=h.objectives&&h.objectives().find(o=>h.overlap(hitbox,o));if(objective){h.objectiveHit(objective,q.key);q.life=0;continue;}
 if(boss&&boss.hp>0&&(!h.ready||h.ready())&&h.overlap(hitbox,boss)){if(q.key==='grass')boss.root=2.5;hit(q.key,q.bonus+(q.blast?2+Math.floor(q.blast/16):0));if(q.blast)h.burst(q.x,q.y,SKILLS.steam.color,18,q.blast*4,3);q.life=0;}
 else for(const e of h.enemies())if(e.hp>0&&!q.hitEnemies.has(e)&&h.overlap(hitbox,e)){
  const counters={fire:'water',water:'grass',stone:'stone',grass:'fire',dark:'light'},strong=e.affinity&&counters[e.affinity];
  const amount=(strong?(q.key===strong?SKILLS[q.key].damage*2:Math.max(1,Math.floor(SKILLS[q.key].damage*.6))):SKILLS[q.key].damage)+q.bonus+(q.blast?2+Math.floor(q.blast/16):0);
  h.damage(e,amount,q.x,q.y);q.hitEnemies.add(e);
  if(q.blast){h.burst(q.x,q.y,SKILLS.steam.color,18,q.blast*4,3);for(const other of h.enemies())if(other!==e&&other.hp>0&&Math.hypot(other.x+other.w/2-q.x,other.y+other.h/2-q.y)<=q.blast&&!h.solid((other.x+q.x)/2,(other.y+q.y)/2)){h.damage(other,2+Math.floor(q.blast/16),q.x,q.y);q.hitEnemies.add(other);}q.pierce=0;}
  if(q.key==='grass')e.vx=0;if(q.pierce>0)q.pierce--;else q.life=0;break;
 }}
 shots=shots.filter(q=>q.life>0);
 for(const a of hazards){a.t+=dt;if(a.t>a.wait){const ox=a.x,oy=a.y;if(a.vx)a.x+=a.vx*dt;if(a.vy)a.y+=a.vy*dt;const swept={x:Math.min(ox,a.x),y:Math.min(oy,a.y),w:a.w+Math.abs(a.x-ox),h:a.h+Math.abs(a.y-oy)};if(a.kind==='bolt'){let blocked=false;const count=Math.ceil(Math.max(Math.abs(a.x-ox),Math.abs(a.y-oy))/3);for(let k=1;k<=count;k++)if(h.solid(ox+(a.x-ox)*k/count+a.w/2,oy+(a.y-oy)*k/count+a.h/2)){blocked=true;break;}if(blocked){a.t=a.life;continue;}}if(!a.hit&&h.overlap(b,swept)){h.hurt(a.x+a.w/2,a.y);a.hit=true;}}}hazards=hazards.filter(a=>a.t<a.life);sync();}
 function draw(p){if(boss&&boss.hp>0&&(h.visible?h.visible():(!h.ready||h.ready()))){if(boss.index===4&&reveal<=0&&!(h.stats&&h.stats().lamp)){const b=h.bounds(),g=p.createRadialGradient(b.x+b.w/2,b.y+b.h/2,18,b.x+b.w/2,b.y+b.h/2,120);g.addColorStop(0,'rgba(14,7,35,0)');g.addColorStop(1,'rgba(14,7,35,.78)');p.fillStyle=g;p.fillRect(0,0,640,360);}
 window.GraftBossArt.draw(p,boss,t,SKILLS[boss.weak[Math.min(boss.phase,boss.weak.length-1)]].color);}

 for(const a of hazards){const warning=a.t<a.wait;p.save();p.fillStyle=warning?'rgba(255,193,92,.2)':'rgba(255,104,91,.8)';p.strokeStyle=warning?'#ffe4a3':'#fff0dc';p.lineWidth=1;
 if(warning&&a.aimX!==undefined){p.setLineDash([4,3]);p.beginPath();p.moveTo(a.x+a.w/2,a.y+a.h/2);p.lineTo(a.aimX,a.aimY);p.stroke();p.setLineDash([]);}
 p.fillRect(a.x,a.y,a.w,a.h);p.strokeRect(a.x,a.y,a.w,a.h);if(warning&&!a.vx){for(let k=0;k<a.w;k+=8){p.beginPath();p.moveTo(a.x+k,a.y+a.h);p.lineTo(a.x+Math.min(a.w,k+8),a.y+a.h-8);p.stroke();}}p.restore();}

 for(const q of shots){if(q.blast){p.strokeStyle='#d5f6ff';p.lineWidth=2;p.beginPath();p.arc(q.x,q.y,9,0,Math.PI*2);p.stroke();}p.fillStyle=SKILLS[q.key].color;if(q.key==='grass'){p.fillRect(q.x-14,q.y-1,28,3);p.fillRect(q.x-4,q.y-7,3,14);}else if(q.key==='stone'){p.fillRect(q.x-10,q.y-6,17,13);p.fillStyle='#c69e73';p.fillRect(q.x-2,q.y,3,17);}else{p.beginPath();p.arc(q.x,q.y,q.r,0,Math.PI*2);p.fill();}}}
 function sync(){const key=(h.selected&&h.selected())||skill(h.mask())||'basic';h.ui(SKILLS[key].name,cool,boss?{...boss,weakName:ELEMENT_NAMES[boss.weak[Math.min(boss.phase,boss.weak.length-1)]]}:null);}
 return {reset,update,draw,cast,telegraph:(area,delay=.95)=>hazards.push({...area,t:0,wait:delay,life:delay+.45,hit:false,kind:'signal'}),boost:seconds=>{boostT=Math.max(boostT,seconds);},get boosted(){return boostT;},hold:v=>{held=!!v;},get boss(){return boss;},get cooldown(){return cool;},get reveal(){return reveal;},get shots(){return shots;},get hazards(){return hazards;}};
}
window.GraftElements={create,skill,SKILLS,BOSSES,planAttack};})();
