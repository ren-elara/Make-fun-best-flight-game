export class FlightAudio {
  constructor() {
    this.context = null; this.engine = null; this.gain = null; this.muted = false;
    this.wind = null; this.windGain = null; this.warningAt = -10;
  }
  engage() {
    if (this.context) { this.context.resume().catch(() => {}); return; }
    try {
      this.context = new AudioContext();
      this.engine = this.context.createOscillator();
      this.gain = this.context.createGain();
      this.engine.type = 'triangle'; this.engine.frequency.value = 92; this.gain.gain.value = 0;
      this.engine.connect(this.gain).connect(this.context.destination); this.engine.start();
      const harmonic=this.context.createOscillator();harmonic.type='sine';harmonic.frequency.value=184;
      const harmonicGain=this.context.createGain();harmonicGain.gain.value=.25;
      harmonic.connect(harmonicGain).connect(this.gain);harmonic.start();this.harmonic=harmonic;
      const buffer=this.context.createBuffer(1,this.context.sampleRate*2,this.context.sampleRate);
      const samples=buffer.getChannelData(0);let seed=47;
      for(let i=0;i<samples.length;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;samples[i]=seed/2147483648-1;}
      this.wind=this.context.createBufferSource();this.wind.buffer=buffer;this.wind.loop=true;
      const filter=this.context.createBiquadFilter();filter.type='lowpass';filter.frequency.value=720;
      this.windGain=this.context.createGain();this.windGain.gain.value=0;
      this.wind.connect(filter).connect(this.windGain).connect(this.context.destination);this.wind.start();
    } catch {
      this.context?.close().catch(() => {});
      this.context = null; this.engine = null;
    }
  }
  toggleMute() { this.muted = !this.muted; }
  tick(model, active = true) {
    if (this.engine) {
      const time=this.context.currentTime,audible=active&&!this.muted;
      const frequency=65+model.speed*.42+model.throttle*25;
      this.engine.frequency.setTargetAtTime(frequency,time,.08);
      this.harmonic.frequency.setTargetAtTime(frequency*2.012,time,.08);
      this.gain.gain.setTargetAtTime(audible && !model.engineOut ? .018 + model.throttle * .022 : 0,time,.12);
      this.windGain.gain.setTargetAtTime(audible ? .012 + model.speed * .00012 + (model.weather==='STORM' ? .025 : 0) : 0,time,.15);
      if(audible&&model.warning&&time-this.warningAt>3){this.warningAt=time;this.tone(245,180,.18,.035);}
    }
  }
  ping(high = false) {
    this.tone(high?660:440,high?880:660,.23,.045);
  }
  cue(event) {
    if(event==='crashed')this.tone(110,32,.65,.07,'sawtooth');
    else if(event==='landed'){this.tone(523,523,.3,.05);this.tone(659,784,.4,.04,'sine',.18);}
    else if(event==='rescue'){this.tone(660,880,.3,.05);this.tone(990,990,.3,.035,'sine',.18);}
    else if(event==='gate')this.ping();
  }
  tone(from,to,duration,volume,type='sine',delay=0) {
    if(!this.context||this.muted)return;
    const start=this.context.currentTime+delay;
    const oscillator=this.context.createOscillator(),gain=this.context.createGain();oscillator.type=type;
    oscillator.frequency.setValueAtTime(from,start);oscillator.frequency.exponentialRampToValueAtTime(to,start+duration);
    gain.gain.setValueAtTime(.001,start);gain.gain.linearRampToValueAtTime(volume,start+.015);gain.gain.exponentialRampToValueAtTime(.001,start+duration);
    oscillator.connect(gain).connect(this.context.destination);oscillator.start(start);oscillator.stop(start+duration+.02);
    oscillator.onended=()=>{oscillator.disconnect();gain.disconnect();};
  }
}
