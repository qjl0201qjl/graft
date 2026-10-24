// 每关加载 + 跑 4 秒 + 渲染,确认不报错、不掉出地图
const { boot } = require('./harness');
const { G } = boot();
let errs = 0;
for (let lv = 0; lv < G.LEVELS.length; lv++){
  G.loadLevel(lv);
  for (let f=0; f<240; f++){ G.step(1/60); G.render(); }
  const b = G.bounds();
  const ok = G.state === 'play' && !b.empty && G.items().every(it => it.y < 360);
  console.log((ok?'ok  ':'FAIL')+' L'+(lv+1)+' '+G.LEVELS[lv].name);
  if (!ok) errs++;
}
G.openEditor(); G.drawEditor(); G.closeEditor();
process.exit(errs?1:0);
