// 暂停、改造、失焦时底部触屏控件不应排队留下移动/跳跃输入。
const assert=require('node:assert/strict');
const {boot}=require('./harness');
const {G,els,win}=boot({touch:true});
const step=n=>{for(let i=0;i<n;i++)G.step(1/60)};
const down=el=>el.dispatchEvent({type:'pointerdown',pointerId:1,clientX:600,clientY:200,preventDefault(){}});
G.loadLevel(0);step(30);
els.btnPause.dispatchEvent({type:'click'});
down(els.btnEdit);assert.equal(G.editing,false,'暂停中不能打开改造面板');
down(els.move);down(els.btnJump);
const x=G.P.px;
els.pmResume.dispatchEvent({type:'click'});step(4);
assert.equal(G.P.px,x,'暂停中按方向不应在恢复后移动');assert.equal(G.P.vy,0,'暂停中按跳不应排队');
G.openEditor();down(els.move);down(els.btnJump);G.closeEditor();step(4);
assert.equal(G.P.px,x,'改造中按方向不应在关闭后移动');assert.equal(G.P.vy,0);
down(els.move);down(els.btnJump);win.dispatchEvent({type:'blur'});step(12);
assert.equal(G.P.px,x,'窗口失焦应释放触屏方向');assert(!els.btnJump.classList.contains('down'));
console.log('PASS 暂停、改造与失焦隔离触屏方向、跳跃和编辑输入');
