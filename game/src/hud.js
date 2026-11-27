/* Readable flight instruments, route map, and grounded debriefing text. */
(() => {
  'use strict';
  const A = globalThis.Aurelia;
  const { contracts, targetFor, terrain, runway, clamp } = A;
  const element = (id) => document.getElementById(id);
  const text = (id, value) => { const node = element(id); if (node.textContent !== value) node.textContent = value; };
  const pad = (value, length = 3) => String(Math.round(value)).padStart(length, '0');

  class FlightHud {
    constructor() {
      this.map = element('map').getContext('2d');
      this.best = {};
      try { this.best = JSON.parse(localStorage.getItem('aurelia-flight-best') || '{}') || {}; } catch { /* Saving is optional in offline and private browsing. */ }
      this.lastStatus = '';
    }

    select(mission) {
      const contract = contracts[mission];
      text('brief-description', contract.description);
      text('best', this.best[mission] ? `PERSONAL BEST / ${this.best[mission]} POINTS` : 'YOUR COAST. YOUR CALL.');
      for (const button of document.querySelectorAll('[data-mission]')) {
        button.classList.toggle('selected', Number(button.dataset.mission) === mission);
        button.setAttribute('aria-pressed', String(Number(button.dataset.mission) === mission));
      }
    }

    drawMap(state) {
      const c = this.map;
      const w = c.canvas.width, h = c.canvas.height;
      c.fillStyle = '#102c38';
      c.fillRect(0, 0, w, h);
      const project = (x, z) => ({ x: w / 2 + x / 46, y: h - 12 - (z + 650) / 55 });
      for (let y = 12; y < h; y += 3) for (let x = 0; x < w; x += 3) {
        const worldX = (x - w / 2) * 46, worldZ = (h - 12 - y) * 55 - 650;
        if (terrain(worldX, worldZ) > 0) { c.fillStyle = '#527568'; c.fillRect(x, y, 3, 3); }
      }
      const gates = contracts[state.mission].gates;
      c.strokeStyle = '#d2bd8377';
      c.setLineDash([2, 3]);
      c.beginPath();
      const first = project(contracts[state.mission].start.x, contracts[state.mission].start.z);
      c.moveTo(first.x, first.y);
      for (const gate of gates) { const p = project(gate.x, gate.z); c.lineTo(p.x, p.y); }
      const field = project(runway.x, runway.z);
      c.lineTo(field.x, field.y);
      c.stroke();
      c.setLineDash([]);
      for (let i = 0; i < gates.length; i++) {
        const p = project(gates[i].x, gates[i].z);
        c.strokeStyle = i < state.gate ? '#75bba0' : '#f1d399';
        c.beginPath(); c.arc(p.x, p.y, i === state.gate ? 4 : 2, 0, Math.PI * 2); c.stroke();
      }
      c.fillStyle = '#c7e5ca';
      c.fillRect(field.x - 2, field.y - 5, 4, 10);
      const plane = project(state.x, state.z);
      c.save();
      c.translate(clamp(plane.x, 5, w - 5), clamp(plane.y, 15, h - 5));
      c.rotate(state.heading);
      c.fillStyle = '#fff0b8';
      c.beginPath(); c.moveTo(0, -6); c.lineTo(4, 4); c.lineTo(0, 2); c.lineTo(-4, 4); c.closePath(); c.fill();
      c.restore();
      c.fillStyle = '#a0c3c1'; c.font = '8px monospace'; c.fillText('ROUTE / N ↑', 6, 9);
    }

    update(state, mouse) {
      const contract = contracts[state.mission];
      const target = targetFor(state);
      const heading = (state.heading * 180 / Math.PI + 360) % 360;
      const seconds = Math.floor(state.elapsed);
      text('clock', `${pad(Math.floor(seconds / 60), 2)}:${pad(seconds % 60, 2)}`);
      text('sector', `${pad(state.mission + 1, 2)} / ${contract.sector}`);
      text('mission-title', contract.name);
      text('objective', state.grounded ? 'Hold B to brake. Keep the rollout straight.' : state.rescued ? 'Protect the weather crew. Keep bank gentle until Lantern Field.' : target.kind === 'runway' ? 'Land runway 00. Gear down · slow descent · brake.' : target.kind === 'rescue' ? 'Recover the weather crew. Cross at 36–58 m/s.' : 'Follow the amber gates to Lantern Field.');
      text('gate-count', state.gate === contract.gates.length ? 'CLEARED TO LAND / RWY 00' : `GATE ${pad(state.gate + 1, 2)} / ${pad(contract.gates.length, 2)}`);
      text('distance', `${(Math.hypot(target.x - state.x, target.z - state.z) / 1000).toFixed(1)} KM`);
      element('route-progress').style.width = `${state.gate / contract.gates.length * 100}%`;
      text('speed', pad(state.speed));
      text('altitude', pad(state.y, 4));
      text('vertical', `${state.vertical < 0 ? '' : '+'}${state.vertical.toFixed(1)}`);
      text('heading', `${pad(heading % 360)}°`);
      const nearest = Math.round(heading / 30) * 30;
      text('compass', `${pad((nearest + 330) % 360)} · · ${pad(nearest % 360)} · · ${pad((nearest + 30) % 360)}`);
      text('throttle', `${Math.round(state.throttle * 100)}%`);
      text('gear', state.gear ? 'GEAR DOWN' : 'GEAR UP');
      text('fuel', `${Math.ceil(state.fuel)}%`);
      text('hull', `${Math.ceil(state.hull)}%`);
      element('fuel-bar').style.width = `${state.fuel}%`;
      element('hull-bar').style.width = `${state.hull}%`;
      const crewVisible = state.mission === 1 && state.rescued;
      element('crew-resource').classList.toggle('hidden', !crewVisible);
      if (crewVisible) {
        text('crew', `${Math.ceil(state.crew)}%`);
        element('crew-bar').style.width = `${state.crew}%`;
      }
      element('fuel-bar').style.background = state.fuel < 15 ? '#ff9271' : '';
      text('notice', state.messageTime > 0 ? state.message : '');
      text('warning', state.warning);
      text('wind', `WIND VARIABLE / ${state.mission === 1 ? '03' : '01'} M/S`);
      text('control-mode', mouse ? 'MOUSE STEERING · M RELEASE · V CAMERA · P PAUSE' : 'M MOUSE · V CAMERA · P PAUSE');
      element('attitude-ball').style.transform = `rotate(${-state.roll * 180 / Math.PI}deg) translateY(${state.pitch * 90}px)`;
      this.drawMap(state);
      element('briefing').classList.toggle('hidden', state.status !== 'briefing');
      element('pause').classList.toggle('hidden', state.status !== 'paused');
      const ended = ['complete', 'crashed', 'incomplete'].includes(state.status);
      element('result').classList.toggle('hidden', !ended);
      if (ended && this.lastStatus !== state.status) {
        const success = state.status === 'complete';
        text('result-label', success ? 'CONTRACT FULFILLED' : state.status === 'incomplete' ? 'ROUTE INCOMPLETE' : 'AIRCRAFT LOST');
        text('result-title', success ? 'Welcome home.' : state.status === 'incomplete' ? 'One more relay.' : 'The coast remembers.');
        text('result-message', state.reason);
        text('result-score', success ? `${state.score} POINTS` : 'REVIEW · RESTART · RETURN');
        if (success && state.score > (this.best[state.mission] || 0)) {
          this.best[state.mission] = state.score;
          try { localStorage.setItem('aurelia-flight-best', JSON.stringify(this.best)); } catch { /* A blocked score save never interrupts flight. */ }
        }
      }
      this.lastStatus = state.status;
    }
  }

  A.FlightHud = FlightHud;
})();
