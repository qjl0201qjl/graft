(function(){
'use strict';
const COLORS={fire:'#f5a06e',water:'#79cde9',stone:'#bac5dc',grass:'#a6cf88',light:'#fff0b3'};
const LABELS={fire:'火',water:'水',stone:'岩',grass:'草',light:'光'};
const RECIPES=[
 {id:'cannon',name:'烬雀·双生焰铳',parts:['fire','fire'],tip:'每级攻击 +1，射速提高',shape:'cannon'},
 {id:'stream',name:'沧弦·贯潮长铳',parts:['water','water'],tip:'射程增加，穿过小怪继续命中',shape:'stream'},
 {id:'guard',name:'山誓·玄岩壁垒',parts:['stone','stone'],tip:'每级每区抵挡一次伤害',shape:'guard'},
 {id:'hook',name:'森语·回枝钩索',parts:['grass','stone'],tip:'空中再点一次跳，可二段跳',shape:'hook'},
 {id:'steam',name:'雾鲸·高压蒸汽炮',parts:['fire','water'],tip:'每四发打出爆炸弹，每级扩大爆炸',shape:'steam'},
 {id:'lamp',name:'昼羽·棱光翼阵',parts:['light','light'],tip:'持续驱散暗影，射程再增加',shape:'lamp'},
];
const ROOMS=['启程','穿越','交锋','终点'];
function copy(v){return JSON.parse(JSON.stringify(v));}
function valid(value){
 if(!value||!Number.isInteger(value.chapter)||value.chapter<0||value.chapter>4||!Number.isInteger(value.room)||value.room<0||value.room>3)return false;
 if(!Array.isArray(value.columns)||value.columns.length!==4||!Array.isArray(value.tray)||value.tray.length>4||!Array.isArray(value.gear)||value.gear.length!==3)return false;
 const tile=t=>t&&typeof t.id==='string'&&!!COLORS[t.key]&&Number.isInteger(t.col)&&t.col>=0&&t.col<4;
 if(!value.columns.every((col,i)=>Array.isArray(col)&&col.length<=64&&col.every(t=>tile(t)&&t.col===i))||!value.tray.every(tile))return false;
 const all=value.columns.flat().concat(value.tray);if(new Set(all.map(t=>t.id)).size!==all.length)return false;
 if(value.stage!==undefined&&(!Number.isInteger(value.stage)||value.stage<0||value.stage>5))return false;
 if(value.claimed!==undefined&&(!Array.isArray(value.claimed)||value.claimed.length>200||value.claimed.some(id=>typeof id!=='string')||new Set(value.claimed).size!==value.claimed.length))return false;
 const gears=value.gear.filter(Boolean);if(!gears.every(g=>RECIPES.some(r=>r.id===g.id)&&Number.isInteger(g.level)&&g.level>=1&&g.level<=3)||new Set(gears.map(g=>g.id)).size!==gears.length)return false;
 return ['crafted','spent','shield'].every(k=>Number.isInteger(value[k])&&value[k]>=0&&value[k]<=1000)&&value.shield<=(gears.find(g=>g.id==='guard')?.level||0);
}
function create(){
 let s;
 function enter(room){
  s.room=room;s.tray=[];s.claimed=[];
  // Every room offers a known, finite stock. No random unwinnable pile.
  const sets=[['fire','water','grass','stone'],['stone','water','fire','grass'],['water','fire','stone','grass'],['fire','stone','water','light']];
  s.columns=sets[room].map((k,i)=>[k,sets[(room+1)%4][i],k,k].map((key,j)=>({key,col:i,id:room+'-'+i+'-'+j})));
  s.shield=stats().armor;
 }
 function reset(chapter,stage=0){s={chapter,stage,room:0,columns:[],tray:[],gear:[null,null,null],crafted:0,spent:0,shield:0};enter(0);}
 function stats(){
  const levels={};for(const g of s.gear)if(g)levels[g.id]=(levels[g.id]||0)+g.level;
  return {damage:levels.cannon||0,rate:Math.pow(.9,levels.cannon||0),pierce:levels.stream||0,range:(levels.stream||0)*40+(levels.lamp?40:0),armor:levels.guard||0,airJump:!!levels.hook,steam:levels.steam||0,lamp:!!levels.lamp};
 }
 function take(col){if(!Number.isInteger(col)||!s.columns[col]?.length||s.tray.length>=4)return false;s.tray.push(s.columns[col].pop());return true;}
 function putBack(index){if(!Number.isInteger(index)||index<0||index>=s.tray.length)return false;const [tile]=s.tray.splice(index,1);s.columns[tile.col].push(tile);return true;}
 function canCraft(id){const r=RECIPES.find(r=>r.id===id);if(!r||id==='lamp'&&s.chapter<4)return false;const keys=s.tray.map(t=>t.key);return r.parts.every(k=>{const i=keys.indexOf(k);if(i<0)return false;keys.splice(i,1);return true;});}
 function craft(id,slot){
  if(!canCraft(id)||!Number.isInteger(slot)||slot<0||slot>2)return false;
  const same=s.gear.findIndex(g=>g&&g.id===id);if(same>=0)slot=same;
  if(same>=0&&s.gear[slot].level>=3)return false;
  const armor=stats().armor,r=RECIPES.find(r=>r.id===id);
  for(const key of r.parts)s.tray.splice(s.tray.findIndex(t=>t.key===key),1);
  s.gear[slot]={id,level:same>=0?s.gear[slot].level+1:1};s.crafted++;s.spent+=2;
  s.shield=Math.max(0,s.shield+stats().armor-armor);return true;
 }
 function salvage(key,id){
  if(!COLORS[key]||typeof id!=='string'||s.claimed.includes(id))return false;
  const col=s.columns.reduce((best,a,i)=>a.length<s.columns[best].length?i:best,0);
  if(s.columns[col].length>=64)return false;
  s.columns[col].push({key,col,id:'loot:'+id});s.claimed.push(id);return true;
 }
 function block(){if(s.shield<=0)return false;s.shield--;return true;}
 reset(0);
 return {reset,enter,take,putBack,craft,canCraft,salvage,block,stats,snapshot:()=>copy(s),restore:value=>{if(!valid(value))return false;s=copy(value);s.claimed=s.claimed||[];return true;},get state(){return s;}};
}
function roomMap(chapter,room,stage=0){
 const pairs=[['water','fire'],['grass','water'],['stone','fire'],['fire','grass'],['light','water']][chapter];
 const solid=(x,y,w,h=1,t='stone')=>({x,y,w,h,t});
 const rects=[solid(0,40,80,4)];
 const devices=[{type:'cache',x:12,y:40,w:3,h:1},{type:'checkpoint',x:10,y:40}];
 const node=(x,y,mat,label)=>({type:'pylon',x,y,w:2,h:1,mat,label,hits:0});
 let seeds;
 if(room===0){rects.push(solid(18,35,7),solid(30,30,8),solid(43,35,6),solid(62,31,7));devices.push(node(45,35,pairs[0],'高台开关'),{type:'camp',x:32,y:30,w:3,h:1});seeds=[[21,32],[33,27],[65,28]];}
 if(room===1){rects.push(solid(17,36,6),solid(29,32,7),solid(44,28,6),solid(62,32,8));devices.push(node(31,32,pairs[0],'桥头开关'),node(64,32,pairs[1],'对岸开关'),{type:'lift',x:37,y:37,w:5,h:1,toX:54,toY:29,period:5},{type:'gate',x:72,y:29,w:2,h:11,id:'route'});seeds=[[20,33],[46,25],[67,29]];}
 if(room===2){rects.push(solid(19,35,7),solid(32,31,6),solid(46,35,7),solid(61,30,8));devices.push(node(48,35,pairs[1],'前哨开关'),{type:'jet',x:38,y:40,w:3,h:5,period:4.2,phase:chapter*.3},{type:'camp',x:63,y:30,w:3,h:1});seeds=[[22,32],[34,28],[64,27]];}
 if(room===3){rects.push(solid(18,35,7),solid(30,30,8),solid(43,35,6),solid(62,31,7));devices.push({type:'checkpoint',x:42,y:40});seeds=[[21,32],[33,27],[65,28]];}
 if(chapter===0&&room===0)rects.push(solid(38,39,4,1,'lava'));
 if(chapter===2&&room===2)rects.push(solid(27,35,4,1,'crumble'));
 if(chapter===3&&room===1)devices.push({type:'spring',x:54,y:40,w:4,h:1,power:490});
 if(chapter===4&&room===2)rects.push(solid(55,39,4,1,'lava'));
 for(const r of rects.slice())if(r.y<=34&&r.t!=='lava')rects.push(solid(r.x-4,r.y+4,3));
 return window.GraftCampaign.decorate({rects,devices,seeds,start:[8,37],exit:[75,37,3,3]},chapter,stage,room);
}
// Draw attached modules both on the workbench silhouette and the actual player.
function drawGear(p,b,gear,scale=1){
 const cx=b.x+b.w/2,cy=b.y+b.h/2;
 p.save();p.lineWidth=1;
 gear.forEach((g,i)=>{if(!g)return;const r=RECIPES.find(r=>r.id===g.id),color=COLORS[r.parts[0]],side=i===0?-1:1,x=cx+side*(b.w/2+2),y=cy+(i===2?-b.h/2:2);
  p.fillStyle='#172a3b';p.strokeStyle=color;
  if(g.id==='guard'){p.fillRect(x-5,y-6,8,13);p.strokeRect(x-5,y-6,8,13);}
  else if(g.id==='hook'||g.id==='lamp'){p.beginPath();p.moveTo(x,y+6);p.lineTo(x+side*7,y-7);p.lineTo(cx,y-3);p.stroke();}
  else{p.fillRect(x-4,y-3,11,6);p.fillStyle=color;p.fillRect(x+3,y-3,5,2);if(g.id==='cannon')p.fillRect(x+3,y+1,5,2);}
  p.fillStyle=color;for(let j=0;j<g.level;j++){p.beginPath();p.arc(x-2+j*3,y,1,0,Math.PI*2);p.fill();}
 });p.restore();
}
function mount(kit,h){
 const $=id=>document.getElementById(id);let active=false,slot=0,focus;
 const button=(text,fn)=>{const b=document.createElement('button');b.type='button';b.textContent=text;b.addEventListener('click',fn);return b;};
 function message(text){$('forgeMessage').textContent=text;}
 function change(){render();h.change();}
 function render(){
  const s=kit.state;$('forgeRegion').textContent='区域 '+(s.room+1)+'/4 · '+window.GraftCampaign.region(s.chapter,s.room)+' · 已拾取 '+s.claimed.length+' 颗';
  const pool=$('forgePool');pool.textContent='';
  s.columns.forEach((col,i)=>{const lane=document.createElement('div');lane.className='bead-lane';const top=col[col.length-1];
   const b=button(top?LABELS[top.key]:'空',()=>{if(kit.take(i)){message('已取出'+LABELS[top.key]+'豆。选配方拼装，或点暂存豆归还。');change();}else message('四格已满：先拼装，或点暂存豆归还。');});b.className='loose-bead';b.style.setProperty('--bead',top?COLORS[top.key]:'#40576d');b.disabled=!top;b.setAttribute('aria-label',top?'取'+LABELS[top.key]+'豆，堆叠剩余'+col.length+'颗':'这一堆已取空');
   const next=document.createElement('small');next.textContent=col.length>1?'下面：'+col.slice(0,-1).reverse().map(t=>LABELS[t.key]).join(' / '):'下面没有了';lane.append(b,next);pool.appendChild(lane);
  });
  const tray=$('forgeTray');tray.textContent='';for(let i=0;i<4;i++){const t=s.tray[i];const b=button(t?LABELS[t.key]:'＋',()=>{if(kit.putBack(i)){message('已归还，不扣材料。');change();}});b.disabled=!t;b.className='tray-bead';b.style.setProperty('--bead',t?COLORS[t.key]:'#40576d');b.setAttribute('aria-label',t?'归还暂存的'+LABELS[t.key]+'豆':'空暂存格');tray.appendChild(b);}
  const slots=$('forgeSlots');slots.textContent='';s.gear.forEach((g,i)=>{const r=g&&RECIPES.find(r=>r.id===g.id);const b=button((i+1)+' · '+(g?r.name+' Lv.'+g.level:'空挂点'),()=>{slot=i;message('新组件将装在挂点 '+(slot+1)+'。同款自动升级，最高三级。');render();});b.classList.toggle('selected',i===slot);b.setAttribute('aria-pressed',String(i===slot));slots.appendChild(b);});
  const recipes=$('forgeRecipes');recipes.textContent='';RECIPES.filter(r=>r.id!=='lamp'||s.chapter>=4).forEach(r=>{const same=s.gear.find(g=>g&&g.id===r.id),max=same&&same.level>=3;const b=button('',()=>{if(kit.craft(r.id,slot)){const g=kit.state.gear.find(g=>g&&g.id===r.id);message(r.name+' Lv.'+g.level+' 已装上！'+r.tip+'。');const empty=kit.state.gear.findIndex(g=>!g);if(empty>=0)slot=empty;change();h.sound();}});const name=document.createElement('strong'),parts=document.createElement('span'),tip=document.createElement('small');name.textContent=r.name+(same?' · 升级':'');parts.textContent=r.parts.map(k=>LABELS[k]).join(' ＋ ');tip.textContent=max?'已满级':r.tip;b.append(name,parts,tip);b.disabled=max||!kit.canCraft(r.id);recipes.appendChild(b);});
  const c=$('forgeHero'),p=c.getContext('2d');p.clearRect(0,0,c.width,c.height);window.GraftPresentation.hero(c,'water',h.style());p.save();p.translate(0,0);drawGear(p,{x:92,y:20,w:55,h:110},s.gear,1);p.restore();
  $('forgeCount').textContent=s.tray.length+'/4 · 点暂存豆可归还';$('forgeEquipped').textContent=s.gear.filter(Boolean).length+'/3 挂点 · 相同组件可升到三级';
 }
 function open(){if(active||!h.allowed())return false;focus=document.activeElement;active=true;h.open();$('forge').classList.remove('hide');render();message(kit.state.crafted?'选两颗豆，继续升级或换一件组件。':'先点两颗火豆，再点“烬雀·双生焰铳”。装好的组件会留在角色身上。');$('forgeClose').focus();return true;}
 function close(){if(!active)return;active=false;$('forge').classList.add('hide');h.close();if(focus&&focus.focus)focus.focus();}
 $('forgeClose').addEventListener('click',close);
 $('forge').addEventListener('keydown',e=>{e.stopPropagation();if(e.key==='Escape')close();if(e.key==='Tab'){const a=Array.from($('forge').querySelectorAll('button:not(:disabled)')).filter(b=>b.getClientRects().length);if(e.shiftKey&&document.activeElement===a[0]){e.preventDefault();a[a.length-1].focus();}else if(!e.shiftKey&&document.activeElement===a[a.length-1]){e.preventDefault();a[0].focus();}}});
 return {open,close,render,get active(){return active;}};
}
window.GraftExpedition={create,valid,mount,roomMap,drawGear,RECIPES,ROOMS,COLORS};
})();
