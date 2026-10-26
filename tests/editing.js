// 走实际 pointerdown 处理器,覆盖触控板主键削格和空位贴格。
const assert = require('node:assert/strict');
const { boot } = require('./harness');
const { G, els } = boot();
G.loadLevel(0);
for (let i=0;i<30;i++) G.step(1/60);
G.P.sel = 'meat';
function click(i,j,button=0,pointerType='mouse'){
  els.cv.dispatchEvent({type:'pointerdown',button,pointerType,
    clientX:(G.P.px+i*8+4-G.cam.x)*2,
    clientY:(G.P.py+j*8+4-G.cam.y)*2,preventDefault(){}});
}
const count = ()=> G.P.mask.reduce((n,v)=>n+!!v,0);
click(3,2);
assert.equal(count(),8); assert.equal(G.P.bag.meat,1);
click(3,2);
assert.equal(count(),9); assert.equal(G.P.bag.meat,0);
click(3,2,2);
assert.equal(count(),8); assert.equal(G.P.bag.meat,1);
click(3,2,2); // 右键空位不会贴格。
assert.equal(count(),8);
click(3,2,1); // 中键不改身体。
assert.equal(count(),8);
G.undo();
assert.equal(count(),9);
els.btnPause.dispatchEvent({type:'click'});
click(3,2);
assert.equal(count(),9);
els.pmResume.dispatchEvent({type:'click'});
click(3,2,0,'touch');
assert.equal(count(),8);
assert.equal(G.P.bag.meat,1);
console.log('PASS 触控板/鼠标点击削格、贴格、右键、撤销、暂停和触屏操作');
