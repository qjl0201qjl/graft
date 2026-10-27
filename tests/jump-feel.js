const assert=require('node:assert/strict'),{boot}=require('./harness');
function run(fps,held){const {G,els}=boot({touch:true});G.loadLevel(0);const step=()=>G.step(1/fps);for(let n=0;n<fps/2;n++)step();const foot=()=>{const b=G.bounds();return b.y+b.h},start=foot();let top=start;
const ev=(type,id=7)=>({type,pointerId:id,preventDefault(){}});els.btnJump.dispatchEvent(ev('pointerdown'));els.btnJump.dispatchEvent(ev('pointerup',99));assert(els.btnJump.classList.contains('down'),'其他手指松开不能取消跳键');if(!held)els.btnJump.dispatchEvent(ev('pointerup'));
for(let n=0;n<fps;n++){step();top=Math.min(top,foot());}return start-top;}
const heights=[];for(const fps of [30,60,120]){const tap=run(fps,false),hold=run(fps,true);assert(Math.abs(tap-hold)<.01);assert(tap>56,'手机轻点应能完整跳起约7格');heights.push(tap);}assert(Math.max(...heights)-Math.min(...heights)<1,'不同帧率跳高应接近');
// 在地面前按跳，落地立即起跳；超过宽限窗口后不能空中再跳。
for(const fps of [30,60,120]){
 const {G}=boot();G.loadLevel(0);for(let n=0;n<fps/2;n++)G.step(1/fps);const base=G.P.py;
 G.P.py-=4;G.P.vy=40;G.P.onGround=false;G.P.coyote=0;G.key('Space',true);let jumped=false;for(let n=0;n<fps*.2;n++){G.step(1/fps);if(G.P.vy<0)jumped=true;}assert(jumped,'落地前的跳跃输入应缓存');
 G.key('Space',false);G.P.py=base-30;G.P.vy=0;G.P.onGround=false;G.P.coyote=.1;G.key('Space',true);G.step(1/fps);assert(G.P.vy<0,'刚离边缘仍可跳');G.key('Space',false);G.P.py=base-30;G.P.vy=0;G.P.onGround=false;G.P.coyote=0;G.key('Space',true);G.step(1/fps);assert(G.P.vy>0,'不能无限空中跳');
}
console.log('PASS 手机短按完整跳跃、多指释放、30/60/120 FPS 跳高、落地缓存与边缘宽限');

// 仅轻擦平台角时校正 2px；真正撞到平台底面仍然挡住。
for(const overlap of [2,6]){const {G}=boot();G.loadLevel(0);G.P.px=62*8-24-16+overlap;G.P.py=34*8-16+.5;const x=G.P.px,y=G.P.py;const moved=G.tryMoveY(-2);if(overlap===2){assert(moved);assert.equal(G.P.px-x,-2);assert.equal(G.P.py-y,-2);}else{assert.equal(moved,false);assert.equal(G.P.px,x);assert(G.P.py>=y-.5);}}
console.log('PASS 轻擦平台角可继续上升，平台底面仍有碰撞');
