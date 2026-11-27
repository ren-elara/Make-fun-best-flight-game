import test from 'node:test';
import assert from 'node:assert/strict';
import '../game/src/world.js';
import '../game/src/flight.js';

const A = globalThis.Aurelia;
const { contracts, terrain, runway, createFlight, stepFlight, checkGate } = A;
const airborne = (mission = 0) => ({ ...createFlight(mission), status: 'flying' });
const advance = (state, seconds, control = {}) => {
  for (let i = 0; i < Math.round(seconds * 60); i++) stepFlight(state, control, 1 / 60);
  return state;
};
const touchdown = (changes = {}) => ({ ...airborne(2), x: 0, y: 35.01, z: 4500, gear: true,
  speed: 44, pitch: -.025, vertical: -1, throttle: .2, gate: contracts[2].gates.length, ...changes });

test('three different contracts have safe starts and terrain-cleared gates', () => {
  assert.equal(contracts.length, 3);
  assert.equal(new Set(contracts.map((c) => c.name)).size, 3);
  assert.ok(contracts.some((c) => c.gates.some((g) => g.kind === 'rescue')));
  assert.ok(contracts.some((c) => c.dusk));
  for (const contract of contracts) {
    assert.ok(contract.start.y - terrain(contract.start.x, contract.start.z) > 70);
    for (const gate of contract.gates) assert.ok(gate.y - terrain(gate.x, gate.z) > 60);
  }
  assert.equal(terrain(runway.x, runway.z), runway.y);
});

test('neutral cruise preserves altitude while fuel burns', () => {
  const flight = airborne();
  const before = flight.fuel;
  advance(flight, 10);
  assert.equal(flight.status, 'flying');
  assert.equal(flight.y, contracts[0].start.y);
  assert.ok(flight.z > contracts[0].start.z + 600);
  assert.ok(flight.fuel < before);
  assert.ok(flight.speed > 60 && flight.speed < 80);
});

test('fixed-step identical controls produce identical state', () => {
  const first = airborne(), second = airborne();
  const controls = { roll: .2, pitch: .12, throttle: -.05, yaw: -.1 };
  advance(first, 12, controls);
  advance(second, 12, controls);
  assert.deepEqual(first, second);
  assert.notEqual(first.heading, 0);
  assert.ok(first.y > contracts[0].start.y);
});

test('pause and terminal outcomes freeze the simulation', () => {
  for (const status of ['briefing', 'paused', 'complete', 'crashed', 'incomplete']) {
    const state = { ...createFlight(), status };
    const before = structuredClone(state);
    advance(state, 2, { throttle: 1, pitch: 1 });
    assert.deepEqual(state, before);
  }
});

test('throttle is bounded and a dry engine loses speed into a stall', () => {
  const flight = { ...airborne(), y: 1400, fuel: .01 };
  advance(flight, 55, { throttle: -1 });
  assert.equal(flight.throttle, 0);
  assert.equal(flight.fuel, 0);
  assert.equal(flight.stall, true);
  assert.ok(flight.vertical < 0);
  assert.ok(flight.y < 1400);
  const fast = airborne();
  advance(fast, 8, { throttle: 1 });
  assert.equal(fast.throttle, 1);
});

test('a swept gate crossing cannot be skipped at high frame distances', () => {
  const state = airborne();
  const gate = contracts[0].gates[0];
  const previous = { x: gate.x - 20, y: gate.y + 10, z: gate.z - 100 };
  Object.assign(state, { x: gate.x + 20, y: gate.y - 10, z: gate.z + 100 });
  checkGate(state, previous);
  assert.equal(state.gate, 1);
  assert.equal(state.combo, 1);
  assert.equal(state.score, 300);
  checkGate(state, previous);
  assert.equal(state.gate, 1);
});

test('missed gates and reverse crossings do not award progress', () => {
  const state = airborne();
  const gate = contracts[0].gates[0];
  Object.assign(state, { x: gate.x + 500, y: gate.y, z: gate.z + 10 });
  checkGate(state, { ...state, z: gate.z - 10 });
  assert.equal(state.gate, 0);
  assert.match(state.message, /MISSED/);
  Object.assign(state, { x: gate.x, z: gate.z - 10 });
  checkGate(state, { ...state, z: gate.z + 10 });
  assert.equal(state.gate, 0);
});

