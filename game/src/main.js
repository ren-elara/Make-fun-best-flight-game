/* Input and fixed-step runtime; the public flight state is read-only to callers. */
(() => {
  'use strict';
  const A = globalThis.Aurelia;
  const canvas = document.getElementById('flight');
  const renderer = new A.FlightRenderer(canvas);
  const hud = new A.FlightHud();
  const audio = new A.FlightAudio();
  let state = A.createFlight(0);
  const keys = new Set();
  let mouse = false, mouseX = 0, mouseY = 0;
  let last = performance.now(), accumulator = 0;
  let frameCount = 0, hudElapsed = 0;

  function select(mission) {
    keys.clear();
    state = A.createFlight(mission);
    mouse = false;
    hud.select(mission);
    hud.update(state, mouse);
    renderer.render(state);
  }

  function launch() {
    if (state.status !== 'briefing') return;
    state.status = 'flying';
    keys.clear();
    accumulator = 0;
    last = performance.now();
    hud.update(state, mouse);
    canvas.focus({ preventScroll: true });
  }

  function pause() {
    if (state.status === 'flying') state.status = 'paused';
    else if (state.status === 'paused') state.status = 'flying';
    keys.clear();
    accumulator = 0;
    hud.update(state, mouse);
  }

  document.getElementById('launch').addEventListener('click', launch);
  document.getElementById('resume').addEventListener('click', pause);
  document.getElementById('retry').addEventListener('click', () => { select(state.mission); launch(); });
  for (const id of ['dispatch', 'return']) document.getElementById(id).addEventListener('click', () => select(state.mission));
  for (const button of document.querySelectorAll('[data-mission]')) button.addEventListener('click', () => select(Number(button.dataset.mission)));
  document.getElementById('sound').addEventListener('click', async (event) => {
    try {
      const enabled = await audio.toggle();
      event.target.textContent = enabled ? 'SOUND ON' : 'SOUND OFF';
      event.target.setAttribute('aria-pressed', String(enabled));
      event.target.setAttribute('aria-label', enabled ? 'Disable engine audio' : 'Enable engine audio');
    } catch { event.target.textContent = 'AUDIO UNAVAILABLE'; }
  });

  const controlled = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'KeyW', 'KeyS', 'KeyA', 'KeyD', 'KeyB', 'KeyG', 'KeyP', 'KeyR', 'KeyV', 'KeyM', 'Escape']);
  addEventListener('keydown', (event) => {
    if (controlled.has(event.code)) event.preventDefault();
    keys.add(event.code);
    if (event.repeat) return;
    if (event.code === 'Enter' && state.status === 'briefing') launch();
    else if (event.code === 'KeyP' || event.code === 'Escape') pause();
    else if (event.code === 'KeyR') { select(state.mission); launch(); }
    else if (event.code === 'KeyG' && state.status === 'flying') state.gear = !state.gear;
    else if (event.code === 'KeyV') renderer.close = !renderer.close;
    else if (event.code === 'KeyM' && state.status === 'flying') { mouse = !mouse; mouseX = mouseY = 0; }
    else if (state.status === 'briefing' && /^Digit[123]$/.test(event.code)) select(Number(event.code.slice(-1)) - 1);
  });
  addEventListener('keyup', (event) => keys.delete(event.code));
  addEventListener('blur', () => { keys.clear(); if (state.status === 'flying') pause(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden && state.status === 'flying') pause(); });
  addEventListener('resize', () => { renderer.resize(); renderer.render(state); });
  canvas.addEventListener('click', () => { if (state.status === 'flying') { mouse = !mouse; mouseX = mouseY = 0; } });
  canvas.addEventListener('mousemove', (event) => {
    if (!mouse) return;
    mouseX = A.clamp((event.clientX / innerWidth - .5) * 2.5, -1, 1);
    mouseY = A.clamp((.5 - event.clientY / innerHeight) * 2.5, -1, 1);
  });

  function controls() {
    const axis = (positive, negative) => Number(keys.has(positive)) - Number(keys.has(negative));
    return { roll: A.clamp(axis('ArrowRight', 'ArrowLeft') + (mouse ? mouseX : 0), -1, 1),
      pitch: A.clamp(axis('ArrowUp', 'ArrowDown') + (mouse ? mouseY : 0), -1, 1),
      yaw: axis('KeyD', 'KeyA'), throttle: axis('KeyW', 'KeyS'), brake: keys.has('KeyB') };
  }

  function animate(now) {
    const elapsed = Math.min(.1, Math.max(0, (now - last) / 1000));
    last = now;
    if (state.status === 'flying') {
      accumulator += elapsed;
      while (accumulator >= 1 / 60) { A.stepFlight(state, controls(), 1 / 60); accumulator -= 1 / 60; }
    } else accumulator = 0;
    renderer.render(state);
    frameCount++;
    hudElapsed += elapsed;
    if (hudElapsed >= .08 || state.status !== hud.lastStatus) { hud.update(state, mouse); hudElapsed = 0; }
    audio.update(state);
    requestAnimationFrame(animate);
  }

  // Diagnostics return copies and expose no teleport, invulnerability, or screenshot-only scene.
  A.runtime = Object.freeze({ snapshot: () => ({ ...state, mouse, closeCamera: renderer.close, frameCount }),
    terrainPolygons: () => renderer.polygons.length });
  select(0);
  requestAnimationFrame(animate);
})();
