(function(){
'use strict';
// 图册与关内背包分开记账；保存的是图纸进度，不是可领取的关内材料。
const PATTERNS = [
 {id:'sprout',name:'发芽小盆',need:0,rows:['00000000','00022000','00222000','00020000','01111100','00111000','00111000','00000000']},
 {id:'drop',name:'一滴海蓝',need:2,rows:['00040000','00444000','00444000','04444400','04444400','04444400','00444000','00000000']},
 {id:'fox',name:'余烬小狐',need:5,rows:['05000500','05505500','05555500','05151500','05555500','00111000','00010000','00000000']},
 {id:'mushroom',name:'森林蘑菇',need:9,rows:['00022000','00222200','02122120','02222220','00011000','00011000','00111100','00000000']},
 {id:'cat',name:'月光石猫',need:14,rows:['03000300','03303300','03333300','03434300','03313300','00333000','00333030','00033330']},
 {id:'lantern',name:'五色灯塔',need:21,rows:['00033000','00333300','00155100','00155100','00333300','00044000','00244200','03333330']},
];
const COLORS=['#9a8ba8','#ff9eaf','#9dd775','#aeb9cd','#78d9e7','#ffc371'];
const LABELS=['','粉 · 肉','绿 · 草','灰 · 石','蓝 · 水','橙 · 火'];
function bead(p,x,y,size,id,ghost){
 const r=size*.39,cx=x+size/2,cy=y+size/2;
 p.save();p.globalAlpha=ghost?.24:1;
 p.fillStyle='#564252';p.beginPath();p.arc(cx,cy+size*.05,r,0,Math.PI*2);p.fill();
 p.fillStyle=COLORS[id];p.beginPath();p.arc(cx,cy,r,0,Math.PI*2);p.fill();
 p.strokeStyle='#fff2df';p.lineWidth=Math.max(.5,size*.04);p.beginPath();p.arc(cx,cy,r*.81,Math.PI,Math.PI*1.7);p.stroke();
 p.fillStyle='#493e55';p.beginPath();p.arc(cx,cy,size*.115,0,Math.PI*2);p.fill();p.restore();
}
function create(store,hooks){
 const levelCount=()=>Math.max(0,Math.floor(Number(hooks.levelCount())||0));
 let active=false,selected=0,color=1,pid=null,last=null,trail=[],visited=new Set(),returnFocus=null;
 const $=id=>document.getElementById(id),el=$('beadBook'),cv=$('bookCv'),p=cv.getContext('2d');
 let data=store.get('beadBook',{});
 if(!data||typeof data!=='object'||Array.isArray(data))data={};
 const done=new Set(Array.isArray(data.done)?data.done.filter(id=>PATTERNS.some(t=>t.id===id)):[]);
 const drafts=data.drafts&&typeof data.drafts==='object'&&!Array.isArray(data.drafts)?data.drafts:{};
 let worn=done.has(data.worn)?data.worn:null;
 const charm=document.createElement('canvas');charm.width=charm.height=32;
 function save(){store.set('beadBook',{done:Array.from(done),drafts,worn});}
 function total(){
  const bits=store.get('beadSeeds',{})||{},old=store.get('seeds',{})||{};
  let n=0;for(let lv=0;lv<levelCount();lv++){const b=(Number(bits[lv])||0)&7;const cnt=(b&1)+((b>>1)&1)+((b>>2)&1);n+=Math.max(cnt,Math.min(3,Math.max(0,Math.floor(Number(old[lv])||0))));}return n;
 }
 function collect(lv,index){if(!Number.isInteger(lv)||!Number.isInteger(index)||lv<0||lv>=levelCount()||index<0||index>=3)return [];const before=total();const raw=store.get('beadSeeds',{});const bits=raw&&typeof raw==='object'&&!Array.isArray(raw)?raw:{};bits[lv]=((Number(bits[lv])||0)|(1<<index))&7;store.set('beadSeeds',bits);const after=total();return PATTERNS.filter(t=>t.need>before&&t.need<=after).map(t=>t.name);}
 function cells(){const t=PATTERNS[selected];let a=drafts[t.id];if(!Array.isArray(a)||a.length!==64)a=Array(64).fill(0);a=a.map((v,i)=>v===Number(t.rows[i>>3][i%8])?v:0);drafts[t.id]=a;return a;}
 function unlocked(t){return total()>=t.need||done.has(t.id);}
 function counts(){const t=PATTERNS[selected],a=cells();let count=0,max=0;for(let k=0;k<64;k++)if(+t.rows[k>>3][k%8]){max++;if(a[k])count++;}return {count,max};}
 function message(s){$('bookMessage').textContent=s;}
 function drawPattern(canvas,t,filled){const x=canvas.getContext('2d'),sz=canvas.width/8;x.clearRect(0,0,canvas.width,canvas.height);for(let k=0;k<64;k++){const v=+t.rows[k>>3][k%8];if(v)bead(x,k%8*sz,(k>>3)*sz,sz,v,!filled);}}
 function updateCharm(){const t=PATTERNS.find(t=>t.id===worn);const x=charm.getContext('2d');x.clearRect(0,0,32,32);if(t)drawPattern(charm,t,true);}
 function refresh(){
  const n=total(),next=PATTERNS.find(t=>!unlocked(t));
  $('bookGoal').textContent='光种 '+n+'/'+(levelCount()*3)+' · 成品 '+done.size+'/'+PATTERNS.length+(next?' · 再找 '+(next.need-n)+' 颗解锁「'+next.name+'」':' · 图纸已全部解锁');
  const nav=$('bookPatterns');nav.textContent='';PATTERNS.forEach((t,i)=>{const b=document.createElement('button');b.type='button';b.className='pattern'+(i===selected?' selected':'');b.disabled=!unlocked(t);b.setAttribute('aria-label',t.name+(b.disabled?'，需要 '+t.need+' 颗光种':''));const c=document.createElement('canvas');c.width=c.height=64;drawPattern(c,t,done.has(t.id));const title=document.createElement('strong');title.textContent=t.name;const sub=document.createElement('small');sub.textContent=done.has(t.id)?(worn===t.id?'正在佩戴':'已熨烫'):b.disabled?t.need+' 光种解锁':'可以开始';b.append(c,title,sub);b.addEventListener('click',()=>{save();selected=i;trail=[];last=null;message(done.has(t.id)?'成品已收进图册，可以随时戴回关卡。':'选一种颜色，照着浅色图纸穿豆。');refresh();});nav.appendChild(b);});
  const t=PATTERNS[selected],c=counts(),finished=done.has(t.id);
  cv.classList.toggle('fused',finished);
  $('bookName').textContent=t.name;$('bookProgress').textContent=c.count+'/'+c.max+' 颗';
  $('bookFinish').disabled=finished||c.count!==c.max||!unlocked(t);$('bookFinish').textContent=finished?'已熨烫收藏':'熨烫成挂件';
  $('bookWear').disabled=!finished;$('bookWear').textContent=worn===t.id?'取下挂件':'戴上挂件';$('bookUndo').disabled=finished||!trail.length;
  draw();
 }
 function draw(){
  const t=PATTERNS[selected],a=cells(),size=40;
  p.fillStyle='#e9d6bd';p.fillRect(0,0,320,320);
  for(let k=0;k<64;k++){const x=k%8*size,y=(k>>3)*size,v=+t.rows[k>>3][k%8];p.fillStyle='#c1a787';p.beginPath();p.arc(x+20,y+20,2,0,Math.PI*2);p.fill();if(v)bead(p,x,y,size,v,!a[k]&&!done.has(t.id));}
 }
 function paint(i,j){
  if(!active||!unlocked(PATTERNS[selected])||done.has(PATTERNS[selected].id)||i<0||j<0||i>7||j>7)return false;
  const k=j*8+i,t=PATTERNS[selected],v=+t.rows[j][i],a=cells();if(!v||a[k]||visited.has(k))return false;visited.add(k);
  if(v!==color){message('这里需要「'+LABELS[v]+'」豆，选好颜色再穿。');return false;}
  a[k]=color;trail.push(k);hooks.sound();const c=counts();$('bookProgress').textContent=c.count+'/'+c.max+' 颗';$('bookFinish').disabled=c.count!==c.max;$('bookUndo').disabled=false;message(c.count===c.max?'拼满了！点「熨烫成挂件」收进图册。':'穿上了一颗，继续顺着图纸走。');draw();return true;
 }
 function point(e){const r=cv.getBoundingClientRect();return {i:Math.floor((e.clientX-r.left)/r.width*8),j:Math.floor((e.clientY-r.top)/r.height*8)};}
 function drag(e){const q=point(e);if(last){const n=Math.max(Math.abs(q.i-last.i),Math.abs(q.j-last.j));for(let t=1;t<=Math.min(n,32);t++)paint(Math.round(last.i+(q.i-last.i)*t/n),Math.round(last.j+(q.j-last.j)*t/n));}else paint(q.i,q.j);last=q;}
 function end(){pid=null;last=null;visited.clear();save();}
 cv.addEventListener('pointerdown',e=>{if(e.button&&e.button!==0||pid!==null)return;e.preventDefault();pid=e.pointerId;visited.clear();try{cv.setPointerCapture(pid);}catch(_){}drag(e);});
 cv.addEventListener('pointermove',e=>{if(e.pointerId===pid)drag(e);});
 for(const event of ['pointerup','pointercancel','lostpointercapture'])cv.addEventListener(event,e=>{if(e.pointerId===pid)end();});
 const palette=$('bookPalette');for(let v=1;v<=5;v++){const b=document.createElement('button');b.type='button';b.style.setProperty('--bead',COLORS[v]);b.textContent=LABELS[v];b.className='bead-color'+(v===color?' selected':'');b.setAttribute('aria-pressed',String(v===color));b.addEventListener('click',()=>{color=v;visited.clear();Array.from(palette.children).forEach((child,i)=>{child.classList.toggle('selected',i+1===v);child.setAttribute('aria-pressed',String(i+1===v));});message('已选「'+LABELS[v]+'」豆。');});palette.appendChild(b);}
 $('bookUndo').addEventListener('click',()=>{if(done.has(PATTERNS[selected].id))return;const k=trail.pop();if(k!==undefined){cells()[k]=0;save();refresh();}});
 function finish(){const t=PATTERNS[selected],c=counts();if(!unlocked(t)||c.count!==c.max||done.has(t.id))return false;done.add(t.id);worn=t.id;save();updateCharm();refresh();message('熨烫完成！已戴上「'+t.name+'」，回关卡看看。');hooks.finish();return true;}
 $('bookFinish').addEventListener('click',finish);
 $('bookWear').addEventListener('click',()=>{const t=PATTERNS[selected];if(!done.has(t.id))return;worn=worn===t.id?null:t.id;save();updateCharm();refresh();message(worn?'已戴上，返回关卡即可看到。':'已取下挂件。');});
 function close(){if(!active)return;end();active=false;el.classList.add('hide');hooks.close();if(returnFocus&&typeof returnFocus.focus==='function')returnFocus.focus();}
 function open(id){if(active)return;const index=PATTERNS.findIndex(t=>t.id===id);if(index>=0&&unlocked(PATTERNS[index]))selected=index;returnFocus=document.activeElement;active=true;hooks.open();el.classList.remove('hide');message('第一张图纸免费。关内找到的光种会解锁更多图纸。');refresh();$('bookClose').focus();}
 $('bookClose').addEventListener('click',close);
 // 图册独立拦截键盘，防止空格开始关卡或方向键移动背后的角色。
 el.addEventListener('keydown',e=>{if(!active)return;e.stopPropagation();if(e.key==='Escape'){e.preventDefault();close();}if(e.key==='Tab'){const all=Array.from(el.querySelectorAll('button:not(:disabled)')).filter(b=>b.getClientRects().length);const first=all[0],last=all[all.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}});
 function awardPattern(id){const index=PATTERNS.findIndex(t=>t.id===id);if(index<0||done.has(id))return false;const t=PATTERNS[index];drafts[id]=t.rows.join('').split('').map(Number);done.add(id);worn=id;save();updateCharm();return true;}
 updateCharm();return {open,close,total,collect,paint,finish,counts,awardPattern,get active(){return active;},get worn(){return worn;},get charm(){return worn?charm:null;},get patterns(){return PATTERNS;},choose(i){if(!PATTERNS[i]||!unlocked(PATTERNS[i]))return false;selected=i;trail=[];refresh();return true;},select(v){if(v>=1&&v<=5){color=v;visited.clear();}},get completed(){return Array.from(done);}};
}
window.GraftBeads={create,drawBead:bead};
})();
