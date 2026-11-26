import { WORLD, terrainHeight, clamp, lerp } from './config.js';

const TAU = Math.PI * 2;
const blend = (a, b, t) => a.map((c, i) => Math.round(lerp(c, b[i], t)));
const rgb = (c) => `rgb(${c.join(',')})`;
const hash = (n) => { const value = Math.sin(n * 127.1 + 311.7) * 43758.5453; return value - Math.floor(value); };

export class ArchipelagoScene {
  constructor() {
    this.terrain = [];
    this.buildings = [];
    this.constructTerrain();
    this.constructAirfield();
    this.faces = [...this.terrain, ...this.buildings].map((face) => ({ ...face, center: face.points.reduce((p, v) => p.map((n, i) => n + v[i] / face.points.length), [0, 0, 0]) }));
  }
  constructTerrain() {
    for (const island of WORLD.islands) {
      const cells = island.flat ? 8 : island.z < 4000 ? 11 : 7;
      const cell = island.radius * 2 / cells;
      for (let ix = 0; ix < cells; ix++) for (let iz = 0; iz < cells; iz++) {
        const x = island.x - island.radius + ix * cell;
        const z = island.z - island.radius + iz * cell;
        const corners = [[x, z], [x + cell, z], [x + cell, z + cell], [x, z + cell]].map(([px, pz]) => [px, terrainHeight(px, pz), pz]);
        if (corners.every((v) => v[1] <= 0)) continue;
        for (const indices of [[0, 1, 2], [0, 2, 3]]) {
          const points = indices.map((i) => corners[i]);
          const average = points.reduce((sum, v) => sum + v[1], 0) / 3;
          const light = clamp(.65 + (points[0][1] - points[1][1]) / cell * .35 + (points[0][1] - points[2][1]) / cell * .23, .35, 1.12);
          let color = average < 18 ? [159, 184, 132] : average > 940 ? [182, 213, 204] : average > 530 ? [81, 117, 108] : [57, 110, 88];
          color = color.map((c) => Math.min(255, Math.round(c * light)));
          this.terrain.push({ points, color });
        }
      }
    }
  }
  constructAirfield() {
    const palette = [[209, 153, 113], [192, 204, 176], [99, 150, 142], [217, 190, 134]];
    for (let i = 0; i < 35; i++) {
      const x = 170 + hash(i * 7) * 350;
      const z = 4050 + hash(i * 9 + 20) * 680;
      const y = terrainHeight(x, z);
      if (y < 8) continue;
      this.addBox(x, y, z, 19 + hash(i) * 20, 16 + hash(i + 9) * 42, 26 + hash(i + 1) * 22, palette[i % 4]);
    }
    this.addBox(-128, 32, 4350, 65, 36, 105, [109, 147, 150]);
    this.addBox(-150, 32, 4170, 27, 80, 27, [202, 211, 185]);
    this.addBox(-150, 103, 4170, 41, 16, 41, [63, 115, 126]);
  }
  addBox(x, y, z, w, h, d, color) {
    const v = [[x-w/2,y,z-d/2],[x+w/2,y,z-d/2],[x+w/2,y,z+d/2],[x-w/2,y,z+d/2],[x-w/2,y+h,z-d/2],[x+w/2,y+h,z-d/2],[x+w/2,y+h,z+d/2],[x-w/2,y+h,z+d/2]];
    for (const [indices, shade] of [[[0,1,5,4],.72],[[1,2,6,5],.86],[[2,3,7,6],.65],[[3,0,4,7],.9],[[4,5,6,7],1.12]]) this.buildings.push({ points: indices.map((i) => v[i]), color: color.map((c) => Math.min(255,Math.round(c*shade))) });
  }
  setCamera(model) {
    const angle = model.heading * Math.PI / 180;
    this.sin = Math.sin(angle); this.cos = Math.cos(angle);
    this.camera = { x: model.x - this.sin * 158, y: model.meters + 45, z: model.z - this.cos * 158 };
    this.pitch = .09 + model.pitch * .45;
    this.bank = model.roll * .11;
    this.pitchSin = Math.sin(this.pitch); this.pitchCos = Math.cos(this.pitch);
    this.bankSin = Math.sin(this.bank); this.bankCos = Math.cos(this.bank);
    this.focal = 710;
  }
  project(point) {
    const dx = point[0] - this.camera.x; const dy = point[1] - this.camera.y; const dz = point[2] - this.camera.z;
    const vx = dx * this.cos - dz * this.sin;
    const depth = dx * this.sin + dz * this.cos;
    const vy = dy * this.pitchCos + depth * this.pitchSin;
    const vz = depth * this.pitchCos - dy * this.pitchSin;
    const sx = vx * this.bankCos - vy * this.bankSin;
    const sy = vy * this.bankCos + vx * this.bankSin;
    return { x: 640 + sx * this.focal / Math.max(1, vz), y: 300 - sy * this.focal / Math.max(1, vz), depth: vz };
  }
  polygon(ctx, points, color, stroke = '') {
    const projected = points.map((p) => this.project(p));
    if (projected.some((p) => p.depth < 15)) return;
    ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(projected[0].x, projected[0].y);
    for (const p of projected.slice(1)) ctx.lineTo(p.x, p.y);
    ctx.closePath(); ctx.fill();
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = .6; ctx.stroke(); }
  }
  render(ctx, model, clock) {
    this.setCamera(model);
    const storm = model.weather === 'STORM'; const dusk = model.weather === 'DUSK';
    const fog = storm ? [65, 98, 118] : dusk ? [167, 125, 128] : [117, 175, 177];
    this.drawOcean(ctx, model, clock);
    const polygons = [];
    for (const face of this.faces) {
      const p = this.project(face.center);
      if (p.depth < 25 || p.depth > 20000 || p.x < -260 || p.x > 1540 || p.y < -220 || p.y > 940) continue;
      const haze = clamp((p.depth - 1600) / 18000, 0, .78);
      let color = face.color;
      if (storm) color = blend(color, [24, 52, 72], .3);
      if (dusk) color = blend(color, [139, 91, 106], .23);
      polygons.push({ ...face, depth: p.depth, fill: rgb(blend(color, fog, haze)) });
    }
    polygons.sort((a, b) => b.depth - a.depth);
    for (const face of polygons) this.polygon(ctx, face.points, face.fill);
    this.drawRunway(ctx, model);
    this.drawHarbor(ctx, clock);
    this.drawClouds(ctx, model, clock);
  }
  drawOcean(ctx, model, clock) {
    const dusk = model.weather === 'DUSK'; const storm = model.weather === 'STORM';
    const ocean = ctx.createLinearGradient(0, 230, 0, 720);
    ocean.addColorStop(0, storm ? '#476879' : dusk ? '#7c858a' : '#62999e');
    ocean.addColorStop(.22, storm ? '#22475e' : dusk ? '#2b6674' : '#246b7d');
    ocean.addColorStop(1, storm ? '#102c46' : '#103b55');
    const horizon = this.project([this.camera.x + this.sin * 40000, 0, this.camera.z + this.cos * 40000]);
    ctx.fillStyle = ocean;
    ctx.beginPath(); ctx.moveTo(-100, horizon.y - Math.tan(this.bank) * 740); ctx.lineTo(1380, horizon.y + Math.tan(this.bank) * 740); ctx.lineTo(1380, 900); ctx.lineTo(-100,900); ctx.fill();
    ctx.save(); ctx.lineWidth = 1;
    for (let i = 0; i < 90; i++) {
      const x = model.x - 2800 + hash(i + 98) * 5600;
      const z = model.z + 120 + hash(i * 3 + 4) * 7500;
      if (terrainHeight(x, z) > 0) continue;
      const p = this.project([x, 1, z]); const q = this.project([x + 18 + hash(i) * 95, 1, z]);
      if (p.depth < 20) continue;
      ctx.strokeStyle = `rgba(150,231,216,${.07 + hash(i) * .14})`;
      ctx.beginPath(); ctx.moveTo(p.x, p.y + Math.sin(clock + i)); ctx.lineTo(q.x,q.y); ctx.stroke();
    }
    ctx.restore();
  }
  drawRunway(ctx, model) {
    const strip = WORLD.runway; const y = strip.elevation + 1;
    const left=strip.x-strip.width/2,right=strip.x+strip.width/2,near=strip.z-strip.length/2,far=strip.z+strip.length/2;
    this.polygon(ctx, [[left,y,near],[right,y,near],[right,y,far],[left,y,far]], '#303e45');
    for (const x of [left+4,right-4]) this.polygon(ctx, [[x-1,y+.2,near+10],[x+1,y+.2,near+10],[x+1,y+.2,far-20],[x-1,y+.2,far-20]], '#c5d4cb');
    for (let i = 0; i < 11; i++) {
      const z = 3930 + i * 65;
      this.polygon(ctx, [[-2,y+.4,z],[2,y+.4,z],[2,y+.4,z+28],[-2,y+.4,z+28]], '#f1ead5');
      for (const x of [left-3,right+3]) { const p = this.project([x,y+2,z]); if (p.depth > 5) { const radius=clamp(1000/p.depth,1.2,4);ctx.fillStyle='rgba(255,210,138,.15)';ctx.beginPath();ctx.arc(p.x,p.y,radius*2.5,0,TAU);ctx.fill();ctx.fillStyle='#f9cc83';ctx.beginPath();ctx.arc(p.x,p.y,radius,0,TAU);ctx.fill(); } }
    }
    for (let i = 0; i < 6; i++) {
      const x = -40 + i * 15;
      this.polygon(ctx, [[x,y+.6,3900],[x+6,y+.6,3900],[x+6,y+.6,3933],[x,y+.6,3933]], '#e6e9d8');
    }
    const p = this.project([0,y+4,3980]);
    if (p.depth > 60) { ctx.save();ctx.translate(p.x,p.y);ctx.fillStyle='#e4e8da';ctx.font=`bold ${clamp(13000/p.depth,6,25)}px monospace`;ctx.textAlign='center';ctx.fillText('36',0,0);ctx.restore(); }
    if (model.director.phase === 'landing') {
      ctx.save();ctx.strokeStyle='rgba(143,249,208,.48)';ctx.setLineDash([5,9]);ctx.lineWidth=1;
      const p1=this.project([0,55,2850]);const p2=this.project([0,35,4000]);
      if(p1.depth>10&&p2.depth>10){ctx.beginPath();ctx.moveTo(p1.x,p1.y);ctx.lineTo(p2.x,p2.y);ctx.stroke();}ctx.restore();
    }
  }
  drawHarbor(ctx, clock) {
    for (let i=0;i<5;i++) {
      const x=670+i*100, z=4450+i*145;
      this.polygon(ctx,[[x-12,5,z-50],[x+12,5,z-50],[x+17,5,z+28],[x,5,z+52],[x-17,5,z+28]],'#d0d9cf');
      this.polygon(ctx,[[x-7,9,z-20],[x+7,9,z-20],[x+7,9,z+13],[x-7,9,z+13]],'#ba8063');
    }
  }
  drawFlightRoute(ctx, model, clock) {
    const target=model.target; const rescue=model.director.phase==='rescue';
    if(model.director.phase==='complete')return;
    if(model.director.phase==='landing'){
      for(let i=0;i<5;i++)this.ring(ctx,{x:0,z:3100+i*170,y:120-i*17,radius:60},'#a0f1d4',.14,.9);
      return;
    }
    this.ring(ctx,target,rescue?'#ff9277':'#ffd18b',1,clock);
    if(rescue){
      const x=target.x,z=target.z;
      this.polygon(ctx,[[x-19,3,z-35],[x+19,3,z-35],[x+25,3,z+16],[x,3,z+43],[x-25,3,z+16]],'#e7b27e');
      this.polygon(ctx,[[x-12,8,z-17],[x+12,8,z-17],[x+12,8,z+12],[x-12,8,z+12]],'#dce6cc');
      const base=this.project([target.x,0,target.z]);const tip=this.project([target.x,target.y+130,target.z]);
      if(base.depth>10&&tip.depth>10){const glow=ctx.createLinearGradient(base.x,base.y,tip.x,tip.y);glow.addColorStop(0,'rgba(255,119,91,0)');glow.addColorStop(1,'rgba(255,159,106,.9)');ctx.strokeStyle=glow;ctx.lineWidth=7;ctx.beginPath();ctx.moveTo(base.x,base.y);ctx.lineTo(tip.x,tip.y);ctx.stroke();ctx.fillStyle='#ffe0ac';ctx.beginPath();ctx.arc(tip.x,tip.y,5,0,TAU);ctx.fill();}
    }
  }
  ring(ctx,target,color,alpha,clock){
    const points=[];for(let i=0;i<=64;i++){const a=i/64*TAU;points.push(this.project([target.x+Math.cos(a)*target.radius,target.y+Math.sin(a)*target.radius,target.z]));}
    if(points.some((p)=>p.depth<20))return;
    ctx.save();ctx.globalAlpha=alpha;ctx.strokeStyle=color;ctx.lineWidth=4;
    ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.stroke();ctx.shadowBlur=0;
    for(let i=0;i<12;i++){const p=points[i*5];ctx.fillStyle=i%3===0?'#fff4cf':color;ctx.beginPath();ctx.arc(p.x,p.y,3.5,0,TAU);ctx.fill();}ctx.restore();
  }
  drawClouds(ctx,model,clock){
    if(model.weather!=='STORM')return;
    ctx.save();
    for(let i=0;i<10;i++){
      const x=(hash(i+89)*1680-200)+Math.sin(clock*.04+i)*10;const y=120+hash(i+45)*135;
      const gradient=ctx.createRadialGradient(x,y,5,x,y,165);gradient.addColorStop(0,'rgba(21,39,63,.57)');gradient.addColorStop(1,'rgba(30,52,72,0)');ctx.fillStyle=gradient;ctx.fillRect(x-165,y-165,330,330);
    }
    ctx.strokeStyle='rgba(182,215,228,.14)';ctx.lineWidth=1;
    for(let i=0;i<70;i++){const x=hash(i+29)*1280;const y=(hash(i+7)*720+clock*230)%720;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x-9,y+22);ctx.stroke();}
    ctx.restore();
  }
}
