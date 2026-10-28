// 这是输入与画布尺寸测试，不冒充浏览器排版或真机验收。
const assert=require('node:assert/strict');
const {boot}=require('./harness');
for(const [width,height]of [[320,568],[390,844],[430,932],[568,320],[844,390],[932,430]]){
 const {G,els,win}=boot({touch:true,width,height});G.loadLevel(0);
 const step=n=>{for(let i=0;i<n;i++)G.step(1/60)};step(30);
 const portrait=height>width*1.1;
 assert.equal(els.cv.width,portrait?384:480);assert.equal(els.cv.height,portrait?512:320);
 assert.equal(win.document.body.classList.contains('tall'),portrait);
 const ev=(type,pointerId,clientX=600)=>({type,pointerId,clientX,clientY:180,preventDefault(){}});
 const start=G.P.px;
 els.move.dispatchEvent(ev('pointerdown',1));
 els.btnJump.dispatchEvent(ev('pointerdown',2));els.btnJump.dispatchEvent(ev('pointerup',2));
 els.move.dispatchEvent(ev('pointerup',2));step(5);
 assert(G.P.px>start);assert(G.P.vy<0,'另一手指松开，仍然能一边移动一边完整跳跃');
 win.innerWidth=height;win.innerHeight=width;win.dispatchEvent({type:'resize'});
 assert.equal(els.cv.width,portrait?480:384);assert.equal(els.cv.height,portrait?320:512);
 assert(!els.btnJump.classList.contains('down'));
 // 与重新载入后的静止输入比较，旋转不能留下方向键。
 G.loadLevel(0);step(30);const x=G.P.px;step(20);assert.equal(G.P.px,x);
 G.openEditor();els.move.dispatchEvent(ev('pointerdown',1));G.closeEditor();step(10);assert.equal(G.P.px,x);
 G.render();
}
console.log('PASS 六种手机横竖屏尺寸、双指移动轻点跳跃、旋转清理输入和编辑隔离');
