/* Software 3D: original faceted terrain, runway lights, gates and courier mesh. */
(() => {
  'use strict';
  const A = globalThis.Aurelia;
  const { clamp, mix, terrain, contracts, runway } = A;
  const TAU = Math.PI * 2;
  const tint = (rgb, amount, night = false) => {
    const light = night ? .34 : 1;
    return `rgb(${rgb.map((v) => Math.round(clamp(v * amount * light, 0, 255))).join(',')})`;
  };

  class FlightRenderer {
    constructor(canvas) {
      this.canvas = canvas;
      this.context = canvas.getContext('2d', { alpha: false });
      this.width = 0;
      this.height = 0;
      this.camera = null;
      this.close = false;
      this.polygons = [];
      this.terrainCache = new Map();
      this.resize();
    }

    resize() {
      this.width = this.canvas.width = Math.max(320, Math.floor(innerWidth));
      this.height = this.canvas.height = Math.max(240, Math.floor(innerHeight));
      this.focal = Math.min(this.width * .81, this.height * 1.3);
    }

    setCamera(state) {
      const behind = this.close ? 35 : 53;
      const above = this.close ? 8 : 13;
      this.camera = { x: state.x - Math.sin(state.heading) * behind, y: state.y + above,
        z: state.z - Math.cos(state.heading) * behind, heading: state.heading, pitch: -.105 + state.pitch * .34 };
      this.sinH = Math.sin(this.camera.heading);
      this.cosH = Math.cos(this.camera.heading);
      this.sinP = Math.sin(this.camera.pitch);
      this.cosP = Math.cos(this.camera.pitch);
    }

    project(point) {
      const dx = point.x - this.camera.x;
      const dy = point.y - this.camera.y;
      const dz = point.z - this.camera.z;
      const side = dx * this.cosH - dz * this.sinH;
      const forward = dx * this.sinH + dz * this.cosH;
      const depth = forward * this.cosP + dy * this.sinP;
      if (depth <= 3) return null;
      const up = dy * this.cosP - forward * this.sinP;
      return { x: this.width / 2 + side * this.focal / depth,
        y: this.height * .435 - up * this.focal / depth, depth };
    }

    face(points, color, stroke = null) {
      const vertices = points.map((p) => this.project(p));
      if (vertices.some((p) => p === null)) return;
      if (vertices.every((p) => p.x < -400) || vertices.every((p) => p.x > this.width + 400) ||
        vertices.every((p) => p.y < -400) || vertices.every((p) => p.y > this.height + 400)) return;
      this.polygons.push({ vertices, color, stroke, depth: vertices.reduce((n, p) => n + p.depth, 0) / vertices.length });
    }

    line(a, b, color, width = 1) {
      const from = this.project(a), to = this.project(b);
      if (!from || !to) return;
      const c = this.context;
      c.beginPath();
      c.moveTo(from.x, from.y);
      c.lineTo(to.x, to.y);
      c.strokeStyle = color;
      c.lineWidth = width;
      c.stroke();
    }

    drawSky(state) {
      const c = this.context;
      const night = contracts[state.mission].dusk;
      const sky = c.createLinearGradient(0, 0, 0, this.height * .77);
      sky.addColorStop(0, night ? '#122438' : '#4e7c91');
      sky.addColorStop(.53, night ? '#6f6578' : '#9ab7bc');
      sky.addColorStop(1, night ? '#d59e82' : '#e3d4b4');
      c.fillStyle = sky;
      c.fillRect(0, 0, this.width, this.height);
      const sun = this.project({ x: -22000, y: 6500, z: 70000 });
      if (sun) {
        const halo = c.createRadialGradient(sun.x, sun.y, 2, sun.x, sun.y, 190);
        halo.addColorStop(0, night ? '#f8d8ac88' : '#fff4d9aa');
        halo.addColorStop(1, '#f8d8ac00');
        c.fillStyle = halo;
        c.fillRect(sun.x - 190, sun.y - 190, 380, 380);
        c.beginPath();
        c.arc(sun.x, sun.y, night ? 14 : 22, 0, TAU);
        c.fillStyle = night ? '#ffe7be' : '#fff5d5';
        c.fill();
      }
      // Layered, soft-edged cloud banks sit behind the terrain.
      for (let i = 0; i < 16; i++) {
        const cloud = this.project({ x: Math.sin(i * 2.3) * 16000, y: 1600 + Math.sin(i * 4) * 700, z: 10000 + i * 1800 });
        if (!cloud) continue;
        c.fillStyle = night ? '#d8bac31c' : '#eff2df39';
        for (let j = 0; j < 4; j++) {
          c.beginPath();
          c.ellipse(cloud.x + j * 36, cloud.y - Math.sin(j) * 9, 90 - j * 9, 13 + j * 3, -.03, 0, TAU);
          c.fill();
        }
      }
      if (night) {
        c.fillStyle = '#f4e5ca88';
        for (let i = 0; i < 45; i++) c.fillRect((i * 157.7) % this.width, (i * i * 7.3) % (this.height * .22), 1, 1);
      }
      const horizon = this.height * .435 + Math.tan(this.camera.pitch) * this.focal;
      const water = c.createLinearGradient(0, horizon, 0, this.height);
      water.addColorStop(0, night ? '#414757' : '#91adae');
      water.addColorStop(1, night ? '#102c3b' : '#2e6b7a');
      c.fillStyle = water;
      c.fillRect(0, horizon, this.width, this.height - horizon);
    }

    terrainPoint(x, z) {
      const key = `${x},${z}`;
      let result = this.terrainCache.get(key);
      if (result) return result;
      const height = terrain(x, z);
      result = { x, y: Math.max(0, height), z, ground: height };
      this.terrainCache.set(key, result);
      if (this.terrainCache.size > 18000) this.terrainCache.clear();
      return result;
    }

    drawTerrain(state) {
      const night = contracts[state.mission].dusk;
      const step = 240;
      const centerX = Math.round(state.x / step) * step;
      const centerZ = Math.round(state.z / step) * step;
      for (let iz = -32; iz < 32; iz++) {
        for (let ix = -32; ix < 32; ix++) {
          const x = centerX + ix * step, z = centerZ + iz * step;
          const forward = (x - state.x) * this.sinH + (z - state.z) * this.cosH;
          const side = (x - state.x) * this.cosH - (z - state.z) * this.sinH;
          if (forward < -480 || Math.abs(side) > forward * 1.4 + 700) continue;
          const a = this.terrainPoint(x, z), b = this.terrainPoint(x + step, z);
          const d = this.terrainPoint(x, z + step), e = this.terrainPoint(x + step, z + step);
          const triangles = [[a, b, d], [b, e, d]];
          for (let t = 0; t < 2; t++) {
            const vertices = triangles[t];
            const height = vertices.reduce((n, p) => n + p.ground, 0) / 3;
            const shade = .84 + Math.sin(ix * 3.7 + iz * 1.3 + t) * .045 + (a.y - e.y) * .00065;
            let rgb = height < 0 ? [46, 107, 122] : height < 28 ? [179, 169, 124] : height < 230 ? [91, 133, 113] : height < 560 ? [92, 121, 115] : [154, 165, 152];
            const distance = Math.hypot(x - state.x, z - state.z);
            const fog = clamp((distance - 2900) / 7000, 0, .73);
            rgb = rgb.map((v, i) => mix(v, night ? [111, 101, 124][i] : [172, 189, 184][i], fog));
            const color = tint(rgb, shade, night);
            this.face(vertices, color, color);
          }
        }
      }
    }

    drawField(state) {
      const x = runway.x, y = runway.y + 1, z = runway.z;
      const quad = (left, right, near, far, height, color) => this.face([
        { x: left, y: height, z: near }, { x: right, y: height, z: near },
        { x: right, y: height, z: far }, { x: left, y: height, z: far },
      ], color);
      quad(x - 110, x + 110, z - 760, z + 760, y - .4, '#7a8064');
      quad(x - 36, x + 36, z - 680, z + 680, y, '#344b50');
      quad(x - 35, x - 33, z - 665, z + 665, y + .1, '#c9d3b7');
      quad(x + 33, x + 35, z - 665, z + 665, y + .1, '#c9d3b7');
      for (let i = 0; i < 17; i++) quad(x - 1.5, x + 1.5, z - 635 + i * 75, z - 605 + i * 75, y + .2, '#f2e7c9');
      for (let i = -4; i <= 4; i++) if (i !== 0) quad(i * 6 - 1.6, i * 6 + 1.6, z - 645, z - 598, y + .3, '#eee8d4');
      // Hangars and a small lighthouse give the coast a human scale.
      this.box(-195, y + 13, z + 250, 75, 25, 110, '#596b68', '#c3bda1');
      this.box(-175, y + 8, z + 80, 45, 15, 70, '#537477', '#b8bfac');
      this.box(115, y + 35, z - 170, 18, 70, 18, '#b2a78b', '#e5d4ae');
      this.box(115, y + 73, z - 170, 27, 7, 27, '#233e4b', '#e1cda2');
      for (let i = 0; i < 30; i++) {
        for (const side of [-1, 1]) this.lamp({ x: x + side * 38, y: y + 1.5, z: z - 680 + i * 47 }, '#f4dfad', 2.7);
      }
      for (let i = 0; i < 11; i++) {
        const az = z - 710 - i * 42;
        for (const side of [-1, 0, 1]) this.lamp({ x: x + side * 9, y: 34, z: az }, i > 6 ? '#f4bc86' : '#b3efce', 3);
      }
      for (const side of [-1, 1]) this.lamp({ x: side * 32, y: 34, z: z - 675 }, '#82ffd1', 4);
      const label = this.project({ x: 0, y: 90, z: 4900 });
      if (label && state.gate === contracts[state.mission].gates.length) this.labels.push({ ...label, text: 'LANTERN FIELD / RWY 00', color: '#c3e9ce' });
    }

    box(x, y, z, width, height, depth, side, top) {
      const p = (dx, dy, dz) => ({ x: x + dx * width / 2, y: y + dy * height / 2, z: z + dz * depth / 2 });
      this.face([p(-1, -1, -1), p(1, -1, -1), p(1, 1, -1), p(-1, 1, -1)], side);
      this.face([p(-1, -1, -1), p(-1, 1, -1), p(-1, 1, 1), p(-1, -1, 1)], side);
      this.face([p(1, -1, -1), p(1, -1, 1), p(1, 1, 1), p(1, 1, -1)], side);
      this.face([p(-1, 1, -1), p(1, 1, -1), p(1, 1, 1), p(-1, 1, 1)], top);
    }

    lamp(point, color, radius = 3) {
      const p = this.project(point);
      if (p && p.x > -30 && p.x < this.width + 30 && p.y > -30 && p.y < this.height + 30) this.lights.push({ ...p, color, radius });
    }

    drawGates(state) {
      const gates = contracts[state.mission].gates;
      for (let i = state.gate; i < gates.length; i++) {
        const g = gates[i];
        const active = i === state.gate;
        const rgb = g.kind === 'rescue' ? '#a2ecf1' : active ? '#ffe0a2' : '#b9cdba';
        const segments = 48;
        for (let k = 0; k < segments; k++) {
          const a = k / segments * TAU, b = (k + .77) / segments * TAU;
          const outer = g.radius, inner = g.radius - (active ? 4 : 2);
          const point = (angle, radius) => ({ x: g.x + Math.cos(angle) * radius, y: g.y + Math.sin(angle) * radius, z: g.z });
          this.face([point(a, inner), point(a, outer), point(b, outer), point(b, inner)], rgb);
        }
        this.lamp({ x: g.x, y: g.y - g.radius, z: g.z }, rgb, active ? 4 : 2);
        if (active) {
          const label = this.project({ x: g.x, y: g.y + g.radius + 23, z: g.z });
          if (label) this.labels.push({ ...label, text: g.kind === 'rescue' ? 'RESCUE / 36–58 M/S' : `RELAY ${String(i + 1).padStart(2, '0')} / ${Math.round(Math.hypot(g.x - state.x, g.z - state.z))} M`, color: rgb });
        }
      }
    }

    drawCourier(state) {
      // A twin-boom, high-wing electric courier with an amber rescue livery.
      const sinR = Math.sin(-state.roll), cosR = Math.cos(state.roll);
      const sinP = Math.sin(state.pitch), cosP = Math.cos(state.pitch);
      const sinH = Math.sin(state.heading), cosH = Math.cos(state.heading);
      const p = (x, y, z) => {
        const rx = x * cosR - y * sinR, ry = x * sinR + y * cosR;
        const py = ry * cosP + z * sinP, pz = z * cosP - ry * sinP;
        return { x: state.x + rx * cosH + pz * sinH, y: state.y + py, z: state.z - rx * sinH + pz * cosH };
      };
      const face = (points, color) => this.face(points.map((v) => p(...v)), color, '#18313c55');
      const cream = '#e2dfc4', amber = '#e0ad5c', dark = '#2b4652', metal = '#829f9f';
      face([[-1.8, -.2, -5], [1.8, -.2, -5], [1.3, 1.3, 3.5], [0, 1.7, 6], [-1.3, 1.3, 3.5]], cream);
      face([[-1.8, -.2, -5], [-1.3, 1.3, 3.5], [0, -.5, 6], [-1.3, -1.2, -2]], metal);
      face([[1.8, -.2, -5], [1.3, 1.3, 3.5], [0, -.5, 6], [1.3, -1.2, -2]], '#657f85');
      face([[-1.2, 1.35, 1.3], [1.2, 1.35, 1.3], [.9, 1.9, 3.4], [-.9, 1.9, 3.4]], '#416b78');
      face([[-.9, 1.9, 3.4], [.9, 1.9, 3.4], [0, 1.7, 5.1]], '#77a9b2');
      face([[-17, .8, -.2], [-17, .8, -2.6], [-2, 1, -3], [2, 1, -3], [17, .8, -2.6], [17, .8, -.2], [1, 1, 1.4], [-1, 1, 1.4]], cream);
      face([[-17, .84, -.2], [-17, .84, -2.6], [-13, .92, -2.7], [-13, .92, .2]], amber);
      face([[17, .84, -.2], [17, .84, -2.6], [13, .92, -2.7], [13, .92, .2]], amber);
      for (const side of [-1, 1]) {
        const x = side * 5;
        face([[x - .4, .7, 0], [x + .4, .7, 0], [x + .3, .3, -10], [x - .3, .3, -10]], dark);
        face([[x - .55, .9, 1.4], [x + .55, .9, 1.4], [x + .7, .5, -1.7], [x - .7, .5, -1.7]], metal);
        face([[x, .5, -9.5], [x, 4.2, -10.5], [x, 3.5, -7.6], [x, .5, -6.2]], amber);
        face([[x - 2, .9, -9.7], [x + 2, .9, -9.7], [x + 1.6, .9, -7.4], [x - 1.6, .9, -7.4]], cream);
        if (state.gear) {
          face([[x - .35, .3, -1], [x + .35, .3, -1], [x + .35, -2.5, -1], [x - .35, -2.5, -1]], '#657877');
          face([[x - .6, -2, -1.7], [x + .6, -2, -1.7], [x + .6, -3, -.3], [x - .6, -3, -.3]], '#172b35');
        }
        // Two translucent propeller disks, animated by local simulation time.
        for (let blade = 0; blade < 3; blade++) {
          const rotation = state.elapsed * (10 + state.throttle * 35) + blade * TAU / 3;
          const dx = Math.cos(rotation) * 2.7, dy = Math.sin(rotation) * 2.7;
          face([[x - .15, .7, 1.6], [x + dx, .7 + dy, 1.6], [x + dx + .3, .7 + dy - .2, 1.6], [x + .15, .7, 1.6]], '#dae7ce88');
        }
      }
      face([[-5, .91, -9], [5, .91, -9], [5, .91, -7], [-5, .91, -7]], cream);
      face([[-1.6, 1.03, -3], [1.6, 1.03, -3], [1.5, 1.1, -1.6], [-1.5, 1.1, -1.6]], amber);
      this.lamp(p(-17, 1, -.4), '#ff907a', 3);
      this.lamp(p(17, 1, -.4), '#a1f9ce', 3);
      this.lamp(p(0, 1.8, 1.8), '#ffe6a8', 1.6);
    }

    render(state) {
      this.setCamera(state);
      this.polygons.length = 0;
      this.lights = [];
      this.labels = [];
      this.drawSky(state);
      this.drawTerrain(state);
      this.drawField(state);
      this.drawGates(state);
      this.drawCourier(state);
      const c = this.context;
      this.polygons.sort((a, b) => b.depth - a.depth);
      for (const face of this.polygons) {
        c.beginPath();
        face.vertices.forEach((p, i) => i === 0 ? c.moveTo(p.x, p.y) : c.lineTo(p.x, p.y));
        c.closePath();
        c.fillStyle = face.color;
        c.fill();
        if (face.stroke) { c.strokeStyle = face.stroke; c.lineWidth = .6; c.stroke(); }
      }
      for (const light of this.lights) {
        c.shadowBlur = 10;
        c.shadowColor = light.color;
        c.fillStyle = light.color;
        c.beginPath();
        c.arc(light.x, light.y, light.radius, 0, TAU);
        c.fill();
      }
      c.shadowBlur = 0;
      c.textAlign = 'center';
      c.font = '10px monospace';
      for (const label of this.labels) {
        if (label.x < 290 || label.x > this.width - 180 || label.y < 170 || label.y > this.height - 200) continue;
        c.fillStyle = '#15343cbb';
        c.fillRect(label.x - 104, label.y - 12, 208, 22);
        c.fillStyle = label.color;
        c.fillText(label.text, label.x, label.y + 2);
      }
      // Restrained corner vignette and a fixed flight-path reticle.
      const shade = c.createRadialGradient(this.width / 2, this.height * .43, this.height * .28, this.width / 2, this.height * .43, this.width * .75);
      shade.addColorStop(0, '#071f2b00');
      shade.addColorStop(1, '#071f2b70');
      c.fillStyle = shade;
      c.fillRect(0, 0, this.width, this.height);
      c.strokeStyle = '#e8e6c577';
      c.lineWidth = 1;
      c.beginPath();
      const cx = this.width / 2, cy = this.height * .435;
      c.arc(cx, cy, 5, 0, TAU);
      c.moveTo(cx - 23, cy); c.lineTo(cx - 9, cy);
      c.moveTo(cx + 9, cy); c.lineTo(cx + 23, cy);
      c.moveTo(cx, cy - 13); c.lineTo(cx, cy - 7);
      c.stroke();
    }
  }

  A.FlightRenderer = FlightRenderer;
})();
