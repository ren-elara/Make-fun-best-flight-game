import { COLORS as C, MISSIONS, WORLD, clamp } from './config.js';
import { ArchipelagoScene } from './scene.js';
import { CourierAircraft } from './aircraft.js';

const FONT = '"Trebuchet MS", "Segoe UI", sans-serif';
const TAU = Math.PI * 2;
const formatter = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const number = (n) => formatter.format(n);

export class FlightRenderer {
  constructor(canvas, instruments) {
    this.canvas=canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.hudContext = instruments.getContext('2d');
    this.hudClock = -100;
    this.hudKey = '';
    this.staticKey = '';
    this.scene = new ArchipelagoScene();
    this.aircraft = new CourierAircraft();
  }
  render(model, clock) {
    const frozen = !model.started || model.showcase || model.paused || model.crashed || model.landed;
    const staticKey = frozen ? [model.started,model.showcase,model.director.index,model.paused,model.crashed,model.landed,model.muted,model.best,model.score].join('/') : '';
    if(staticKey && staticKey===this.staticKey)return;
    this.staticKey=staticKey;
    const ctx = this.ctx;
    // Keep instruments crisp while reducing raster work during live flight.
    const width=frozen?1280:800;
    if(this.canvas.width!==width){this.canvas.width=width;this.canvas.height=width*9/16;ctx.setTransform(width/1280,0,0,width/1280,0,0);}
    this.drawSky(model, clock);
    this.scene.render(ctx, model, clock);
    this.drawVignette();
    this.scene.drawFlightRoute(ctx, model, clock);
    this.aircraft.render(ctx, this.scene, model, clock);
    const key = [model.started,model.director.index,model.director.phase,model.paused,model.flaps,model.muted,model.showcase,model.crashed,model.landed,model.warning,model.score,model.best].join('/');
    if(clock-this.hudClock>=.25 || clock<this.hudClock || key!==this.hudKey){
      this.ctx=this.hudContext;this.ctx.clearRect(0,0,1280,720);this.drawInstruments(model);
      if (!model.started) this.drawBriefing(model);
      else if (model.crashed) this.drawResult(model, false);
      else if (model.landed) this.drawResult(model, true);
      else if (model.paused) this.drawPause(model);
      this.ctx=ctx;this.hudClock=clock;this.hudKey=key;
    }
  }
  drawSky(model, clock) {
    const ctx = this.ctx;
    const storm = model.weather === 'STORM', dusk = model.weather === 'DUSK';
    const sky = ctx.createLinearGradient(0, 0, 0, 490);
    sky.addColorStop(0, storm ? '#142940' : dusk ? '#413446' : '#1c526c');
    sky.addColorStop(.6, storm ? '#547387' : dusk ? '#c88779' : '#8bbfbd');
    sky.addColorStop(1, storm ? '#96a8aa' : dusk ? '#f7c599' : '#e8e8be');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, 1280, 720);
    const sunX = dusk ? 310 : 960, sunY = dusk ? 255 : 170;
    const glow = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, 170);
    glow.addColorStop(0, storm ? 'rgba(209,220,205,.1)' : 'rgba(255,225,169,.58)'); glow.addColorStop(1,'rgba(255,224,173,0)');
    ctx.fillStyle = glow; ctx.fillRect(sunX-170,sunY-170,340,340);
    if (!storm) {ctx.fillStyle = '#ffe6b1';ctx.beginPath();ctx.arc(sunX,sunY,dusk?22:16,0,TAU);ctx.fill();}
    ctx.save();
    for(let i=0;i<7;i++){
      const x=(i*273+clock*2)%1800-240, y=90+(i%3)*49;
      ctx.fillStyle=storm?'rgba(28,48,66,.28)':'rgba(222,236,219,.28)';
      ctx.beginPath();ctx.ellipse(x,y,110+i%3*28,7+i%2*5,-.02,0,TAU);ctx.fill();
      ctx.beginPath();ctx.ellipse(x+60,y-7,65,13,0,0,TAU);ctx.fill();
    }
    ctx.restore();
  }
  drawVignette() {
    const ctx=this.ctx;const shade=ctx.createRadialGradient(640,330,220,640,350,790);
    shade.addColorStop(0,'rgba(4,16,26,0)');shade.addColorStop(1,'rgba(4,16,26,.58)');ctx.fillStyle=shade;ctx.fillRect(0,0,1280,720);
  }
  drawInstruments(m) {
    const ctx=this.ctx;
    this.panel(26,22,340,91);this.label(44,44,'AURELIA',C.mint,21,true);this.label(157,44,'ISLAND AIR SERVICE', '#8cb6b7',10);
    this.label(44,76,m.mission.name,C.amber,18,true);this.label(44,98,`${m.mission.number} / ${m.mission.type}     AR-7 · STORM COURIER`,'#a4bdba',10);
    this.drawCompass(m);
    this.panel(914,22,340,91);
    this.label(934,44,'ALTITUDE', '#8cb6b7',10);this.label(934,75,number(m.altitude),C.mint,29,true);this.label(1040,78,'FT', '#8cb6b7',11);
    this.label(1101,44,'AIRSPEED', '#8cb6b7',10);this.label(1101,75,Math.round(m.speed).toString().padStart(3,'0'),C.amber,29,true);this.label(1182,78,'KT','#8cb6b7',11);
    this.drawNavigation(m);
    this.drawMap(m);
    this.drawFlightDirector(m);
    this.drawAttitude(m);
    this.drawMissionTelemetry(m);
    this.panel(26,565,366,128,.88);this.label(45,586,'FLIGHT PLAN', '#8cb6b7',10,true);this.label(371,586,m.director.index===2?'STRAIGHT IN':`${m.rings}/2 GATES`, C.amber,10,true,'right');
    this.wrap(45,611,m.director.message,325,C.mint,13,19);
    const steps=m.director.index===2?['APPROACH','FLAPS','FLARE','HOME']:['GATES',m.director.index===1?'RESCUE':'CARGO','RUNWAY','HOME'];
    const active=m.director.phase==='complete'?3:m.director.index===2?(m.agl<30?2:m.flaps?1:0):m.director.phase==='landing'?2:m.director.phase==='rescue'?1:0;
    for(let i=0;i<4;i++){
      const x=49+i*96;ctx.fillStyle=i===active?C.amber:i<active?C.cyan:'#36545e';ctx.beginPath();ctx.arc(x,660,4,0,TAU);ctx.fill();
      if(i<3){ctx.strokeStyle=i<active?'#80cabc':'#36545e';ctx.beginPath();ctx.moveTo(x+8,660);ctx.lineTo(x+88,660);ctx.stroke();}
      this.label(x,679,steps[i],i===active?C.amber:'#8cb6b7',9,true);
    }
    this.panel(888,565,366,128,.88);this.label(907,586,'COURIER SYSTEMS','#8cb6b7',10,true);this.label(1234,586,m.muted?'AUDIO OFF':'AUDIO ON',C.cyan,9,false,'right');
    this.bar(907,611,'FUEL',m.fuel/100,m.fuel<20?C.coral:C.cyan);
    this.bar(907,638,'CARGO',m.cargoIntegrity/100,C.amber);
    this.bar(907,665,'HULL',1-m.damage,m.damage>.5?C.coral:C.mint);
    this.panel(431,613,418,80,.82);this.label(452,635,'SORTIE SCORE','#8cb6b7',10);this.label(452,666,number(m.score),C.mint,24,true);
    this.label(594,635,'THROTTLE','#8cb6b7',10);this.label(594,664,`${Math.round(m.throttle*100)}%`,C.amber,20,true);
    this.label(719,635,m.flaps?'FLAPS 25°':'FLAPS UP',m.flaps?C.amber:'#8cb6b7',10,true);
    this.label(719,663,`${m.verticalSpeed>=0?'+':''}${Math.round(m.verticalSpeed*197)} FPM`,C.mint,13,true);
    this.label(640,710,'W / S  THROTTLE     ← →  BANK     ↑ ↓  PITCH     F  FLAPS     SPACE  PAUSE     ESC  SORTIES', '#a5c5c2',10,false,'center');
    if(m.warning&&!m.crashed&&!m.landed)this.warning(m.warning);
    if(m.director.flash>0&&m.rings>0&&!m.showcase&&!m.landed){
      this.panel(431,533,418,39,.9);
      this.label(640,553,m.director.phase==='landing'?(m.director.index===1?'RESCUE COMPLETE · RETURN HOME':'GATES CLEARED · RETURN HOME'):'GATE CLEARED · NICE FLYING',C.amber,12,true,'center');
    }
  }
  drawAttitude(m) {
    const ctx=this.ctx;this.panel(26,258,250,156,.74);
    this.label(44,279,'ATTITUDE / LOAD', '#8cb6b7',10,true);
    ctx.save();ctx.translate(99,343);ctx.beginPath();ctx.arc(0,0,45,0,TAU);ctx.clip();
    ctx.rotate(-m.roll);ctx.translate(0,m.pitch*150);
    ctx.fillStyle='#37677c';ctx.fillRect(-100,-150,200,150);ctx.fillStyle='#735f4e';ctx.fillRect(-100,0,200,150);
    ctx.strokeStyle='#bce4d4';ctx.lineWidth=1.3;ctx.beginPath();ctx.moveTo(-100,0);ctx.lineTo(100,0);ctx.stroke();
    for(const y of [-30,-15,15,30]){ctx.beginPath();ctx.moveTo(-12,y);ctx.lineTo(12,y);ctx.stroke();}ctx.restore();
    ctx.strokeStyle='#7cb4b3';ctx.lineWidth=1.2;ctx.beginPath();ctx.arc(99,343,45,0,TAU);ctx.stroke();
    ctx.strokeStyle=C.amber;ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(70,343);ctx.lineTo(90,343);ctx.lineTo(99,348);ctx.lineTo(108,343);ctx.lineTo(128,343);ctx.stroke();
    this.label(162,313,`${m.loadFactor.toFixed(2)} G`,m.loadFactor>1.4?C.coral:C.mint,17,true);
    this.label(162,340,`STALL ${Math.ceil(m.stallSpeed)} KT`,'#a4bdba',10);
    this.label(162,365,m.engineOut?'GLIDING':m.flaps?'HIGH LIFT':'CRUISE',m.engineOut?C.coral:C.amber,10,true);
    this.label(44,398,`BANK ${Math.round(Math.abs(m.roll)*180/Math.PI)}°    CARGO ${m.mission.cargo} KG`,'#a4bdba',10);
  }
  drawMissionTelemetry(m) {
    const ctx=this.ctx;
    if(m.director.phase==='rescue'){
      this.panel(977,336,277,102,.82);this.label(994,357,'RESCUE POD / STABILISE',C.coral,11,true);
      this.label(994,382,'Within 190 m · wings level · 90–159 KT','#c6d7ce',10);
      ctx.fillStyle='#334b50';ctx.fillRect(994,403,241,8);ctx.fillStyle=C.coral;ctx.fillRect(994,403,241*clamp(m.rescueDwell/1.2,0,1),8);
      this.label(1235,425,`${Math.round(clamp(m.rescueDwell/1.2,0,1)*100)}% DEPLOYED`,C.amber,9,true,'right');
    }else if(m.director.phase==='landing'){
      this.panel(977,336,277,112,.82);this.label(994,357,'RWY 36 / APPROACH CHECK',C.amber,11,true);
      const check=(x,y,text,ready)=>{ctx.strokeStyle=ready?C.cyan:C.coral;ctx.fillStyle=ready?C.cyan:'rgba(255,128,110,.1)';ctx.beginPath();ctx.arc(x,y,3,0,TAU);ctx.fill();ctx.stroke();this.label(x+10,y,text,ready?C.mint:C.coral,10);};
      check(997,382,'FLAPS',m.flaps);check(1096,382,'65–110 KT',m.speed>=65&&m.speed<=110);
      check(997,405,'LEVEL',Math.abs(m.roll)<.14);check(1096,405,'SINK <750',m.verticalSpeed>-3.8);
      const offset=clamp(m.x/90,-1,1);ctx.strokeStyle='#6e9e9c';ctx.beginPath();ctx.moveTo(1080,433);ctx.lineTo(1232,433);ctx.moveTo(1156,426);ctx.lineTo(1156,440);ctx.stroke();
      ctx.fillStyle=Math.abs(m.x)<35?C.cyan:C.coral;ctx.beginPath();ctx.arc(1156+offset*70,433,4,0,TAU);ctx.fill();this.label(994,433,'LINE UP','#8cb6b7',9);
    }
    const minutes=Math.floor(m.elapsed/60).toString().padStart(2,'0'),seconds=Math.floor(m.elapsed%60).toString().padStart(2,'0');
    this.label(1237,531,`${minutes}:${seconds}  SORTIE   /   BEST ${number(m.best)}`,'#accac1',10,true,'right');
  }
  drawCompass(m) {
    const ctx=this.ctx;this.panel(430,22,420,66,.72);
    ctx.save();ctx.beginPath();ctx.rect(443,29,394,51);ctx.clip();
    const base=Math.floor(m.heading/10)*10;
    for(let i=-7;i<=7;i++){
      const degree=base+i*10, x=640+(degree-m.heading)*4.1;
      const heading=(degree+720)%360;const cardinal=({0:'N',90:'E',180:'S',270:'W'})[heading];
      ctx.strokeStyle='#86b7b8';ctx.beginPath();ctx.moveTo(x,62);ctx.lineTo(x,cardinal?48:55);ctx.stroke();
      this.label(x,40,cardinal??heading.toString().padStart(3,'0'),cardinal?C.amber:'#b4d5cf',10,!!cardinal,'center');
    }
    ctx.restore();ctx.fillStyle=C.amber;ctx.beginPath();ctx.moveTo(640,61);ctx.lineTo(635,70);ctx.lineTo(645,70);ctx.fill();
    this.label(640,102,`HDG ${Math.round(m.heading).toString().padStart(3,'0')}°`,C.mint,13,true,'center');
  }
  drawNavigation(m) {
    const ctx=this.ctx;this.panel(26,131,250,109,.64);
    this.label(44,153,m.director.phase==='landing'?'ILS / RUNWAY 36':'NAV / NEXT WAYPOINT','#8cb6b7',10,true);
    this.label(44,179,`${(m.targetDistance/1852).toFixed(2)} NM`,C.amber,23,true);
    this.label(44,207,`BRG ${Math.round(m.targetBearing).toString().padStart(3,'0')}°  ·  TARGET ${Math.round(m.target.y*3.28084)} FT`,C.mint,11);
    this.label(44,225,`RADAR ${Math.round(m.agl*3.28084)} FT  ·  WIND ${Math.round(Math.abs(m.crosswind)*4)} KT`,'#8cb6b7',10);
    ctx.save();ctx.translate(245,181);ctx.rotate(m.bearingError*Math.PI/180);ctx.fillStyle=C.amber;ctx.beginPath();ctx.moveTo(0,-15);ctx.lineTo(-7,7);ctx.lineTo(0,3);ctx.lineTo(7,7);ctx.fill();ctx.restore();
  }
  drawMap(m) {
    const ctx=this.ctx;const x=1082,y=134,w=172,h=155;this.panel(x,y,w,h,.71);
    this.label(x+12,y+17,'ARCHIPELAGO / N ↑', '#a4c7c3',9,true);
    ctx.save();ctx.beginPath();ctx.rect(x+8,y+30,w-16,h-35);ctx.clip();
    const map=(px,pz)=>({x:x+86+(px/130),y:y+139-pz/65});
    for(const island of WORLD.islands){const p=map(island.x,island.z);ctx.fillStyle=island.flat?'#6d9275':'#315f60';ctx.beginPath();ctx.ellipse(p.x,p.y,island.radius/130,island.radius*.85/65,0,0,TAU);ctx.fill();}
    const p=map(m.x,m.z), t=map(m.target.x,m.target.z), strip=map(0,4300);
    ctx.strokeStyle='#d8bd81';ctx.setLineDash([3,4]);ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(t.x,t.y);ctx.stroke();ctx.setLineDash([]);
    ctx.fillStyle=C.amber;ctx.beginPath();ctx.arc(t.x,t.y,3.5,0,TAU);ctx.fill();ctx.fillStyle='#d1e8d9';ctx.fillRect(strip.x-2,strip.y-8,4,16);
    ctx.translate(p.x,p.y);ctx.rotate(m.heading*Math.PI/180);ctx.fillStyle=C.cyan;ctx.beginPath();ctx.moveTo(0,-7);ctx.lineTo(-5,5);ctx.lineTo(0,2);ctx.lineTo(5,5);ctx.fill();ctx.restore();
    this.label(1237,311,m.weather==='CLEAR'?'VIS 20 KM':m.weather==='STORM'?'SQUALL / CROSSWIND':'DUSK / LIGHTS ON',m.weather==='STORM'?C.coral:'#b0cebc',9,true,'right');
  }
  drawFlightDirector(m) {
    const ctx=this.ctx;const target=this.scene.project([m.target.x,m.target.y,m.target.z]);
    if(!m.landed&&target.depth>20){
      const x=clamp(target.x,330,1000), y=clamp(target.y-65,160,365);
      this.label(x,y,m.director.phase==='landing'?'ASTER RIDGE / RWY 36':m.director.phase==='rescue'?'WHITEWING / RESCUE FLARE':`BEACON ${Math.min(m.rings+1,2)} / ALIGN`,C.amber,11,true,'center');
      this.label(x,y+18,`${(m.targetDistance/1000).toFixed(1)} KM  ·  ${Math.round(m.target.y*3.28084)} FT`,'#d7e3ce',10,false,'center');
    }
    ctx.save();ctx.strokeStyle='rgba(192,245,225,.58)';ctx.lineWidth=1.2;
    ctx.beginPath();ctx.moveTo(610,387);ctx.lineTo(628,387);ctx.lineTo(634,392);ctx.moveTo(646,392);ctx.lineTo(652,387);ctx.lineTo(670,387);ctx.stroke();
    ctx.translate(640,399);ctx.rotate(-m.roll*.5);ctx.beginPath();ctx.arc(0,0,68,Math.PI*1.16,Math.PI*1.84);ctx.stroke();ctx.restore();
  }
  drawBriefing(m) {
    const ctx=this.ctx;ctx.fillStyle='rgba(5,18,29,.72)';ctx.fillRect(0,0,1280,720);
    this.panel(126,94,1028,533,.94);this.label(174,147,'AURELIA',C.mint,49,true);this.label(177,185,'STORM COURIER',C.amber,16,true);
    this.label(1100,141,'ISLAND AIR SERVICE','#7da9ac',11,true,'right');this.label(1100,168,'THREE SORTIES. ONE PROMISE.','#a9c6bf',10,false,'right');
    this.label(177,229,'Keep the islands connected. Fly the gates. Bring everyone home.','#c5d7c7',16);
    MISSIONS.forEach((mission,i)=>{
      const y=258+i*71;const selected=i===m.director.index;
      ctx.fillStyle=selected?'rgba(131,244,228,.1)':'rgba(65,99,105,.12)';ctx.fillRect(174,y,930,61);ctx.strokeStyle=selected?'#8edec8':'#35515b';ctx.strokeRect(174,y,930,61);
      this.label(192,y+24,`${i+1}`,selected?C.amber:'#84a7ab',23,true);this.label(230,y+22,mission.name,selected?C.amber:C.mint,17,true);
      this.label(230,y+44,mission.briefing,'#9dbbb7',12);this.label(1085,y+22,mission.weather,mission.weather==='STORM'?C.coral:C.cyan,11,true,'right');
      this.label(1085,y+44,`${mission.cargo} KG / ${mission.type}`,'#8aa9ad',10,false,'right');
    });
    this.label(177,500,'1 / 2 / 3  SELECT     ENTER  LAUNCH     CLICK A SORTIE TO SELECT',C.mint,12,true);
    this.label(177,530,'W / S  throttle     ← → or A / D  bank     ↑ nose down / ↓ nose up     Q / E  rudder','#9bbcb9',12);
    this.label(177,553,'F  flaps     SPACE  pause     R  retry     M  mute     ESC  sorties     Hold mouse to steer','#9bbcb9',12);
    this.label(177,590,'LANDING: 65–110 KT · FLAPS DOWN · WINGS LEVEL · SINK BELOW 750 FT/MIN',C.amber,11,true);
    this.label(1100,590,`BEST ${number(m.best)}`,'#9bbcb9',11,true,'right');
  }
  drawPause(m) {
    this.overlay();this.panel(329,240,622,240,.97);this.label(640,291,'FLIGHT PAUSED',C.mint,30,true,'center');
    this.label(640,336,'SPACE / ENTER  resume     R  restart sortie',C.amber,14,true,'center');
    this.label(640,370,'ESC  choose sortie     M  toggle audio','#b3ccc4',13,false,'center');
    this.label(640,421,'Release the controls. The islands can wait.','#7fa4a7',12,false,'center');
  }
  drawResult(m,success) {
    this.overlay();this.panel(270,212,740,310,.97);
    const diverted=m.director.phase==='diverted';
    this.label(640,257,success?(diverted?'SAFE DIVERSION':'COURIER HOME'):'SORTIE LOST',success?C.mint:C.coral,33,true,'center');
    if(success){this.label(640,305,`SCORE ${number(m.score)}    /    LANDING ${Math.round(m.landingScore*100)}%`,C.amber,22,true,'center');this.label(640,343,`Cargo ${Math.round(m.cargoIntegrity)}% safe · Fuel ${Math.round(m.fuel)}% · Best ${number(m.best)}`,'#b3ccc4',15,false,'center');}
    else this.wrap(320,304,m.crashReason,640,'#c8d9cf',16,24);
    this.label(640,400,success&&!diverted?'ENTER  next sortie     R  fly again':'R / ENTER  retry sortie',C.amber,15,true,'center');
    this.label(640,446,'ESC  flight deck     1 / 2 / 3  select sortie','#9ab9b6',13,false,'center');
    if(success)this.label(640,482,diverted?'Aircraft safe. Delivery unfinished. Fly again to complete the mission.':'Every delivery is a promise. This one is kept.','#799f9f',12,false,'center');
  }
  overlay(){this.ctx.fillStyle='rgba(3,13,22,.68)';this.ctx.fillRect(0,0,1280,720);}
  warning(text){this.panel(445,140,390,35,.85);this.label(640,159,text,C.coral,13,true,'center');}
  panel(x,y,w,h,alpha=.77){const ctx=this.ctx;ctx.fillStyle=`rgba(6,23,33,${alpha})`;ctx.strokeStyle='rgba(154,219,209,.3)';ctx.lineWidth=1;ctx.beginPath();ctx.roundRect(x,y,w,h,5);ctx.fill();ctx.stroke();ctx.fillStyle='rgba(139,231,211,.6)';ctx.fillRect(x+1,y+13,2,18);}
  bar(x,y,name,amount,color){const ctx=this.ctx;this.label(x,y,name,'#92b2b2',10,true);ctx.fillStyle='#27424a';ctx.fillRect(x+62,y-4,208,7);ctx.fillStyle=color;ctx.fillRect(x+62,y-4,208*clamp(amount,0,1),7);this.label(x+324,y,`${Math.round(amount*100)}%`,color,11,true,'right');}
  wrap(x,y,text,width,color,size=13,lineHeight=18){const words=text.split(' ');let line='';let row=0;for(const word of words){this.ctx.font=`500 ${size}px ${FONT}`;if(this.ctx.measureText(`${line} ${word}`).width>width&&line){this.label(x,y+row*lineHeight,line,color,size);line=word;row++;}else line+=`${line?' ':''}${word}`;}this.label(x,y+row*lineHeight,line,color,size);}
  label(x,y,text,color,size=12,bold=false,align='left'){const ctx=this.ctx;ctx.save();ctx.fillStyle=color;ctx.font=`${bold?700:500} ${size}px ${FONT}`;ctx.textAlign=align;ctx.textBaseline='middle';ctx.fillText(text,x,y);ctx.restore();}
}
