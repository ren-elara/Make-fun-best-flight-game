export class CourierAircraft {
  render(ctx, scene, model, clock) {
    const faces=[];
    const point=([x,y,z])=>{
      const bank=-model.roll*.75;
      const bx=x*Math.cos(bank)-y*Math.sin(bank), by=x*Math.sin(bank)+y*Math.cos(bank);
      const pitch=model.pitch*.65;
      const py=by*Math.cos(pitch)+z*Math.sin(pitch), pz=z*Math.cos(pitch)-by*Math.sin(pitch);
      return [model.x+bx*scene.cos+pz*scene.sin,model.meters+py,model.z-bx*scene.sin+pz*scene.cos];
    };
    const face=(v,color)=>faces.push({points:v.map(point),color});
    if(model.agl<170){
      const shadow=scene.project([model.x,model.meters-model.agl+1,model.z]);
      if(shadow.depth>15){ctx.save();ctx.globalAlpha=.2*(1-model.agl/170);ctx.fillStyle='#071a25';ctx.beginPath();ctx.ellipse(shadow.x,shadow.y,Math.min(180,28000/shadow.depth),Math.min(35,4800/shadow.depth),-model.roll*.1,0,Math.PI*2);ctx.fill();ctx.restore();}
    }
    // Narrow gull-wing courier: cream panels, copper trim, twin turbine pods.
    face([[-5,0,-30],[5,0,-30],[9,0,12],[6,4,29],[-6,4,29],[-9,0,12]],'#486875');
    face([[-5,4,-31],[5,4,-31],[9,9,5],[-9,9,5]],'#e6e4ce');
    face([[-9,9,5],[9,9,5],[5,9,29],[-5,9,29]],'#c6cfbd');
    face([[-5,0,-30],[-5,4,-31],[-9,9,8],[-9,0,12]],'#b4bcb1');
    face([[5,0,-30],[5,4,-31],[9,9,8],[9,0,12]],'#83968e');
    face([[-7,18,5],[7,18,5],[5,18,19],[-5,18,19]],'#336576');
    face([[-7,11,3],[7,11,3],[7,18,5],[-7,18,5]],'#74acae');
    face([[-7,18,5],[-5,18,19],[-5,10,23],[-8,10,5]],'#467c89');
    face([[7,18,5],[5,18,19],[5,10,23],[8,10,5]],'#264e5b');
    face([[-5,18,19],[5,18,19],[5,10,23],[-5,10,23]],'#7eb3b1');
    face([[-8,6,8],[-59,3,-8],[-60,3,-17],[-8,5,-9]],'#dce0c9');
    face([[8,6,8],[59,3,-8],[60,3,-17],[8,5,-9]],'#c5d0be');
    face([[-48,3,-5],[-59,3,-8],[-60,3,-17],[-49,3,-15]],'#c97547');
    face([[48,3,-5],[59,3,-8],[60,3,-17],[49,3,-15]],'#c97547');
    face([[-9,5,-9],[-58,3,-17],[-54,1,-19],[-10,3,-13]],'#648c87');
    face([[9,5,-9],[58,3,-17],[54,1,-19],[10,3,-13]],'#527775');
    const flapY=model.flaps?-.5:2;
    for(const side of [-1,1]) face([[side*12,3,-13],[side*45,2,-17],[side*44,flapY,-22],[side*12,flapY,-18]],model.flaps?'#b6c4ad':'#96afa0');
    face([[-5,3,-25],[-24,5,-35],[-23,4,-42],[-3,3,-36]],'#dde0c7');
    face([[5,3,-25],[24,5,-35],[23,4,-42],[3,3,-36]],'#bac9b8');
    face([[-1,4,-31],[-1,24,-38],[-1,25,-44],[-1,3,-42]],'#ce794b');
    face([[1,4,-31],[1,24,-38],[1,25,-44],[1,3,-42]],'#e2b379');
    for(const x of [-25,25]){
      face([[x-4,1,-12],[x+4,1,-12],[x+4,3,10],[x,7,16],[x-4,3,10]],'#d2d8c7');
      face([[x-3,2,-13],[x+3,2,-13],[x+3,6,-13],[x-3,6,-13]],'#173341');
    }
    faces.sort((a,b)=>{
      const depth=f=>f.points.reduce((s,p)=>s+scene.project(p).depth/f.points.length,0);
      return depth(b)-depth(a);
    });
    ctx.save();ctx.globalAlpha=1;
    for(const f of faces)scene.polygon(ctx,f.points,f.color,'rgba(21,46,54,.5)');
    const canopyA=scene.project(point([0,19,5])),canopyB=scene.project(point([0,19,19]));
    ctx.strokeStyle='#c7d1bb';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(canopyA.x,canopyA.y);ctx.lineTo(canopyB.x,canopyB.y);ctx.stroke();
    for(const x of [-3,3]){
      const p=scene.project(point([x,13,4]));ctx.fillStyle=model.engineOut?'#d89861':'#8affd1';ctx.shadowColor=ctx.fillStyle;ctx.shadowBlur=6;ctx.fillRect(p.x-3,p.y-1,6,3);
    }ctx.shadowBlur=0;
    for(const [x,z]of[[-9,-9],[9,-9],[0,18]]){
      const top=scene.project(point([x,0,z])),wheel=scene.project(point([x,-7,z]));
      ctx.strokeStyle='#829b99';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(top.x,top.y);ctx.lineTo(wheel.x,wheel.y);ctx.stroke();
      ctx.fillStyle='#172b34';ctx.beginPath();ctx.ellipse(wheel.x,wheel.y,3,5,0,0,Math.PI*2);ctx.fill();
    }
    for(const x of [-25,25]){
      const p=scene.project(point([x,4,17]));ctx.save();ctx.translate(p.x,p.y);ctx.rotate(clock*model.speed*.04);
      ctx.strokeStyle=model.engineOut?'rgba(216,245,226,.16)':'rgba(216,245,226,.45)';ctx.lineWidth=3;ctx.beginPath();ctx.ellipse(0,0,19,5,0,0,Math.PI*2);ctx.stroke();ctx.restore();
    }
    for(const [x,color]of[[-60,'#f97662'],[60,'#8dffcc']]){const p=scene.project(point([x,4,-13]));ctx.fillStyle=color;ctx.shadowColor=color;ctx.shadowBlur=10;ctx.beginPath();ctx.arc(p.x,p.y,2.5,0,Math.PI*2);ctx.fill();}ctx.shadowBlur=0;
    const tail=scene.project(point([0,7,-33]));ctx.strokeStyle='#e5c79e';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(tail.x-4,tail.y);ctx.lineTo(tail.x+4,tail.y);ctx.stroke();
    if(model.flaps){ctx.fillStyle='#f7c57f';ctx.font='9px monospace';ctx.textAlign='center';ctx.fillText('FLAPS 25°',tail.x,tail.y+32);}
    ctx.restore();
  }
}
