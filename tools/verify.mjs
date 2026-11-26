import assert from 'node:assert/strict';
import { FlightModel } from '../game/src/flight.js';
import { WORLD, clamp } from '../game/src/config.js';
import { withBrowser, openGame } from './browser.mjs';

const neutral = () => ({ roll: 0, pitch: 0, yaw: 0, throttle: 0, flap: false });
const step = (flight, seconds, controls = neutral()) => {
  for (let i = 0; i < Math.round(seconds * 60); i++) flight.update(1 / 60, controls);
};
const flight = (index = 0) => { const model = new FlightModel(); model.launch(index); return model; };

// Input changes must affect the flight path, and pausing must freeze every physical value.
const turning = flight(); step(turning, 4, { ...neutral(), roll: .8, pitch: .3, throttle: 1 });
assert(turning.x > 25 && turning.heading > 10 && turning.altitude > 2130 && turning.throttle > .9);
turning.paused = true; const paused = JSON.stringify(turning); step(turning, 3, { ...neutral(), roll: -1 }); assert.equal(JSON.stringify(turning), paused);
const missed = flight(); missed.altitude = 4000; step(missed, 40); assert.equal(missed.rings, 0, 'elapsed distance must not award missed gates');
const impact = flight(); impact.altitude = 1; step(impact, .1); assert(impact.crashed && impact.crashReason.includes('Terrain'));
const hard = flight(2); Object.assign(hard, { x: 0, z: 4200, altitude: 110, verticalSpeed: -8 }); hard.checkTouchdown(); assert(hard.crashed);
const offStrip = flight(2); Object.assign(offStrip, { x: 180, z: 4200, altitude: 110 }); offStrip.checkTouchdown(); assert(offStrip.crashed);
const stall = flight(); Object.assign(stall, { throttle: 0, speed: 62 }); step(stall, 8); assert(stall.altitude < 2000 && stall.damage > 0 && stall.cargoIntegrity < 100);
const empty = flight(); empty.fuel = 0; step(empty, 3, { ...neutral(), throttle: 1 }); assert.equal(empty.throttle, 0);
assert(empty.altitude < 2085, 'an empty tank must force a descending glide');
assert(empty.warning.includes('ENGINE OUT'));
const flapStress = flight(); flapStress.flaps = true; step(flapStress, 1);
assert(flapStress.damage > 0 && flapStress.cargoIntegrity < 100, 'high-speed flaps must stress hull and cargo');
const healthy = flight(), damaged = flight(); damaged.damage = .7;
step(healthy, 10); step(damaged, 10); assert(damaged.speed < healthy.speed - 4, 'hull damage must reduce engine performance');
const banked = flight(); step(banked, 3, { ...neutral(), roll: 1 });
assert(banked.loadFactor > 1.3 && banked.stallSpeed > 90, 'banking must raise load and stall speed');

// A gate is a geometric crossing, not a reward for hovering near its marker.
const gate = flight(); gate.x = gate.target.x; gate.z = gate.target.z - 1; gate.altitude = gate.target.y * 3.28084;
gate.previous = { x:gate.x,z:gate.z,y:gate.meters };gate.targetDistance = 1;
gate.director.update(1 / 60, gate); assert.equal(gate.rings, 0);
gate.z += 2;gate.director.update(1 / 60, gate);assert.equal(gate.rings, 1);
const rescue = flight(1);rescue.director.phase = 'rescue';rescue.roll = 0;rescue.speed = 130;rescue.targetDistance = 10;rescue.altitude = rescue.target.y * 3.28084;
rescue.director.update(.8,rescue);assert.equal(rescue.rescueDwell,.8);
rescue.roll = .6;rescue.director.update(.1,rescue);assert.equal(rescue.rescueDwell,0,'rescue deployment requires one continuous stable pass');
rescue.roll = 0;rescue.director.update(.7,rescue);assert.equal(rescue.director.phase,'rescue');
rescue.director.update(.6,rescue);assert.equal(rescue.director.phase,'landing');assert.equal(rescue.score,1800);
const touchdown = flight(2);Object.assign(touchdown,{x:0,z:4200,altitude:110,speed:90,verticalSpeed:-2});touchdown.checkTouchdown();
assert(touchdown.landed && touchdown.event === 'landed');const landedScore = touchdown.score;step(touchdown,2);assert.equal(touchdown.score,landedScore);
const diversion=flight();Object.assign(diversion,{x:0,z:4200,altitude:110,speed:90,verticalSpeed:-2,flaps:true,fuel:0});diversion.checkTouchdown();
assert(diversion.landed&&diversion.status==='diverted','an emergency landing must save the aircraft without completing unfinished objectives');
assert.equal(new FlightModel(new URLSearchParams('shot=invalid')).showcase,'');