test('rescue requires a 36–58 m/s gate crossing', () => {
  const state = { ...airborne(1), gate: 1 };
  const gate = contracts[1].gates[1];
  for (const speed of [30, 65]) {
    Object.assign(state, { x: gate.x, y: gate.y, z: gate.z + 10, speed });
    checkGate(state, { ...state, z: gate.z - 10 });
    assert.equal(state.gate, 1);
    assert.equal(state.rescued, false);
  }
  state.speed = 48;
  checkGate(state, { ...state, z: gate.z - 10 });
  assert.equal(state.gate, 2);
  assert.equal(state.rescued, true);
});

test('terrain collision explains the failure', () => {
  const state = { ...airborne(), x: -1550, z: 850, y: 5 };
  stepFlight(state);
  assert.equal(state.status, 'crashed');
  assert.match(state.reason, /Terrain strike/);
});

test('landing checks reject gear-up, excessive sink, bank, speed and heading', () => {
  const cases = [
    [{ gear: false }, /Gear-up/], [{ speed: 70 }, /too fast/], [{ pitch: -.2 }, /Hard landing/],
    [{ roll: .5 }, /Wing strike/], [{ heading: .5 }, /Align/],
  ];
  for (const [changes, reason] of cases) {
    const state = touchdown(changes);
    stepFlight(state);
    assert.equal(state.status, 'crashed', JSON.stringify(changes));
    assert.match(state.reason, reason);
  }
});

test('safe touchdown, straight rollout and braking complete the contract once', () => {
  const state = touchdown();
  stepFlight(state);
  assert.equal(state.grounded, true);
  assert.equal(state.status, 'flying');
  advance(state, 8, { brake: true, throttle: -1 });
  assert.equal(state.status, 'complete');
  assert.ok(state.score > 1000);
  const score = state.score;
  advance(state, 5, { brake: true });
  assert.equal(state.score, score);
});

test('early landing fails the contract rather than awarding unearned delivery', () => {
  const state = touchdown({ gate: 0 });
  stepFlight(state);
  advance(state, 8, { brake: true, throttle: -1 });
  assert.equal(state.status, 'incomplete');
  assert.equal(state.score, 0);
});

test('leaving the runway during rollout is a crash', () => {
  const state = { ...touchdown(), grounded: true, x: runway.width / 2 + 1 };
  stepFlight(state, { brake: true });
  assert.equal(state.status, 'crashed');
  assert.match(state.reason, /excursion/);
});

test('bounded time steps never produce non-finite state', () => {
  const state = airborne();
  for (const dt of [NaN, -5, 0, Infinity, .001, .02, 10]) stepFlight(state, {}, dt);
  for (const value of Object.values(state)) if (typeof value === 'number') assert.ok(Number.isFinite(value));
});

test('every contract can be flown from its real start to a complete stopped landing', () => {
  for (let mission = 0; mission < contracts.length; mission++) {
    const state = airborne(mission);
    for (let frame = 0; frame < 60 * 260 && state.status === 'flying'; frame++) {
      const gate = contracts[mission].gates[state.gate];
      const approach = !gate;
      state.gear = approach;
      const targetX = gate ? gate.x : 0;
      const targetZ = gate ? gate.z : 5100;
      const targetHeading = Math.atan2(targetX - state.x, Math.max(450, targetZ - state.z));
      const headingError = A.angle(targetHeading - state.heading);
      const targetHeight = gate ? gate.y - (state.gate === contracts[mission].gates.length - 1 ? 25 : 0) : 33.5;
      const vertical = A.clamp((targetHeight - state.y) * .5, approach ? -4.2 : -12, 7);
      const pitch = A.clamp(Math.asin(A.clamp(vertical / Math.max(32, state.speed), -.3, .3)) / .28, -1, 1);
      const desiredSpeed = approach ? 46 : gate.kind === 'rescue' ? 48 : mission === 2 ? 52 : 65;
      const desiredThrottle = A.clamp((desiredSpeed - 32 + (state.gear ? 8 : 0) + state.pitch * 50) / 60, 0, 1);
      stepFlight(state, { roll: A.clamp(headingError * 3 - state.roll * .1, -1, 1), pitch,
        throttle: state.grounded ? -1 : A.clamp((desiredThrottle - state.throttle) * 8, -1, 1),
        brake: state.grounded }, 1 / 60);
    }
    assert.equal(state.status, 'complete', `${contracts[mission].name}: ${JSON.stringify(state)}`);
    assert.equal(state.gate, contracts[mission].gates.length);
    assert.ok(state.fuel > 0);
    if (mission === 1) assert.equal(state.rescued, true);
  }
});
