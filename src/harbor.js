(function(){
'use strict';
const NAMES=['','粉豆','草豆','石豆','水豆','火豆'];
const COLORS=['','#ff9eaf','#9dd775','#aeb9cd','#78d9e7','#ffc371'];
const copy=x=>JSON.parse(JSON.stringify(x));
function shuffle(a,seed){let n=seed>>>0;for(let i=a.length-1;i>0;i--){n=(Math.imul(n,1664525)+1013904223)>>>0;const j=n%(i+1);[a[i],a[j]]=[a[j],a[i]];}return a;}
function requirements(t){const n=Array(6).fill(0);for(const row of t.rows)for(const v of row)if(+v)n[+v]++;return n.map(v=>Math.ceil(v/3));}
function createModel(store,patterns,award){
 let saved=store.get('harbor',{});if(!saved||typeof saved!=='object'||Array.isArray(saved))saved={};
 const done=new Set(Array.isArray(saved.done)?saved.done.filter(v=>Number.isInteger(v)&&v>=0&&v<patterns.length):[]);
 let attempt=Number.isSafeInteger(saved.attempt)?saved.attempt:0,history=[],s;
 function frontier(){let i=0;while(done.has(i)&&i<patterns.length-1)i++;return i;}
 function valid(v){
  if(!v||!Number.isInteger(v.stage)||v.stage<0||v.stage>=patterns.length||v.stage>frontier())return false;
  if(!Array.isArray(v.pool)||![6,12].includes(v.pool.length)||!Array.isArray(v.tray)||v.tray.length>6||!Array.isArray(v.stock)||v.stock.length>64||!Array.isArray(v.groups)||v.groups.length!==6)return false;
  if(!v.pool.every(c=>Number.isInteger(c)&&c>=0&&c<=5)||![...v.tray,...v.stock].every(c=>Number.isInteger(c)&&c>=1&&c<=5)||!v.groups.every(c=>Number.isInteger(c)&&c>=0))return false;
  const need=requirements(patterns[v.stage]);for(let c=1;c<=5;c++){const left=v.pool.filter(x=>x===c).length+v.tray.filter(x=>x===c).length+v.stock.filter(x=>x===c).length*3;if(v.groups[c]>need[c]||left!==(need[c]-v.groups[c])*3)return false;}
  if(v.groups[0]!==0)return false;
  if(v.tray.some(c=>v.tray.filter(x=>x===c).length>=3))return false;
  const won=need.every((n,c)=>!c||n===v.groups[c]);return v.status===(won?'won':v.tray.length===6?'lost':'play')&&Number.isInteger(v.moves)&&v.moves>=0&&v.moves<=500;
 }
 function persist(){store.set('harbor',{version:1,done:Array.from(done),attempt,active:s,history});}
 function refill(){while(s.stock.length&&s.pool.filter(c=>!c).length>=3){const c=s.stock.shift(),spots=shuffle(s.pool.map((v,i)=>!v?i:-1).filter(i=>i>=0),attempt+s.moves*31+s.stock.length);for(let i=0;i<3;i++)s.pool[spots[i]]=c;}}
 function start(stage){
  if(!Number.isInteger(stage)||stage<0||stage>=patterns.length||stage>frontier())return false;
  attempt++;const need=requirements(patterns[stage]),groups=[];for(let c=1;c<=5;c++)for(let j=0;j<need[c];j++)groups.push(c);
  shuffle(groups,stage*191+attempt*73);if(stage===0){const other=groups.findIndex(c=>c!==groups[0]);if(other>1)[groups[1],groups[other]]=[groups[other],groups[1]];}const slots=stage===0?6:12;
  s={stage,pool:Array(slots).fill(0),tray:[],stock:groups,groups:Array(6).fill(0),status:'play',moves:0};history=[];refill();persist();return true;
 }
 function take(i){
  if(s.status!=='play'||!Number.isInteger(i)||i<0||i>=s.pool.length||!s.pool[i])return null;
  history.push(copy(s));if(history.length>18)history.shift();
  const c=s.pool[i];s.pool[i]=0;s.tray.push(c);s.moves++;
  const matched=s.tray.filter(v=>v===c).length===3;
  if(matched){s.tray=s.tray.filter(v=>v!==c);s.groups[c]++;refill();}
  const need=requirements(patterns[s.stage]);let newItem=false;
  if(need.every((n,k)=>!k||s.groups[k]===n)){
   s.status='won';history=[];if(!done.has(s.stage)){done.add(s.stage);newItem=award(patterns[s.stage].id)!==false;}
  }else if(s.tray.length===6)s.status='lost';
  persist();return {color:c,matched,status:s.status,newItem};
 }
 function undo(){if(!history.length||s.status==='won')return false;s=history.pop();persist();return true;}
 function hint(){
  if(s.status!=='play')return [];
  const colors=[1,2,3,4,5].sort((a,b)=>s.tray.filter(c=>c===b).length-s.tray.filter(c=>c===a).length);
  for(const c of colors){const n=s.tray.filter(v=>v===c).length,spots=s.pool.map((v,i)=>v===c?i:-1).filter(i=>i>=0);if(spots.length+n>=3)return spots.slice(0,3-n);}
  return [];
 }
 if(valid(saved.active)){s=copy(saved.active);history=Array.isArray(saved.history)?saved.history.filter(valid).filter(v=>v.stage===s.stage&&v.moves<s.moves).slice(-18):[];}
 else start(frontier());
 return {start,take,undo,hint,get state(){return copy(s);},get done(){return Array.from(done);},get frontier(){return frontier();},get canUndo(){return !!history.length&&s.status!=='won';}};
}
function mount(store,hooks){
 const $=id=>document.getElementById(id),el=$('harbor'),patterns=hooks.patterns;
 const model=createModel(store,patterns,id=>hooks.award(id));let active=false,focus=null,flashTimer=null;
 function patternCanvas(canvas,t,groups,finished){
  const p=canvas.getContext('2d'),sz=canvas.width/8,used=Array(6).fill(0);p.clearRect(0,0,canvas.width,canvas.height);
  for(let k=0;k<64;k++){const c=+t.rows[k>>3][k%8];if(!c)continue;const full=finished||used[c]++<groups[c]*3;window.GraftBeads.drawBead(p,k%8*sz,(k>>3)*sz,sz,c,!full);}
 }
 function island(){
  const c=$('harborIsland'),p=c.getContext('2d'),w=c.width,h=c.height;p.clearRect(0,0,w,h);
  p.fillStyle='#a8d7d8';for(let i=0;i<8;i++)p.fillRect(23+i*71,72+(i%3)*7,36,2);
  patterns.forEach((t,i)=>{const x=26+i*94,y=76-(i%2)*6;const owned=hooks.owned().includes(t.id);p.fillStyle=owned?'#9d805d':'#b8bcb0';p.fillRect(x,y,80,10);p.fillStyle=owned?'#e7c58e':'#d6d8c7';p.fillRect(x,y-3,80,8);p.strokeStyle='#a08361';p.lineWidth=1;for(let k=1;k<5;k++){p.beginPath();p.moveTo(x+k*15,y-3);p.lineTo(x+k*15,y+5);p.stroke();}if(owned){const art=document.createElement('canvas');art.width=art.height=64;patternCanvas(art,t,[],true);p.drawImage(art,x+10,y-64,60,60);}else{p.fillStyle='#7eaaa9';p.font='18px serif';p.fillText('?',x+34,y-16);}});
  $('harborGrowth').textContent='我的豆岛 · '+hooks.owned().length+'/'+patterns.length+' 件作品';
 }
 function beadNode(c,small){const b=document.createElement('span');b.className=small?'h-mini-bead':'h-bead';b.style.setProperty('--bead',COLORS[c]);b.setAttribute('aria-hidden','true');return b;}
 function render(note){
  const s=model.state,t=patterns[s.stage],need=requirements(t),total=need.reduce((a,b)=>a+b,0),made=s.groups.reduce((a,b)=>a+b,0);
  el.classList.toggle('won',s.status==='won');el.classList.toggle('lost',s.status==='lost');
  $('harborStage').textContent='第 '+(s.stage+1)+' 件 · '+t.name;
  $('harborProgress').textContent=made+'/'+total+' 组';$('harborMeter').style.width=(made/total*100)+'%';
  patternCanvas($('harborPattern'),t,s.groups,s.status==='won');island();
  const nav=$('harborChapters');nav.textContent='';patterns.forEach((p,i)=>{const b=document.createElement('button');b.type='button';b.textContent=i+1;b.title=p.name;b.disabled=i>model.frontier;b.className=(i===s.stage?'selected ':'')+(model.done.includes(i)?'built':'');b.setAttribute('aria-label','第 '+(i+1)+' 件，'+p.name+(b.disabled?'，完成前一件后解锁':''));b.setAttribute('aria-current',i===s.stage?'step':'false');b.addEventListener('click',()=>{if(i!==model.state.stage){model.start(i);render('换一张图纸，试试新的配色。');}});nav.appendChild(b);});
  const pool=$('harborPool');pool.classList.toggle('six',s.pool.length===6);pool.textContent='';s.pool.forEach((c,i)=>{const b=document.createElement('button');b.type='button';b.className='h-tile'+(!c?' empty':'');b.disabled=!c||s.status!=='play';if(c){b.appendChild(beadNode(c));const label=document.createElement('small');label.textContent=NAMES[c];b.appendChild(label);b.setAttribute('aria-label',NAMES[c]+'，第 '+(i+1)+' 颗');}b.addEventListener('click',()=>{const r=model.take(i);if(!r)return;hooks.sound(r.matched);render(r.status==='won'?(r.newItem?'作品完成！已放上豆岛，也收进你的拼豆图册。':'这件作品又拼成了，去下一件看看新图纸。'):r.status==='lost'?'篮子满了。撤回一颗，先凑出同色的一组。':r.matched?'一组成了，豆子自动拼进图纸！':null);if(r.matched){$('harborPattern').classList.add('h-pop');clearTimeout(flashTimer);flashTimer=setTimeout(()=>$('harborPattern').classList.remove('h-pop'),360);}});pool.appendChild(b);});
  const tray=$('harborTray');tray.textContent='';for(let i=0;i<6;i++){const cell=document.createElement('span');cell.className='h-slot';if(s.tray[i])cell.appendChild(beadNode(s.tray[i],true));tray.appendChild(cell);}
  $('harborBasket').classList.toggle('danger',s.tray.length>=5);$('harborCount').textContent=s.tray.length+'/6';
  let advice=s.status==='won'?'这件作品已经上岛了，点下一件继续探索。':s.status==='lost'?'篮子满了，撤回一步就能继续想办法。':'点 3 颗同色豆 → 自动拼进图纸';const pair=[1,2,3,4,5].find(c=>s.tray.filter(v=>v===c).length===2);if(pair&&s.status==='play')advice='再点 1 颗'+NAMES[pair]+'，就能拼成一组';
  $('harborMessage').textContent=note||advice;
  $('harborUndo').disabled=!model.canUndo;$('harborHint').disabled=s.status!=='play';$('harborRestart').disabled=s.status==='won';
  $('harborResult').classList.toggle('hide',s.status!=='won');$('harborNext').textContent=s.stage===patterns.length-1?'从第一件再玩':'下一件 · '+patterns[Math.min(s.stage+1,patterns.length-1)].name;
  $('harborRule').textContent=s.stage===0?'先试两种颜色：选同色的豆子，凑齐三颗就知道怎么玩了。':'看清篮子里的颜色，尽量先凑一组，再拿新颜色。没有倒计时。';
 }
 $('harborUndo').addEventListener('click',()=>{if(model.undo())render('已撤回上一步。先凑篮子里已有的颜色。');});
 $('harborHint').addEventListener('click',()=>{const hint=model.hint(),s=model.state;Array.from($('harborPool').children).forEach((b,i)=>b.classList.toggle('suggested',hint.includes(i)));if(hint.length)$('harborMessage').textContent='试着点亮框中的'+NAMES[s.pool[hint[0]]]+'，可以拼成一组。';});
 $('harborRestart').addEventListener('click',()=>{model.start(model.state.stage);render('这一局重新开始，先观察相同颜色。');});
 $('harborNext').addEventListener('click',()=>{if(model.state.status!=='won')return;model.start((model.state.stage+1)%patterns.length);render('新图纸来了！同样只要点豆子，不用拖动。');});
 function close(){if(!active)return;active=false;el.classList.add('hide');hooks.close();if(focus&&typeof focus.focus==='function')focus.focus();}
 function open(){if(active)return;focus=document.activeElement;active=true;hooks.open();el.classList.remove('hide');render();$('harborClose').focus();}
 $('harborClose').addEventListener('click',close);$('harborWear').addEventListener('click',()=>{if(model.state.status!=='won')return;close();hooks.book(patterns[model.state.stage].id);});
 el.addEventListener('keydown',e=>{if(!active)return;e.stopPropagation();if(e.key==='Escape'){e.preventDefault();close();}if(e.key==='Tab'){const a=Array.from(el.querySelectorAll('button:not(:disabled)')).filter(b=>b.getClientRects().length),first=a[0],last=a[a.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}});
 return {open,close,model,get active(){return active;}};
}
window.GraftHarbor={createModel,mount};
})();
