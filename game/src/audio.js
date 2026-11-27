/* Synthesized propeller and airflow: no samples, downloads, or autoplay. */
(() => {
  'use strict';
  class FlightAudio {
    constructor() { this.context = null; this.enabled = false; }
    async toggle() {
      if (!this.context) {
        const Audio = globalThis.AudioContext || globalThis.webkitAudioContext;
        if (!Audio) return false;
        this.context = new Audio();
        this.gain = this.context.createGain();
        this.gain.gain.value = 0;
        this.gain.connect(this.context.destination);
        this.motor = this.context.createOscillator();
        this.motor.type = 'sawtooth';
        const filter = this.context.createBiquadFilter();
        filter.type = 'lowpass'; filter.frequency.value = 380;
        this.motor.connect(filter); filter.connect(this.gain); this.motor.start();
      }
      await this.context.resume();
      this.enabled = !this.enabled;
      if (!this.enabled) this.gain.gain.setTargetAtTime(0, this.context.currentTime, .1);
      return this.enabled;
    }
    update(state) {
      if (!this.enabled || !this.context) return;
      const flying = state.status === 'flying';
      this.motor.frequency.setTargetAtTime(35 + state.throttle * 65, this.context.currentTime, .2);
      this.gain.gain.setTargetAtTime(flying ? .012 + state.throttle * .025 : 0, this.context.currentTime, .12);
    }
  }
  globalThis.Aurelia.FlightAudio = FlightAudio;
})();
