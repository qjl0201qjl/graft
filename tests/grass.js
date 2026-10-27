const assert = require('node:assert/strict');
const { boot } = require('./harness');
const { G } = boot();
G.loadLevel(0);
for (let i=0;i<30;i++) G.step(1/60);
// 清掉关卡掉落物,独立检查身体与背包的材料守恒。
G.items().length = 0;
G.P.bag.grass = 1; G.P.sel = 'grass';
assert.equal(G.placeAt(5,3),true);
assert.equal(G.P.bag.grass,0);
const mask = ()=> Array.from(G.P.mask);
const grown = mask();
for (let i=0;i<720;i++) G.step(1/60);
assert.deepEqual(mask(),grown); // 背包为空、身体有草也不能凭空长。
assert.equal(G.placeAt(5,2),false);
assert.equal(G.P.bag.grass,0);
G.P.bag.grass=3;
for (let i=0;i<720;i++) G.step(1/60);
assert.deepEqual(mask(),grown); // 库存充足也不自动改变玩家形状。
assert.equal(G.P.bag.grass,3);
assert.equal(G.removeAt(5,3),true);
assert.equal(G.P.bag.grass,4);
const cut = mask();
for (let i=0;i<720;i++) G.step(1/60);
assert.deepEqual(mask(),cut);
assert.equal(G.P.mask.includes(2),false);
console.log('PASS 草不再自动长,库存耗尽不能贴,削掉后不会长回来');
