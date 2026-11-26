export const VIEW = Object.freeze({ width: 1280, height: 720, horizon: 300 });

export const COLORS = Object.freeze({
  ink: '#08141e', navy: '#0b2130', cyan: '#83f4e4', mint: '#c4ffe9', amber: '#ffc76b', coral: '#ff806e',
  cloud: '#d9f6ef', ocean: '#174b60', oceanDeep: '#0b3048', land: '#27564c', landLight: '#55816a', snow: '#c9e8de',
});

export const MISSIONS = Object.freeze([
  { id: 'LANTERN', number: '01', name: 'LANTERN RUN', call: 'Guide medicine through the cloud shelf.', type: 'BEACON', destination: 'Morrow Cay', weather: 'CLEAR', cargo: 42, fuel: 78, briefing: 'Thread the amber ring. Keep the crate level.' },
  { id: 'WHITEWING', number: '02', name: 'WHITEWING RELAY', call: 'A flare is burning above the squall line.', type: 'RESCUE', destination: 'Whitewing Shelf', weather: 'STORM', cargo: 18, fuel: 64, briefing: 'Find the flare, then return before the storm closes.' },
  { id: 'NIGHTGLASS', number: '03', name: 'NIGHTGLASS APPROACH', call: 'Bring the courier home to the ridge strip.', type: 'LANDING', destination: 'Aster Ridge', weather: 'DUSK', cargo: 12, fuel: 52, briefing: 'Line up on runway 36. Touch down soft and straight.' },
]);

export const WORLD = Object.freeze({
  runway: { x: 0, z: 4300, elevation: 32, length: 840, width: 90, heading: 0 },
  islands: [
    { x: -1700, z: 2200, radius: 1400, height: 1150, seed: 2 },
    { x: 1700, z: 3200, radius: 1430, height: 1490, seed: 7 },
    { x: 0, z: 4400, radius: 930, height: 32, flat: true, seed: 1 },
    { x: -2400, z: 6500, radius: 2100, height: 1900, seed: 5 },
    { x: 2600, z: 8100, radius: 2600, height: 2310, seed: 9 },
    { x: -4500, z: 11300, radius: 2900, height: 2200, seed: 4 },
    { x: 800, z: 14000, radius: 3200, height: 2700, seed: 8 },
  ],
});

export function terrainHeight(x, z) {
  let height = 0;
  for (const island of WORLD.islands) {
    const dx = (x - island.x) / island.radius;
    const dz = (z - island.z) / (island.radius * .85);
    const distance = Math.hypot(dx, dz);
    if (distance >= 1) continue;
    if (island.flat) height = Math.max(height, 32 * clamp((1 - distance) / .14, 0, 1));
    else {
      const ridge = .73 + .18 * Math.sin(dx * 11 + island.seed) * Math.cos(dz * 9) + .09 * Math.sin(dz * 21 + dx * 8);
      height = Math.max(height, Math.pow(1 - distance, 1.15) * island.height * ridge);
    }
  }
  return height;
}

export const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
export const lerp = (a, b, amount) => a + (b - a) * amount;
export const smooth = (value) => value * value * (3 - 2 * value);
export const fmt = (value, digits = 0) => Number(value).toFixed(digits).padStart(digits ? digits + 2 : 3, '0');
