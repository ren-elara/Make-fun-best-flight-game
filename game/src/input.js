export class FlightInput {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.pointer = { active: false, x: 0.5, y: 0.5 };
    this.justPressed = new Set();
    addEventListener('keydown', (event) => {
      const key = event.key.toLowerCase();
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' ', 'w', 'a', 's', 'd', 'q', 'e', 'f', 'enter', 'escape', 'r', '1', '2', '3', 'm'].includes(key)) event.preventDefault();
      if (!this.keys.has(key)) this.justPressed.add(key);
      this.keys.add(key);
    });
    addEventListener('keyup', (event) => this.keys.delete(event.key.toLowerCase()));
    addEventListener('blur', () => { this.keys.clear(); this.justPressed.clear(); this.pointer.active = false; });
    const locate = (event) => {
      const rect = canvas.getBoundingClientRect();
      this.pointer.x = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
      this.pointer.y = Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height));
    };
    canvas.addEventListener('pointerdown', (event) => { this.pointer.active = true; locate(event); this.tap = { x: this.pointer.x * 1280, y: this.pointer.y * 720 }; canvas.focus(); canvas.setPointerCapture(event.pointerId); });
    canvas.addEventListener('pointermove', locate);
    addEventListener('pointerup', () => { this.pointer.active = false; });
    canvas.addEventListener('pointercancel', () => { this.pointer.active = false; });
  }
  down(...keys) { return keys.some((key) => this.keys.has(key)); }
  pressed(...keys) { return keys.some((key) => this.justPressed.has(key)); }
  sample() {
    const roll = (this.down('a', 'arrowleft') ? -1 : 0) + (this.down('d', 'arrowright') ? 1 : 0);
    const pitch = (this.down('arrowdown') ? 1 : 0) + (this.down('arrowup') ? -1 : 0);
    const throttle = (this.down('w') ? 1 : 0) - (this.down('s') ? 1 : 0);
    const pointerRoll = this.pointer.active ? (this.pointer.x - 0.5) * 2 : 0;
    return { roll: roll || pointerRoll, pitch: pitch || (this.pointer.active ? (this.pointer.y - .5) * .8 : 0), yaw: (this.down('q') ? -1 : 0) + (this.down('e') ? 1 : 0), throttle, flap: this.pressed('f'), pause: this.pressed(' '), launch: this.pressed('enter'), restart: this.pressed('r'), menu: this.pressed('escape'), mute: this.pressed('m') };
  }
  endFrame() { this.justPressed.clear(); this.tap = null; }
}
