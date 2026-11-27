/* Fixed-step, speed-dependent flight dynamics and sortie outcomes. */
(() => {
  'use strict';
  const A = globalThis.Aurelia;
  const { clamp, mix, angle, contracts, terrain, runway, onRunway } = A;
  const neutral = { pitch: 0, roll: 0, yaw: 0, throttle: 0, brake: false };

  function createFlight(mission = 0) {
    const contract = contracts[mission];
    if (!contract) throw new Error('Unknown flight contract');
    return { ...contract.start, mission, pitch: 0, roll: 0, throttle: mission === 2 ? .39 : .62,
      fuel: contract.fuel, hull: 100, gate: 0, elapsed: 0, score: 0, combo: 0,
      gear: false, grounded: false, vertical: 0, status: 'briefing', reason: '',
      message: 'LANTERN TOWER / You are cleared for the coast.', messageTime: 6,
      stall: false, rescued: false, warning: '', lastGateZ: contract.start.z };
  }

  function announce(state, text, seconds = 5) {
    state.message = text;
    state.messageTime = seconds;
  }

  function crash(state, reason) {
    state.status = 'crashed';
    state.reason = reason;
    state.hull = 0;
    state.speed = 0;
  }

  function landingIssue(state) {
    if (!onRunway(state.x, state.z)) return 'Terrain strike. Stay above the islands and touch down on the lit runway.';
    if (!state.gear) return 'Gear-up landing. Lower the landing gear with G before touchdown.';
    if (state.speed > 57) return 'Touchdown too fast. Reduce throttle early and approach below 57 m/s.';
    if (state.speed < 30) return 'The aircraft stalled onto the runway. Maintain at least 30 m/s until touchdown.';
    if (state.vertical < -4.5) return 'Hard landing. Flare gently and keep descent under 4.5 m/s.';
    if (Math.abs(state.roll) > .19) return 'Wing strike. Level the wings before touchdown.';
    if (Math.abs(angle(state.heading - runway.heading)) > .19) return 'Runway excursion. Align with heading 000° before touchdown.';
    return null;
  }

  function checkGate(state, previous) {
    const target = contracts[state.mission].gates[state.gate];
    if (!target || previous.z >= target.z || state.z < target.z) return;
    const fraction = (target.z - previous.z) / (state.z - previous.z);
    const x = mix(previous.x, state.x, fraction);
    const y = mix(previous.y, state.y, fraction);
    const miss = Math.hypot(x - target.x, y - target.y);
    if (miss > target.radius) {
      state.combo = 0;
      announce(state, 'MISSED GATE / Turn back and cross it flying north.');
      return;
    }
    if (target.kind === 'rescue' && (state.speed < 36 || state.speed > 58)) {
      announce(state, 'RESCUE PASS TOO FAST OR SLOW / Cross at 36–58 m/s. Circle back.');
      state.combo = 0;
      return;
    }
    const precision = Math.round(100 * (1 - miss / target.radius));
    state.gate++;
    state.combo++;
    state.score += 200 + precision * state.combo;
    if (target.kind === 'rescue') state.rescued = true;
    const last = state.gate === contracts[state.mission].gates.length;
    announce(state, target.kind === 'rescue' ? 'CREW ABOARD / Bring them safely to Lantern Field.' :
      last ? 'LANTERN TOWER / Cleared runway 00. Gear down. Land and hold B to brake.' : `RELAY LOCKED / Precision ${precision}% · chain ×${state.combo}`);
  }

  function stepFlight(state, control = neutral, dt = 1 / 60) {
    if (state.status !== 'flying') return state;
    dt = clamp(Number.isFinite(dt) ? dt : 0, 0, .05);
    const input = { ...neutral, ...control };
    const previous = { x: state.x, y: state.y, z: state.z };
    state.elapsed += dt;
    state.messageTime = Math.max(0, state.messageTime - dt);
    state.throttle = clamp(state.throttle + clamp(input.throttle, -1, 1) * dt * .33, 0, 1);
    const engine = state.fuel > 0 ? state.throttle : 0;
    state.fuel = Math.max(0, state.fuel - (.065 + engine * .29) * dt);
    const authority = clamp(state.speed / 48, .18, 1.4);
    const desiredRoll = clamp(input.roll, -1, 1) * 1.02;
    state.roll = mix(state.roll, desiredRoll, 1 - Math.exp(-dt * 2.4 * authority));
    const desiredPitch = clamp(input.pitch, -1, 1) * .28;
    state.pitch = mix(state.pitch, desiredPitch, 1 - Math.exp(-dt * 1.8 * authority));
    const bankDrag = Math.abs(state.roll) * 5;
    const gearDrag = state.gear ? 8 : 0;
    const targetSpeed = 32 + engine * 60 - bankDrag - gearDrag - state.pitch * 50;
    state.stall = !state.grounded && state.speed < 35;
    const sink = state.stall ? (35 - state.speed) * .9 + 3 : 0;
    if (!state.grounded) {
      state.speed += (targetSpeed - state.speed) * .22 * dt;
      state.heading = angle(state.heading + (Math.tan(state.roll) * 9.81 / Math.max(25, state.speed) + clamp(input.yaw, -1, 1) * .14) * dt);
      const wind = Math.sin(state.elapsed * .27) * (state.mission === 1 ? 2.5 : 1);
      state.vertical = Math.sin(state.pitch) * state.speed - sink;
      state.x += (Math.sin(state.heading) * state.speed + wind) * dt;
      state.z += Math.cos(state.heading) * state.speed * dt;
      state.y += state.vertical * dt;
      checkGate(state, previous);
      if (state.speed > 91) state.hull = Math.max(0, state.hull - (state.speed - 91) * dt * .8);
      const surface = Math.max(0, terrain(state.x, state.z));
      if (state.y <= surface + 3) {
        const issue = landingIssue(state);
        if (issue) crash(state, issue);
        else {
          state.grounded = true;
          state.y = runway.y + 3;
          state.pitch = 0;
          state.roll = 0;
          state.vertical = 0;
          announce(state, 'TOUCHDOWN / Hold B to brake. Keep the aircraft on the runway.');
        }
      }
    } else {
      state.roll = 0;
      state.pitch = 0;
      state.vertical = 0;
      state.heading = angle(state.heading + input.yaw * dt * .12);
      const brake = input.brake ? 12 : 1.8;
      state.speed = Math.max(0, state.speed + (engine * 5 - brake) * dt);
      state.x += Math.sin(state.heading) * state.speed * dt;
      state.z += Math.cos(state.heading) * state.speed * dt;
      if (!onRunway(state.x, state.z)) crash(state, 'Runway excursion. Brake earlier and keep your rollout straight.');
      else if (state.speed < 2) {
        if (state.gate !== contracts[state.mission].gates.length) {
          state.status = 'incomplete';
          state.reason = 'Safe landing, but the route is incomplete. Cross every gate before returning.';
        } else {
          state.status = 'complete';
          state.score += Math.round(state.fuel * 15 + state.hull * 8 + Math.max(0, contracts[state.mission].time - state.elapsed) * 5);
          state.reason = state.rescued ? 'Weather crew delivered safely. The coast has its keepers back.' : 'Cargo delivered. The Lantern chain is burning bright again.';
        }
      }
    }
    if (state.status === 'flying' && state.hull <= 0) crash(state, 'Airframe failure. Keep your speed below the structural limit.');
    if (state.status === 'flying' && Math.hypot(state.x, state.z - 2400) > 12500) crash(state, 'Outside the patrol area. Follow the route map to stay near the coast.');
    state.warning = state.stall ? 'STALL · NOSE DOWN' : state.fuel < 12 ? 'LOW FUEL' : state.y - Math.max(0, terrain(state.x, state.z)) < 60 && !onRunway(state.x, state.z) ? 'TERRAIN · PULL UP' : '';
    return state;
  }

  Object.assign(A, { createFlight, stepFlight, checkGate, landingIssue, announce });
})();
