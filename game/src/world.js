/* Original Lantern archipelago: metres, Y up, north along positive Z. */
(() => {
  'use strict';
  const A = globalThis.Aurelia = globalThis.Aurelia || {};
  const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
  const mix = (a, b, t) => a + (b - a) * t;
  const angle = (radians) => Math.atan2(Math.sin(radians), Math.cos(radians));
  const runway = { x: 0, z: 5000, y: 32, width: 72, length: 1360, heading: 0 };
  const islands = [
    { x: -1550, z: 850, height: 680, spread: 850 },
    { x: 1500, z: 1900, height: 930, spread: 1050 },
    { x: -1650, z: 3500, height: 840, spread: 1020 },
    { x: 1350, z: 5150, height: 650, spread: 760 },
    { x: -2600, z: 6800, height: 1150, spread: 1100 },
    { x: 2550, z: -900, height: 550, spread: 800 },
  ];

  function terrain(x, z) {
    let height = -38;
    for (const island of islands) {
      const d = Math.hypot((x - island.x) / island.spread, (z - island.z) / island.spread);
      const ridge = island.height * Math.exp(-d * d * 1.4) - 60;
      height = Math.max(height, ridge);
    }
    height += Math.sin(x * .006 + z * .002) * Math.cos(z * .004) * Math.max(0, height) * .11;
    const field = Math.max(Math.abs(x) / 390, Math.abs(z - runway.z) / 1100);
    if (field < 1.25) height = mix(runway.y, height, clamp((field - .85) / .4, 0, 1));
    return Math.max(-38, height);
  }

  const gate = (x, y, z, radius = 115, kind = 'relay') => ({ x, y, z, radius, kind });
  const contracts = [
    { name: 'The light relay', sector: 'LANTERN COAST', dusk: false, fuel: 100, time: 200,
      description: 'Thread four relay gates, then land at Lantern Field. Use smooth turns to preserve your fuel and cargo.',
      start: { x: 0, y: 360, z: -500, speed: 68, heading: 0 },
      gates: [gate(0, 360, 650), gate(-280, 330, 1850), gate(120, 280, 3050), gate(0, 135, 3900, 95)] },
    { name: 'Whitewing rescue', sector: 'WHITEWING CHANNEL', dusk: false, fuel: 82, time: 215,
      description: 'Reach the weather crew in Whitewing Channel. Cross the blue rescue gate at 36–58 m/s, then bring them home.',
      start: { x: 80, y: 320, z: 450, speed: 65, heading: 0 },
      gates: [gate(80, 320, 1300), gate(240, 165, 2400, 100, 'rescue'), gate(0, 135, 3750, 95)] },
    { name: 'Nightglass return', sector: 'NIGHTGLASS APPROACH', dusk: true, fuel: 34, time: 115,
      description: 'Follow the lit approach through dusk. You are already on final: lower the gear, manage the descent, land, and brake.',
      start: { x: 0, y: 170, z: 3150, speed: 55, heading: 0 },
      gates: [gate(0, 140, 3550, 85), gate(0, 105, 4050, 65)] },
  ];

  function targetFor(state) {
    return contracts[state.mission].gates[state.gate] || { x: runway.x, y: runway.y + 3, z: runway.z - runway.length / 2 + 200, kind: 'runway' };
  }

  function onRunway(x, z) {
    return Math.abs(x - runway.x) <= runway.width / 2 && Math.abs(z - runway.z) <= runway.length / 2;
  }

  Object.assign(A, { clamp, mix, angle, runway, islands, terrain, contracts, targetFor, onRunway });
})();
