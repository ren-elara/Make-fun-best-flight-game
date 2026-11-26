import { MISSIONS, lerp } from './config.js';

export class MissionDirector {
  constructor() { this.reset(); }
  reset() { this.index = 0; this.phase = 'briefing'; this.objective = 1; this.message = 'Select a sortie'; this.flash = 0; }
  get mission() { return MISSIONS[this.index % MISSIONS.length]; }
  launch(index = this.index) {
    this.index = index % MISSIONS.length; this.phase = 'beacon'; this.objective = 1;
    this.message = this.mission.briefing; this.flash = 4;
  }
  setShowcase(kind) {
    if (kind === 'landing') { this.index = 2; this.phase = 'landing'; this.objective = 3; this.message = 'Runway 36 // flaps down, wings level, 90 knots'; }
    else if (kind === 'storm') { this.index = 1; this.phase = 'rescue'; this.objective = 2; this.message = 'Survivors ahead // fly within 190m of the flare'; }
    else { this.index = 0; this.phase = 'beacon'; this.objective = kind === 'beacon' ? 2 : 1; this.message = 'Thread the amber gates, then return to Aster Ridge.'; }
  }
  update(dt, flight) {
    this.flash = Math.max(0, this.flash - dt);
    if (this.phase === 'beacon') {
      const target = flight.target;
      const before = flight.previous;
      const crossing = before.z < target.z && flight.z >= target.z;
      const fraction = crossing ? (target.z - before.z) / (flight.z - before.z) : 0;
      const offset = Math.hypot(lerp(before.x, flight.x, fraction) - target.x, lerp(before.y, flight.meters, fraction) - target.y);
      if (crossing && offset < target.radius) {
        flight.rings++; flight.score += 1000 + Math.round((1 - offset / target.radius) * 200 + (1 - Math.min(1, Math.abs(flight.roll))) * 100);
        flight.event = 'gate';
        this.flash = 4;
        if (flight.rings >= 2) {
          this.phase = this.index === 1 ? 'rescue' : 'landing'; this.objective = this.index === 1 ? 2 : 3;
          this.message = this.phase === 'rescue' ? 'Flare located. Fly close and level to deploy rescue pod.' : 'Gates cleared. Descend to Aster Ridge. Runway 36.';
        } else { this.objective = 2; this.message = 'Precision gate cleared. Follow the next amber marker.'; }
      } else if (flight.z > target.z + 500) {
        this.message = 'Gate missed. Turn back toward the amber bearing marker.';
      }
    } else if (this.phase === 'rescue') {
      const close = flight.targetDistance < 190 && Math.abs(flight.meters - flight.target.y) < 95;
      const stable = close && Math.abs(flight.roll) < .4 && flight.speed >= flight.stallSpeed + 5 && flight.speed < 160;
      flight.rescueDwell = stable ? flight.rescueDwell + dt : 0;
      this.message = close ? (stable ? 'Hold level. Rescue pod deploying…' : 'Rescue pass: wings level, 90–159 knots, near the flare.') : 'Fly within 190m of the flare at 804 feet. Hold level for 1.2 seconds.';
      if (flight.rescueDwell >= 1.2) {
        this.phase = 'landing'; this.objective = 3; this.flash = 5; flight.score += 1800;
        flight.event = 'rescue';
        this.message = 'Rescue pod deployed. Survivors safe. Return to runway 36.';
      }
    }
  }
}
