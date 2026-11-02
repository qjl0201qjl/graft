(function(){
'use strict';
const WORLDS=[
 {
  "name": "烬潮群岛·熔芯流亡地",
  "shortName": "烬潮群岛",
  "subtitle": "海潮带走了航路，熔炉留下了余火。",
  "regions": [
   "退潮残滩",
   "焚风吊桥",
   "赤壁遗垒",
   "无眠灯塔"
  ],
  "boss": "烬冠·第七熔炉",
  "stages": [
   "退潮之后的余火",
   "熔砂尽头的残帆",
   "失明灯塔的借火者",
   "断桥彼岸的旧约",
   "逆行于赤色海风",
   "第七熔炉的心脏"
  ]
 },
 {
  "name": "沉钟之都·无岸潮汐城",
  "shortName": "沉钟之都",
  "subtitle": "钟声沉入水底，归航的灯仍未熄灭。",
  "regions": [
   "听雨旧埠",
   "浮灯水巷",
   "沉钟泵房",
   "无岸潮门"
  ],
  "boss": "潮眠·深海遗蜕",
  "stages": [
   "沉钟响起之前",
   "漂流舟留下的航迹",
   "暗渠里不灭的微光",
   "潮门深处的三枚碎钥",
   "守望被淹没的长街",
   "沉城龙骸的苏醒之夜"
  ]
 },
 {
  "name": "缄声地脉·群山遗骨",
  "shortName": "缄声地脉",
  "subtitle": "群山不再言语，晶簇还记得旧日的回声。",
  "regions": [
   "遗灯矿廊",
   "垂星深井",
   "缄声晶窟",
   "群山脉心"
  ],
  "boss": "磐誓·群山守灵",
  "stages": [
   "矿灯照不见的归途",
   "穿过碎岩的旧回廊",
   "深井之下仍有灯火",
   "寻回群山遗落的晶簇",
   "断层尽头的三重誓锁",
   "聆听群山心脏的回声"
  ]
 },
 {
  "name": "永昼花庭·失控的春日",
  "shortName": "永昼花庭",
  "subtitle": "春天停在了这里，藤蔓却忘记如何归还道路。",
  "regions": [
   "眠苔旧径",
   "雾叶悬桥",
   "残春温室",
   "荆冕王庭"
  ],
  "boss": "荆冕·永春囚王",
  "stages": [
   "踏过无人记得的苔径",
   "雾叶之下的归巢路",
   "为残破温室留住春天",
   "藤冠之上失散的种子",
   "林间最后一场守望",
   "永春囚王的荆棘王座"
  ]
 },
 {
  "name": "无昼星环·坠落的天穹",
  "shortName": "无昼星环",
  "subtitle": "天穹散成碎片，最后的星灯仍在指向归途。",
  "regions": [
   "陨星残垣",
   "断轨长桥",
   "静默穹廊",
   "无昼星门"
  ],
  "boss": "无昼·坠星观测者",
  "stages": [
   "从落星的裂隙进入",
   "沿着断轨送回微光",
   "守住静默穹廊的星灯",
   "寻回遗城散落的星图",
   "暮色之中的三道星锁",
   "让无昼之眼再次闭合"
  ]
 }
];
const ENCOUNTER_SECONDS=46;
const TASKS=[
 {kind:'breach',label:'破阵',tip:'拆掉三处供能器，从上下路线打通出口。'},
 {kind:'carry',label:'运送',tip:'拾起能源核，带到高台接收器；留意沿途追兵。'},
 {kind:'defend',label:'守灯',tip:'守住灯台，避开预警并击退四次袭击。'},
 {kind:'seek',label:'寻回',tip:'沿三条高台支路，寻回三枚能源片。'},
 {kind:'relay',label:'接力',tip:'按一、二、三的顺序切换元素，打通供能回路。'},
 {kind:'boss',label:'首领',tip:'完成前线任务后挑战世界首领；观察跨层攻击预警。'},
];
function mission(world,stage){return {id:world*6+stage,world,stage,name:WORLDS[world].stages[stage],...TASKS[stage],target:120,range:[90,150]};}
function region(world,room){return WORLDS[world].regions[room];}
function clock(seconds){const n=Math.max(0,Math.floor(seconds));return String(Math.floor(n/60)).padStart(2,'0')+':'+String(n%60).padStart(2,'0');}
function progress(saved,legacyWorld=0){
 const cleared={};for(const [id,r] of Object.entries(saved&&saved.cleared||{}))if(/^\d+$/.test(id)&&+id<30&&r&&Number.isFinite(r.best)&&r.best>=0)cleared[id]={best:r.best,stars:Math.max(1,Math.min(3,r.stars|0)),clears:Math.max(1,r.clears|0)};
 const unlocked=Number.isInteger(saved&&saved.unlocked)?saved.unlocked:Math.max(0,Math.min(4,legacyWorld|0))*6;
 return {unlocked:Math.max(0,Math.min(29,unlocked)),cleared};
}
function finish(saved,id,seconds,deaths,found){
 const s=progress(saved),old=s.cleared[id],stars=1+(deaths===0?1:0)+(found>=6?1:0);
 s.cleared[id]={best:old?Math.min(old.best,seconds):seconds,stars:Math.max(old?old.stars:0,stars),clears:(old?old.clears:0)+1};
 s.unlocked=Math.max(s.unlocked,Math.min(29,id+1));return s;
}
// These are active encounters: progress depends on staying with the objective,
// fighting the ambushes, or completing a moving route. There is no minimum exit timer.
function encounter(mode,duration=ENCOUNTER_SECONDS){return {mode,duration,t:0,progress:0,bursts:0,nextMark:4,started:false,done:false,x:328,y:320};}
function encounterStep(s,dt,player,guards){
 if(s.done)return false;if(!s.started){if(player.x+player.w<300)return false;s.started=true;}
 s.t+=dt;let spawn=false;
 if(s.bursts<4&&s.t>=s.bursts*s.duration/4){s.bursts++;spawn=true;}
 const near=Math.abs(player.x+player.w/2-s.x)<88&&Math.abs(player.y+player.h-s.y)<100;
 const contested=guards.some(e=>e.hp>0&&Math.abs(e.x+e.w/2-s.x)<30);
 if(near&&!contested){s.progress=Math.min(s.duration,s.progress+dt);if(s.mode==='escort')s.x=328+s.progress/s.duration*192;}
 s.done=s.progress>=s.duration&&s.bursts===4&&!guards.some(e=>e.hp>0);
 return spawn;
}
function decorate(map,world,stage,room){
 const pairs=[['water','fire'],['grass','water'],['stone','fire'],['fire','grass'],['light','water']][world];
 const node=(x,y,mat,label,order)=>({type:'pylon',x,y,w:2,h:1,mat,label,hits:0,requiredHits:3,order});
 if(room===0)for(const [i,x,y]of [[0,21,35],[1,33,30],[2,65,31]])map.devices.push({type:'salvage',x,y,w:2,h:1,cacheId:i,mat:pairs[i%2]});
 if(room===1)map.devices.push(node(46,28,pairs[0],'上层桥机'));
 if(room===3&&stage!==5){
  map.devices=map.devices.filter(d=>d.type!=='checkpoint'||d.x<20);
  if(stage===0||stage===4)map.devices.push(node(26,40,pairs[0],stage===4?'① 供能器':'岸侧供能器',stage===4?0:undefined),node(45,35,pairs[1],stage===4?'② 供能器':'高台供能器',stage===4?1:undefined),node(65,31,pairs[0],stage===4?'③ 供能器':'远端供能器',stage===4?2:undefined));
  if(stage===1)map.devices.push({type:'cargo',x:17,y:40,w:2,h:1},{type:'receiver',x:65,y:31,w:3,h:1});
  if(stage===2)map.devices.push({type:'beacon',x:49,y:40,w:3,h:1});
  if(stage===3)for(const [x,y]of [[21,35],[46,35],[65,31]])map.devices.push({type:'shard',x,y,w:1,h:1});
 }
 if(stage===1&&room===0)map.devices.push({type:'lift',x:51,y:39,w:4,h:1,toX:59,toY:33,period:4.6});
 if(stage===2&&room===1)map.devices.push({type:'jet',x:52,y:40,w:3,h:4,period:3.6,phase:1.3});
 if(stage===3&&room===2)map.rects.push({x:29,y:40,w:4,h:1,t:'crumble'});
 if(stage===4&&room===0)map.devices.push({type:'spring',x:57,y:40,w:3,h:1,power:450});
 if(room===2)map.devices.push({type:'beacon',x:41,y:40,w:3,h:1,moving:stage%2===0});
 return map;
}
window.GraftCampaign={ENCOUNTER_SECONDS,WORLDS,TASKS,mission,region,clock,progress,finish,encounter,encounterStep,decorate};
})();
