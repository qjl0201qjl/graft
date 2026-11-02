const assert=require('node:assert/strict'),{boot}=require('./harness');const {G,els,win}=boot({touch:true});G.loadLevel(12);const step=n=>{for(let i=0;i<n;i++)G.step(1/60)};
assert(!G.editing,'旅途应直接开始，不强迫先拼装');assert.equal(G.enemies().length,2);assert(!G.journeyReady());assert.equal(G.switchElement('light'),false);assert(G.switchElement('fire'));assert(G.elements.cast(),'开局应立即能施法');assert.equal(G.elements.shots[0].key,'fire');
// Selected skill stays usable after the body loses a recipe bead.
G.P.mask[1*8+2]=0;step(30);assert(G.elements.cast());assert.equal(G.elements.shots.at(-1).key,'fire');
G.expedition.take(0);G.expedition.take(0);assert(G.expedition.craft('cannon',0));
assert(G.locked());G.P.invuln=999;G.enemies().forEach(e=>e.hp=0);step(3);G.P.px=225;step(3);assert.equal(G.journeyWave,1);G.enemies().forEach(e=>e.hp=0);step(3);assert.equal(G.journeyWave,2);assert(!G.journeyReady(),'探索区不出现提前首领');
G.devices().filter(d=>d.type==='pylon'||d.type==='salvage').forEach(d=>d.used=true);step(2);step(2);assert(!G.locked());G.nextLevel();assert.equal(G.campaignRoom,1);assert.equal(G.state,'play');
G.loadLevel(12,false,3,null,5);G.P.px=380;step(2);assert(G.journeyReady());G.P.px=280;step(2);assert(G.journeyReady(),'已启动首领不能后退冻结');G.elements.boss.hp=0;G.nextLevel();assert.equal(JSON.parse(win.localStorage.getItem('graft.elementChapter')),1,'击破最终大厅首领才解锁下一章');
G.loadLevel(0);step(30);assert(G.elements.cast(),'普通探索没有配方也能普通攻击');assert.equal(G.elements.shots.at(-1).key,'basic');
console.log('PASS 默认可施法、点击切换、掉豆不失效、两队小怪与关底门槛、通关解锁、普通攻击');

G.loadLevel(12);G.P.bag.fire=0;assert(G.switchElement('fire'),'已解锁的技能不会被材料不足卡住');step(50);assert(G.elements.cast());assert.equal(G.elements.shots.at(-1).key,'fire');

G.loadLevel(12);els.btnSkill.dispatchEvent({type:'pointerdown',pointerId:7,preventDefault(){}});assert(G.switchElement('fire'));els.btnSkill.dispatchEvent({type:'pointerup',pointerId:99});let fired=false;for(let i=0;i<45;i++){step(1);fired=fired||G.elements.shots.some(q=>q.key==='fire');}assert(fired,'按住攻击切元素后应连续施法，另一根手指松开不应打断');els.btnSkill.dispatchEvent({type:'pointerup',pointerId:7});
