import { WORLD, terrainHeight, clamp, lerp } from './config.js';
import { MissionDirector } from './missions.js';

const radians = Math.PI / 180;
const wrap = (angle) => ((angle + 540) % 360) - 180;

export class FlightModel {
  constructor(search = new URLSearchParams()) {
    this.director = new MissionDirector();
    const shot = search.get('shot');
    this.showcase = ['coast', 'storm', 'beacon', 'landing', 'briefing'].includes(shot) ? shot : '';
    this.paused = false;
    this.started = !!this.showcase && this.showcase !== 'briefing';
    this.best = 0;
    try { this.best = Number(localStorage.getItem('aurelia-best')) || 0; } catch {}
    this.reset();
    if (this.showcase) this.setShowcase(this.showcase);
  }
  reset() {
    Object.assign(this, {
      x: 0, z: 0, altitude: 2100, heading: 0, speed: 148, throttle: 0.62,
      roll: 0, pitch: 0, yaw: 0, fuel: 88, damage: 0, distance: 0,
      crosswind: 0.12, landingScore: 0, flaps: false, elapsed: 0, crashed: false,
      landed: false, verticalSpeed: 0, score: 0, rings: 0, rescueDwell: 0,
      totalTime: 0, cargoIntegrity: 100, crashReason: '', loadFactor: 1, gust: 0,
      stallSpeed: 79, stalled: false, flapStress: false, event: '',
    });
    this.targetDistance = 2500;
    this.director.reset();
  }
  get mission() { return this.director.mission; }
  get meters() { return this.altitude / 3.28084; }
  get agl() { return Math.max(0, this.meters - terrainHeight(this.x, this.z)); }
  get target() {
    if (this.director.phase === 'landing' || this.director.phase === 'complete') return { x: 0, z: 4040, y: 35, radius: 55 };
    if (this.director.phase === 'rescue') return { x: -420, z: 3200, y: 245, radius: 190 };
    const route = this.director.index === 1
      ? [{ x: -330, z: 1450, y: 600, radius: 155 }, { x: -480, z: 2340, y: 400, radius: 145 }]
      : [{ x: 70, z: 1450, y: 560, radius: 165 }, { x: -170, z: 2450, y: 285, radius: 155 }];
    return route[Math.min(this.rings, route.length - 1)];
  }
  get targetBearing() { const t = this.target; return (Math.atan2(t.x - this.x, t.z - this.z) / radians + 360) % 360; }
  get bearingError() { return wrap(this.targetBearing - this.heading); }
  get weather() { return this.mission.weather; }
  get status() { return this.crashed ? 'crashed' : this.director.phase; }
  get engineOut() { return this.fuel <= 0; }
  get warning() {
    if (this.engineOut) return 'ENGINE OUT · GLIDE AT 85 KT';
    if (this.stalled) return 'STALL · LOWER NOSE / ADD POWER';
    if (this.flapStress) return 'FLAP OVERSPEED · SLOW BELOW 130 KT';
    if (this.damage > .65) return 'HULL CRITICAL · FLY GENTLY';
    if (this.agl < 85 && !this.landed && this.director.phase !== 'landing') return 'TERRAIN · CLIMB';
    if (this.fuel < 15) return 'LOW FUEL · RETURN TO STRIP';
    return '';
  }
  setShowcase(kind) {
    this.reset(); this.started = kind !== 'briefing'; this.showcase = kind;
    this.director.setShowcase(kind);
    if (kind === 'coast') Object.assign(this, { x: -150, z: 350, heading: 11, roll: -0.12, pitch: -.02, altitude: 2040, score: 0, fuel: 76, verticalSpeed: -1.8 });
    if (kind === 'storm') Object.assign(this, { x: -530, z: 2180, heading: 3, altitude: 1450, speed: 134, throttle: 0.72, roll: 0.12, pitch: -0.025, fuel: 42, damage: 0.18, score: 2460, rings: 2, verticalSpeed: -4.5 });
    if (kind === 'beacon') Object.assign(this, { x: -100, z: 2040, heading: 355, altitude: 1110, speed: 139, throttle: 0.55, roll: -0.15, pitch: -0.035, fuel: 66, score: 1250, rings: 1, verticalSpeed: -5.2 });
    if (kind === 'landing') Object.assign(this, { x: 10, z: 3070, heading: 359, altitude: 360, speed: 96, throttle: 0.3, roll: 0.02, pitch: -0.025, fuel: 45, damage: 0.07, score: 0, rings: 0, flaps: true, verticalSpeed: -2.1 });
    this.loadFactor = 1 / Math.cos(this.roll);
    this.stallSpeed = (this.flaps ? 62 : 76) * Math.sqrt((1 + this.mission.cargo / 420) * this.loadFactor);
    this.crosswind = this.weather === 'STORM' ? .9 : .3;
    this.previous = { x: this.x, z: this.z, y: this.meters };
    this.targetDistance = Math.hypot(this.target.x - this.x, this.target.z - this.z);
  }
  launch(index = this.director.index) {
    this.reset(); this.showcase = ''; this.started = true; this.paused = false; this.director.launch(index);
    this.fuel = this.mission.fuel;
    if (index === 1) this.altitude = 2200;
    if (index === 2) {
      this.z = 2100; this.altitude = 760; this.speed = 112; this.throttle = 0.32; this.flaps = true;
      this.director.phase = 'landing'; this.director.objective = 3;
      this.director.message = 'Runway 36. Gear fixed. Flaps down. Descend at 90 knots.';
    }
    this.previous = { x: this.x, z: this.z, y: this.meters };
    this.targetDistance = Math.hypot(this.target.x - this.x, this.target.z - this.z);
  }
  update(dt, controls) {
    if (!this.started || this.paused || this.crashed || this.landed) return;
    this.previous = { x: this.x, z: this.z, y: this.meters };
    this.event = '';
    this.elapsed += dt; this.totalTime += dt;
    if (controls.flap) this.flaps = !this.flaps;
    const mass = 1 + this.mission.cargo / 420;
    const responsiveness = clamp(this.speed / 115, 0.35, 1.35) / mass;
    this.roll = clamp(lerp(this.roll, controls.roll * 0.85, dt * 2.4 * responsiveness), -1.12, 1.12);
    this.pitch = clamp(lerp(this.pitch, controls.pitch * 0.22, dt * 1.65 * responsiveness), -0.38, 0.36);
    this.yaw = lerp(this.yaw, controls.yaw * 0.32, dt * 3);
    this.throttle = clamp(this.throttle + controls.throttle * dt * 0.25, 0, 1);
    this.loadFactor = 1 / Math.max(.42, Math.cos(this.roll));
    this.stallSpeed = (this.flaps ? 62 : 76) * Math.sqrt(mass * this.loadFactor);
    this.stalled = this.speed < this.stallSpeed;
    this.flapStress = this.flaps && this.speed > 130;
    if (this.engineOut) this.throttle = 0;
    const targetSpeed = this.engineOut
      ? 86 - this.pitch * 145 - (this.flaps ? 14 : 0) - this.damage * 8
      : 55 + this.throttle * 133 * (1 - this.damage * .18) - (this.flaps ? 20 : 0) - this.pitch * 90 - (this.loadFactor - 1) * 5;
    this.speed = lerp(this.speed, targetSpeed, dt * 0.5 / mass);
    const turn = Math.tan(this.roll) * 10 * (130 / Math.max(70, this.speed)) + this.yaw * 12;
    this.heading = (this.heading + turn * dt + 360) % 360;
    const liftLoss = Math.max(0, Math.abs(this.roll) - .35) * 3.1;
    const storm = this.weather === 'STORM';
    this.gust = storm ? Math.sin(this.elapsed * 1.7) * .55 + Math.sin(this.elapsed * 3.3) * .25 : 0;
    const targetVertical = Math.sin(this.pitch) * this.speed * .5144 - liftLoss - (this.stalled ? 9 : 0)
      - (this.engineOut ? 2.8 + (this.flaps ? 1.2 : 0) : 0) - this.damage * .6 + this.gust;
    this.verticalSpeed = lerp(this.verticalSpeed, targetVertical, dt * 1.5);
    this.altitude = Math.max(0, this.altitude + this.verticalSpeed * 3.28084 * dt);
    this.crosswind = (storm ? .8 : .25) + Math.sin(this.elapsed * .17 + 2) * (storm ? .35 : .09);
    const velocity = this.speed * .5144;
    this.x += (Math.sin(this.heading * radians) * velocity + this.crosswind * 2) * dt;
    this.z += Math.cos(this.heading * radians) * velocity * dt;
    this.distance += velocity * dt;
    if (!this.engineOut) this.fuel = clamp(this.fuel - (.08 + this.throttle * .24) * mass * (1 + (this.loadFactor - 1) * .15) * dt, 0, 100);
    const stress = this.loadFactor > 1.4 || this.speed > 193 || this.stalled || this.flapStress;
    if (stress) {
      this.damage = clamp(this.damage + dt * (this.flapStress ? .018 : .007), 0, 1);
      this.cargoIntegrity = clamp(this.cargoIntegrity - dt * (this.stalled ? 1.2 : .8), 0, 100);
    }
    this.targetDistance = Math.hypot(this.target.x - this.x, this.target.z - this.z);
    this.director.update(dt, this);
    this.targetDistance = Math.hypot(this.target.x - this.x, this.target.z - this.z);
    this.checkTouchdown();
    if (this.engineOut) this.throttle = 0;
    if (this.damage >= 1) this.crash('Structural limit exceeded. Reduce speed and steep banks.');
    if (this.status === 'complete' && this.score > this.best) {
      this.best = this.score;
      try { localStorage.setItem('aurelia-best', String(this.best)); } catch {}
    }
  }
  checkTouchdown() {
    if (this.landed || this.crashed || this.agl > 3) return;
    const strip = WORLD.runway;
    const onStrip = Math.abs(this.x - strip.x) < strip.width / 2 && Math.abs(this.z - strip.z) < strip.length / 2;
    const straight = Math.abs(wrap(this.heading)) < 12 && Math.abs(this.roll) < .14;
    if (onStrip && straight && this.speed <= 110 && this.speed >= 65 && this.verticalSpeed <= .5 && this.verticalSpeed > -3.8 && this.flaps) {
      const completed = this.director.phase === 'landing';
      this.landed = true; this.altitude = (strip.elevation + 2) * 3.28084;
      this.landingScore = clamp(1 - Math.abs(this.verticalSpeed) / 7, .35, 1);
      this.score += Math.round(completed ? this.landingScore * 1600 + this.fuel * 12 + this.cargoIntegrity * 8 : this.landingScore * 600);
      this.director.phase = completed ? 'complete' : 'diverted'; this.director.objective = completed ? 4 : 0;
      this.director.message = completed ? 'Cargo safe. Courier home. Sortie complete.' : 'Safe diversion. Mission unfinished. Retry to complete the delivery.';
      this.event = 'landed';
    } else this.crash(onStrip ? 'Hard landing. Flaps down, wings level, 65–110 knots, sink under 750 ft/min.' : 'Terrain impact. Follow the navigation marker and watch radar altitude.');
  }
  crash(reason) { this.crashed = true; this.crashReason = reason; this.event = 'crashed'; }
  resume() { this.paused = false; }
}