// Fly each sortie from its real start through the same physics the browser uses.
// The test pilot only supplies controls: it never moves the aircraft or advances objectives.
function flySortie(index) {
  const m = flight(index);
  for (let frame = 0; frame < 240 * 60 && !m.crashed && !m.landed; frame++) {
    const c = neutral();
    const landing = m.director.phase === 'landing';
    const target = m.target;
    const driftCorrection = Math.atan2(m.crosswind * 2, m.speed * .5144) * 180 / Math.PI;
    // Fly straight through the rescue envelope; circling its centre interrupts the pod.
    const rescuePass = m.director.phase === 'rescue' && m.targetDistance < 350;
    const bearing = landing ? clamp(-m.x * .14, -30, 30) - driftCorrection
      : rescuePass ? clamp((target.x - m.x) * .085, -15, 15) - driftCorrection : m.targetBearing;
    const error = ((bearing - m.heading + 540) % 360) - 180;
    c.roll = clamp(error * .085, -.6, .6);
    const targetSpeed = landing ? (m.meters > 120 ? 108 : 87) : index === 1 ? 138 : 142;
    const desiredThrottle = (targetSpeed - 55 + (m.flaps ? 20 : 0) + m.pitch * 90) / 133;
    c.throttle = clamp((desiredThrottle - m.throttle) * 10, -1, 1);
    if (landing && !m.flaps) c.flap = true;
    const desiredY = landing ? WORLD.runway.elevation + 2 : target.y;
    let sink = landing ? (m.meters > 62 ? -Math.min(13, m.speed * .5144 * .20) : -2.4) : clamp((desiredY - m.meters) / Math.max(3, m.targetDistance / (m.speed * .5144) * .7), -13, 13);
    if (landing && m.z < 3800) sink = Math.max(sink, -(m.meters - 49) / Math.max(1, (3800 - m.z) / (m.speed * .5144)));
    const desiredPitch = Math.asin(clamp(sink / (m.speed * .5144), -.21, .21));
    c.pitch = clamp(desiredPitch / .22, -1, 1);
    m.update(1 / 60, c);
  }
  assert(m.landed, `sortie ${index + 1} failed: ${JSON.stringify({ phase:m.status, x:m.x,z:m.z,alt:m.altitude,sink:m.verticalSpeed,reason:m.crashReason,rings:m.rings })}`);
  assert(m.score > 2000 && m.fuel < 88 && m.status === 'complete');
  if(index < 2) assert.equal(m.rings, 2);
  if(index === 1) assert(m.rescueDwell >= 1.2);
  console.log(`Sortie ${index + 1}: completed through controls in ${m.elapsed.toFixed(1)}s; score ${m.score}; fuel ${m.fuel.toFixed(1)}%; landing ${Math.round(m.landingScore * 100)}%`);
}
for (let i = 0; i < 3; i++) flySortie(i);

await withBrowser(async ({ context, origin }) => {
  const page = await openGame(context, origin);
  const state = () => page.evaluate(async () => { const { model:m } = await import('./src/main.js'); return { started:m.started,index:m.director.index,paused:m.paused,flaps:m.flaps,throttle:m.throttle,altitude:m.altitude,muted:m.muted,elapsed:m.elapsed }; });
  await page.keyboard.press('3'); await page.waitForFunction(async () => (await import('./src/main.js')).model.director.index === 2);
  assert.equal((await state()).started, false);
  await page.keyboard.press('Enter'); await page.waitForFunction(async () => (await import('./src/main.js')).model.started);
  assert.equal((await state()).flaps, true);
  await page.keyboard.press('Space'); await page.waitForFunction(async () => (await import('./src/main.js')).model.paused);
  const beforePause = await state(); await page.waitForTimeout(120); assert.equal((await state()).altitude, beforePause.altitude);
  await page.keyboard.press('Space'); await page.keyboard.press('f'); await page.waitForFunction(async () => !(await import('./src/main.js')).model.flaps);
  const beforeThrottle = await state(); await page.keyboard.down('w'); await page.waitForTimeout(350); await page.keyboard.up('w'); assert((await state()).throttle > beforeThrottle.throttle);
  await page.keyboard.press('m'); await page.waitForFunction(async () => (await import('./src/main.js')).model.muted);
  await page.keyboard.press('r'); await page.waitForFunction(async () => {const m=(await import('./src/main.js')).model;return m.flaps&&m.elapsed<1;});
  await page.keyboard.press('Escape'); await page.waitForFunction(async () => !(await import('./src/main.js')).model.started);
  await page.mouse.click(500,280); await page.waitForFunction(async () => (await import('./src/main.js')).model.director.index === 0);
  await page.keyboard.press('Enter'); await page.keyboard.down('ArrowRight');
  await page.waitForFunction(async () => (await import('./src/main.js')).model.roll > .15, null, { timeout: 5000 });
  await page.keyboard.up('ArrowRight');
  await page.mouse.move(800,390); await page.mouse.down(); await page.waitForTimeout(150); await page.mouse.up();
  assert((await state()).started);
  console.log('Chrome: menu, keyboard and pointer flight, throttle, flaps, pause, retry, mute, local module loading; no runtime errors or external requests');
  await page.close();
});
console.log('All flight and browser checks passed.');
