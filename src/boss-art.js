(function(){'use strict';
function bead(p,x,y,r,c){p.fillStyle='#152438';p.beginPath();p.arc(x,y,r+1,0,Math.PI*2);p.fill();p.fillStyle=c;p.beginPath();p.arc(x,y,r,0,Math.PI*2);p.fill();p.fillStyle='#213347';p.beginPath();p.arc(x,y,Math.max(1,r*.25),0,Math.PI*2);p.fill();p.fillStyle='#e9faff88';p.fillRect(x-r*.5,y-r*.5,Math.max(1,r*.6),1);}
function chain(p,points,c,r){p.strokeStyle='#273b52';p.lineWidth=r*1.4;p.beginPath();points.forEach((v,i)=>i?p.lineTo(v[0],v[1]):p.moveTo(v[0],v[1]));p.stroke();for(const q of points)bead(p,q[0],q[1],r,c);}
function draw(p,b,t,weak){const cx=b.x+20,cy=b.y+20,flash=b.flash>0,col=flash?'#fff3d5':b.color,wind=b.pose||0;p.save();
 p.fillStyle='#07111c88';p.beginPath();p.ellipse(cx,b.y+43,27,4,0,0,Math.PI*2);p.fill();
 if(b.index===0){
  for(let j=0;j<4;j++)for(let i=0;i<4;i++)bead(p,b.x+8+i*8,b.y+7+j*8,4,'#765466');
  chain(p,[[cx-16,cy-8],[cx-25,cy-3-wind*12],[cx-29,cy+9-wind*12]],col,6);chain(p,[[cx+16,cy-8],[cx+26,cy-5-wind*14],[cx+30,cy+8-wind*14]],col,6);
  chain(p,[[cx-9,cy+12],[cx-13,cy+21]],'#586179',5);chain(p,[[cx+9,cy+12],[cx+14,cy+21]],'#586179',5);
  p.fillStyle='#263144';p.fillRect(cx-12,b.y-3,24,12);p.fillStyle='#ffcd89';p.fillRect(cx-9,b.y+1,18,3);p.fillStyle=col;p.beginPath();p.moveTo(cx-13,b.y+1);p.lineTo(cx-19,b.y-12);p.lineTo(cx-5,b.y-3);p.fill();p.beginPath();p.moveTo(cx+13,b.y+1);p.lineTo(cx+19,b.y-12);p.lineTo(cx+5,b.y-3);p.fill();
 }else if(b.index===1){
  const tail=[];for(let i=0;i<7;i++)tail.push([cx+14+i*6,cy+8+Math.sin(t*3+i*.7)*9]);chain(p,tail,'#4e92ad',Math.max(2,5));
  for(let j=0;j<4;j++)for(let i=0;i<3;i++)bead(p,cx-9+i*8,cy-13+j*8,5,col);
  p.fillStyle='#8de8ed';p.beginPath();p.moveTo(cx-10,cy-10);p.lineTo(cx-28,cy-20-wind*10);p.lineTo(cx-20,cy+13);p.fill();p.beginPath();p.moveTo(cx+8,cy-10);p.lineTo(cx+24,cy-24-wind*10);p.lineTo(cx+20,cy+4);p.fill();
  bead(p,cx-4,cy-18,9,'#6687b4');p.fillStyle='#dcffff';p.fillRect(cx-11,cy-21,10,3);
 }else if(b.index===2){
  chain(p,[[cx-11,cy+11],[cx-15,cy+21]],'#78889a',7);chain(p,[[cx+11,cy+11],[cx+15,cy+21]],'#78889a',7);
  for(let j=0;j<4;j++)for(let i=0;i<4;i++)bead(p,cx-12+i*8,cy-15+j*8,5,col);
  chain(p,[[cx-18,cy-8],[cx-29,cy-3-wind*21],[cx-31,cy+13-wind*21]],'#7c91a4',8);chain(p,[[cx+18,cy-8],[cx+29,cy-3-wind*21],[cx+31,cy+13-wind*21]],'#7c91a4',8);
  p.strokeStyle='#7cf0e0';p.lineWidth=2;p.beginPath();p.moveTo(cx-6,cy-13);p.lineTo(cx+3,cy-5);p.lineTo(cx-2,cy+3);p.lineTo(cx+7,cy+10);p.stroke();p.fillStyle='#253247';p.fillRect(cx-10,b.y-2,20,8);p.fillStyle='#d1ffff';p.fillRect(cx-7,b.y+1,14,2);
 }else if(b.index===3){
  chain(p,[[cx-5,cy+7],[cx-17,cy+15],[cx-26,cy+22]],'#6c986e',4);chain(p,[[cx+5,cy+7],[cx+17,cy+15],[cx+26,cy+22]],'#6c986e',4);
  for(const side of [-1,1]){const wing=[[cx+side*8,cy-6],[cx+side*22,cy-18-wind*9],[cx+side*31,cy-9],[cx+side*20,cy+6]];p.fillStyle=col;p.beginPath();wing.forEach((v,i)=>i?p.lineTo(...v):p.moveTo(...v));p.closePath();p.fill();chain(p,wing.slice(0,3),'#a6d5a3',3);}
  chain(p,[[cx,cy-12],[cx,cy-2],[cx,cy+9]],'#587a71',7);bead(p,cx,cy-20,7,'#b4bad3');p.fillStyle='#fff4cc';p.fillRect(cx-4,cy-22,8,2);
  for(let i=-1;i<=1;i++){p.strokeStyle='#cfdf9c';p.lineWidth=2;p.beginPath();p.moveTo(cx+i*5,cy-23);p.lineTo(cx+i*11,cy-35);p.stroke();}
 }else{
  for(let i=0;i<6;i++){const a=t*.65+i*Math.PI/3,x=cx+Math.cos(a)*30,y=cy+Math.sin(a)*24;p.strokeStyle='#756c9a';p.lineWidth=1;p.beginPath();p.moveTo(cx,cy);p.lineTo(x,y);p.stroke();bead(p,x,y,4,'#81759e');}
  p.fillStyle='#4b446b';p.beginPath();p.moveTo(cx,cy-28);p.lineTo(cx+20,cy);p.lineTo(cx+29,cy+25);p.lineTo(cx,cy+16);p.lineTo(cx-29,cy+25);p.lineTo(cx-20,cy);p.closePath();p.fill();
  chain(p,[[cx,cy-17],[cx,cy-5],[cx,cy+8]],col,7);p.strokeStyle='#aaa0d1';p.lineWidth=2;p.beginPath();p.arc(cx,cy,22,t,t+Math.PI*1.7);p.stroke();
 }
 // A clearly marked common hurtbox core; decorative tails and wings are not hurtboxes.
 const r=b.shield?7:9;p.fillStyle=b.shield?'#24364a':'#fff2ba';p.beginPath();p.arc(cx,cy,r+2,0,Math.PI*2);p.fill();bead(p,cx,cy,r,flash?'#fff':weak);p.fillStyle='#fff9d8';p.fillRect(cx-2,cy-3,4,2);
 if(b.shield){p.strokeStyle=weak;p.lineWidth=1.5;p.beginPath();p.arc(cx,cy,25,0,Math.PI*2);p.stroke();}
 if(b.root>0){p.strokeStyle='#a7e680';p.lineWidth=3;p.beginPath();p.moveTo(b.x-5,b.y+40);p.lineTo(b.x+8,b.y+15);p.lineTo(b.x+26,b.y+39);p.lineTo(b.x+43,b.y+15);p.stroke();}p.restore();}
window.GraftBossArt={draw};})();
