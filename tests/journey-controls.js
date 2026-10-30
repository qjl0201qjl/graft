const assert=require('node:assert/strict'),{boot}=require('./harness');const {G,els,win}=boot({touch:true});G.loadLevel(12);const step=n=>{for(let i=0;i<n;i++)G.step(1/60)};
assert(!G.editing,'旅途应直接开始，不强迫先拼装');assert.equal(G.enemies().length,2);assert(!G.journeyReady());assert.equal(G.switchElement('light'),false);assert(G.switchElement('fire'));assert(G.elements.cast(),'开局应立即能施法');assert.equal(G.elements.shots[0].key,'fire');
// Selected skill stays usable after the body loses a recipe bead.
G.P.mask[1*8+2]=0;step(30);assert(G.elements.cast());assert.equal(G.elements.shots.at(-1).key,'fire');
assert(G.locked());G.enemies().forEach(e=>e.hp=0);step(3);assert(G.locked(),'小怪清完不能提前开启首领出口');G.P.px=225;step(3);assert.equal(G.journeyWave,1);assert(!G.journeyReady());G.enemies().forEach(e=>e.hp=0);step(3);assert.equal(G.journeyWave,2);assert(!G.journeyReady(),'走到关底才启动首领');G.P.px=360;step(2);assert(G.journeyReady());G.P.px=280;step(2);assert(G.journeyReady(),'已启动的首领不能靠后退冻结');
G.loadLevel(13);assert(G.switchElement('grass'));G.loadLevel(12);G.nextLevel();assert.equal(JSON.parse(win.localStorage.getItem('graft.elementChapter')),1,'通关才解锁下一章');
G.loadLevel(0);step(30);assert(G.elements.cast(),'普通探索没有配方也能普通攻击');assert.equal(G.elements.shots.at(-1).key,'basic');
console.log('PASS 默认可施法、点击切换、掉豆不失效、两队小怪与关底门槛、通关解锁、普通攻击');

G.loadLevel(12);G.P.bag.fire=0;assert(G.switchElement('fire'),'已解锁的技能不会被材料不足卡住');step(50);assert(G.elements.cast());assert.equal(G.elements.shots.at(-1).key,'fire');
