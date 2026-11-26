import { FlightAudio } from './audio.js';
import { FlightModel } from './flight.js';
import { FlightInput } from './input.js';
import { FlightRenderer } from './render.js';

const canvas = document.querySelector('#flight-canvas');
const announcer = document.querySelector('#screen-reader-status');
const input = new FlightInput(canvas);
const audio = new FlightAudio();
export const model = new FlightModel(new URLSearchParams(location.search));
const renderer = new FlightRenderer(canvas, document.querySelector('#instrument-canvas'));
let last = performance.now(), clock = 0, accumulator = 0, announcementTime = 0;

function launch(index = model.director.index) {
  model.launch(index); audio.engage(); audio.ping(true); accumulator = 0;
}
function frame(now) {
  const dt = Math.min(.2, Math.max(0, (now - last) / 1000)); last = now;
  const controls = input.sample();
  if (!model.started || model.landed || model.crashed) {
    for (let i = 0; i < 3; i++) if (input.pressed(String(i + 1))) {
      if (model.started) launch(i); else { model.director.index = i; audio.engage(); }
    }
  }
  if (!model.started && input.tap) {
    const { x, y } = input.tap;
    if (x >= 174 && x <= 1104 && y >= 258 && y <= 461) model.director.index = Math.min(2, Math.floor((y - 258) / 71));
    else if (y >= 475 && y <= 518) launch();
  }
  if (controls.menu) {
    model.showcase = ''; model.started = false; model.paused = false;
  } else if (controls.launch) {
    if (!model.started || model.crashed) launch();
    else if (model.landed) launch(model.director.phase === 'complete' ? (model.director.index + 1) % 3 : model.director.index);
    else if (model.paused) model.resume();
    else if (model.showcase) launch();
  }
  if (controls.restart && model.started) launch();
  if (controls.pause && model.started && !model.landed && !model.crashed) {
    if (model.showcase) model.showcase = '';
    model.paused = !model.paused;
  }
  if (controls.mute) audio.toggleMute();
  model.muted = audio.muted;
  if (model.started && !model.paused && !model.showcase && !model.crashed && !model.landed) {
    accumulator += dt;
    let first = true;
    while (accumulator >= 1 / 60) {
      model.update(1 / 60, { ...controls, flap: first && controls.flap });
      if (model.event) audio.cue(model.event);
      first = false; accumulator -= 1 / 60; clock += 1 / 60;
      if (model.crashed || model.landed) { accumulator = 0; break; }
    }
    // Keep a discrete flap press even when the display frame precedes the next simulation tick.
    if (first && controls.flap) model.flaps = !model.flaps;
  } else accumulator = 0;
  audio.tick(model, model.started && !model.paused && !model.crashed && !model.landed && !model.showcase);
  renderer.render(model, model.showcase ? 12 : clock);
  announcementTime += dt;
  if (announcementTime > 2) {
    announcer.textContent = `${model.mission.name}; ${Math.round(model.altitude)} feet; ${Math.round(model.speed)} knots; heading ${Math.round(model.heading)}; ${model.crashed ? model.crashReason : model.director.message}`;
    announcementTime = 0;
  }
  document.documentElement.dataset.ready = 'true';
  input.endFrame(); requestAnimationFrame(frame);
}
addEventListener('blur', () => { if (model.started && !model.showcase) model.paused = true; });
document.addEventListener('visibilitychange', () => { if (document.hidden && model.started && !model.showcase) model.paused = true; });
requestAnimationFrame(frame);
